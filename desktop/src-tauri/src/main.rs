#![windows_subsystem = "windows"]

use serde::Serialize;
use std::collections::{HashSet, HashMap};
use std::ffi::{OsStr, OsString};
use std::os::windows::ffi::{OsStrExt, OsStringExt};
use std::sync::{Mutex, OnceLock, Once};
use winapi::shared::minwindef::{BOOL, DWORD, FALSE, FILETIME, LPARAM, LRESULT, WPARAM};
use winapi::shared::windef::{HWND, RECT};
use winapi::um::handleapi::{CloseHandle, INVALID_HANDLE_VALUE};
use winapi::um::tlhelp32::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use winapi::um::winuser::{
    CallNextHookEx, EnumWindows, GetClientRect, GetMessageW, GetWindowTextW,
    GetWindowThreadProcessId, IsWindowVisible, MSLLHOOKSTRUCT, MSG, SetWindowsHookExW,
    SetWindowTextW, UnhookWindowsHookEx, WH_MOUSE_LL, WM_XBUTTONDOWN,
};
use winapi::um::iphlpapi::{GetExtendedTcpTable, SetTcpEntry};
use winapi::shared::tcpmib::{MIB_TCP_STATE_DELETE_TCB, MIB_TCPROW};
use winapi::um::processthreadsapi::{GetProcessTimes, OpenProcess};
use winapi::um::winnt::PROCESS_QUERY_LIMITED_INFORMATION;

#[derive(Serialize, Clone)]
struct Metin2Window {
    hwnd: String,
    title: String,
    exe: String,
    pid: u32,
    width: u32,
    height: u32,
    created_at: u64,
}

fn wide_str(s: &str) -> Vec<u16> {
    OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
}

const TCP_TABLE_OWNER_PID_ALL: DWORD = 5;
const AF_INET_U32: DWORD = 2;

#[repr(C)]
struct TcpRowOwnerPid {
    state: DWORD,
    local_addr: DWORD,
    local_port: DWORD,
    remote_addr: DWORD,
    remote_port: DWORD,
    owning_pid: DWORD,
}

#[repr(C)]
struct TcpTableOwnerPid {
    num_entries: DWORD,
    table: [TcpRowOwnerPid; 1],
}

// ── Mouse hook globals ────────────────────────────────────────────────────────

static MOUSE_BINDINGS: OnceLock<Mutex<HashMap<u8, Vec<u32>>>> = OnceLock::new();
static MOUSE_HOOK_STARTED: Once = Once::new();
// Whitelist of PIDs excluded from the "close all" mouse action
static CLOSEALL_WHITELIST: OnceLock<Mutex<Vec<u32>>> = OnceLock::new();
// Sentinel PID meaning "close all metin2 processes (except whitelist)"
const CLOSEALL_PID: u32 = u32::MAX;

fn get_mouse_bindings() -> &'static Mutex<HashMap<u8, Vec<u32>>> {
    MOUSE_BINDINGS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn get_closeall_whitelist() -> &'static Mutex<Vec<u32>> {
    CLOSEALL_WHITELIST.get_or_init(|| Mutex::new(Vec::new()))
}

// ── TCP close shared logic ────────────────────────────────────────────────────

fn close_tcp_inner(pid: u32) -> u32 {
    unsafe {
        let mut size: DWORD = 0;
        GetExtendedTcpTable(
            std::ptr::null_mut(), &mut size, 0,
            AF_INET_U32, TCP_TABLE_OWNER_PID_ALL, 0,
        );
        if size == 0 { return 0; }
        size += 1024;

        let mut buf: Vec<u8> = vec![0u8; size as usize];
        let ret = GetExtendedTcpTable(
            buf.as_mut_ptr() as *mut _,
            &mut size, 0, AF_INET_U32,
            TCP_TABLE_OWNER_PID_ALL, 0,
        );
        if ret != 0 { return 0; }

        let table = &*(buf.as_ptr() as *const TcpTableOwnerPid);
        let count = table.num_entries as usize;
        let rows_ptr = &table.table[0] as *const TcpRowOwnerPid;

        let mut closed = 0u32;
        for i in 0..count {
            let row = &*rows_ptr.add(i);
            if row.owning_pid != pid { continue; }
            if row.state == 0 || row.remote_addr == 0 { continue; }

            let mut tcp_row: MIB_TCPROW = std::mem::zeroed();
            tcp_row.State = MIB_TCP_STATE_DELETE_TCB;
            tcp_row.dwLocalAddr = row.local_addr;
            tcp_row.dwLocalPort = row.local_port;
            tcp_row.dwRemoteAddr = row.remote_addr;
            tcp_row.dwRemotePort = row.remote_port;

            let r = SetTcpEntry(&mut tcp_row);
            if r == 0 { closed += 1; }
        }

        closed
    }
}

// ── Low-level mouse hook ──────────────────────────────────────────────────────

unsafe extern "system" fn mouse_hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 && wparam as u32 == WM_XBUTTONDOWN {
        let info = &*(lparam as *const MSLLHOOKSTRUCT);
        let hi = ((info.mouseData >> 16) & 0xFFFF) as u16;
        // hi == 1 → XBUTTON1 (Mouse4), hi == 2 → XBUTTON2 (Mouse5)
        let btn: u8 = if hi == 1 { 3 } else if hi == 2 { 4 } else { 0 };
        if btn != 0 {
            let pids: Vec<u32> = get_mouse_bindings()
                .lock()
                .ok()
                .map(|b| b.get(&btn).cloned().unwrap_or_default())
                .unwrap_or_default();
            if !pids.is_empty() {
                let has_closeall = pids.contains(&CLOSEALL_PID);
                let regular: Vec<u32> = pids.into_iter().filter(|&p| p != CLOSEALL_PID).collect();
                let whitelist: Vec<u32> = if has_closeall {
                    get_closeall_whitelist()
                        .lock()
                        .ok()
                        .map(|w| w.clone())
                        .unwrap_or_default()
                } else {
                    Vec::new()
                };
                std::thread::spawn(move || {
                    for pid in regular { close_tcp_inner(pid); }
                    if has_closeall {
                        for pid in metin2_pids() {
                            if !whitelist.contains(&pid) { close_tcp_inner(pid); }
                        }
                    }
                });
            }
        }
    }
    CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam)
}

fn ensure_mouse_hook() {
    MOUSE_HOOK_STARTED.call_once(|| {
        std::thread::spawn(|| unsafe {
            let hook = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_hook_proc), std::ptr::null_mut(), 0);
            if hook.is_null() { return; }
            let mut msg: MSG = std::mem::zeroed();
            // Message pump keeps the hook alive for the lifetime of the app
            loop {
                let ret = GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0);
                if ret <= 0 { break; }
            }
            UnhookWindowsHookEx(hook);
        });
    });
}

// ── Window enumeration ────────────────────────────────────────────────────────

fn metin2_pids() -> HashSet<DWORD> {
    let mut pids = HashSet::new();
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snap == INVALID_HANDLE_VALUE {
            return pids;
        }
        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;

        if Process32FirstW(snap, &mut entry) != FALSE {
            loop {
                let name = OsString::from_wide(
                    &entry.szExeFile[..entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(260)],
                )
                .to_string_lossy()
                .to_lowercase();

                if name.contains("metin2client") {
                    pids.insert(entry.th32ProcessID);
                }

                if Process32NextW(snap, &mut entry) == FALSE {
                    break;
                }
            }
        }
        CloseHandle(snap);
    }
    pids
}

struct CallbackData {
    pids: HashSet<DWORD>,
    results: Vec<Metin2Window>,
}

unsafe extern "system" fn enum_cb(hwnd: HWND, lparam: LPARAM) -> BOOL {
    if IsWindowVisible(hwnd) == 0 {
        return 1;
    }

    let mut pid: DWORD = 0;
    GetWindowThreadProcessId(hwnd, &mut pid);
    if pid == 0 {
        return 1;
    }

    let data = &mut *(lparam as *mut CallbackData);
    if !data.pids.contains(&pid) {
        return 1;
    }

    let mut buf = [0u16; 256];
    let len = GetWindowTextW(hwnd, buf.as_mut_ptr(), 256);
    if len == 0 {
        return 1;
    }
    let title = OsString::from_wide(&buf[..len as usize])
        .to_string_lossy()
        .into_owned();

    let mut rect: RECT = std::mem::zeroed();
    GetClientRect(hwnd, &mut rect);
    let width  = (rect.right  - rect.left).max(0) as u32;
    let height = (rect.bottom - rect.top ).max(0) as u32;

    data.results.push(Metin2Window {
        hwnd: format!("{}", hwnd as u64),
        title,
        exe: String::from("Metin2Client.exe"),
        pid,
        width,
        height,
        created_at: 0,
    });

    1
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
fn list_metin2_windows() -> Vec<Metin2Window> {
    let mut data = CallbackData {
        pids: metin2_pids(),
        results: Vec::new(),
    };
    unsafe {
        EnumWindows(Some(enum_cb), &mut data as *mut _ as LPARAM);

        // Fill created_at for each window via GetProcessTimes
        for w in &mut data.results {
            let hproc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, w.pid);
            if hproc.is_null() { continue; }
            let mut creation: FILETIME = std::mem::zeroed();
            let mut dummy:    FILETIME = std::mem::zeroed();
            if GetProcessTimes(hproc, &mut creation, &mut dummy, &mut dummy, &mut dummy) != 0 {
                w.created_at = ((creation.dwHighDateTime as u64) << 32) | (creation.dwLowDateTime as u64);
            }
            CloseHandle(hproc);
        }
    }
    // Most recently opened first
    data.results.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    data.results
}

#[tauri::command]
fn focus_window(hwnd: String) -> bool {
    let hwnd_u64: u64 = match hwnd.parse() {
        Ok(v) => v,
        Err(_) => return false,
    };
    unsafe {
        use winapi::um::winuser::{IsIconic, SetForegroundWindow, ShowWindow, SW_RESTORE};
        let h = hwnd_u64 as HWND;
        if IsIconic(h) != 0 {
            ShowWindow(h, SW_RESTORE);
        }
        SetForegroundWindow(h) != 0
    }
}

#[tauri::command]
fn set_window_title(hwnd: String, title: String) -> Result<(), String> {
    let hwnd_u64: u64 = hwnd.parse().map_err(|_| "HWND invalid".to_string())?;
    let wide: Vec<u16> = OsStr::new(&title)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    unsafe {
        if SetWindowTextW(hwnd_u64 as HWND, wide.as_ptr()) != 0 {
            Ok(())
        } else {
            let err = winapi::um::errhandlingapi::GetLastError();
            Err(format!("{}", err))
        }
    }
}

#[tauri::command]
fn is_admin() -> bool {
    unsafe {
        use winapi::shared::ntdef::HANDLE;
        use winapi::um::processthreadsapi::{GetCurrentProcess, OpenProcessToken};
        use winapi::um::securitybaseapi::GetTokenInformation;
        use winapi::um::winnt::{TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};

        let mut token: HANDLE = std::ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return false;
        }
        let mut elevation: TOKEN_ELEVATION = std::mem::zeroed();
        let mut ret_len: u32 = 0;
        let ok = GetTokenInformation(
            token,
            TokenElevation,
            &mut elevation as *mut _ as *mut _,
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut ret_len,
        );
        CloseHandle(token);
        ok != 0 && elevation.TokenIsElevated != 0
    }
}

#[tauri::command]
fn relaunch_as_admin(app: tauri::AppHandle) {
    unsafe {
        use winapi::um::shellapi::ShellExecuteW;
        use winapi::um::winuser::SW_SHOWNORMAL;

        let exe = match std::env::current_exe() {
            Ok(p) => p,
            Err(_) => return,
        };
        let exe_wide = wide_str(exe.to_str().unwrap_or(""));
        let verb = wide_str("runas");

        let result = ShellExecuteW(
            std::ptr::null_mut(),
            verb.as_ptr(),
            exe_wide.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        );

        if result as usize > 32 {
            app.exit(0);
        }
    }
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn close_tcp_for_pid(pid: u32) -> Result<u32, String> {
    Ok(close_tcp_inner(pid))
}

#[tauri::command]
fn close_tcp_all_except(exclude_pids: Vec<u32>) -> u32 {
    let mut total = 0u32;
    for pid in metin2_pids() {
        if !exclude_pids.contains(&pid) {
            total += close_tcp_inner(pid);
        }
    }
    total
}

#[tauri::command]
fn register_mouse_closeall(button: u8) {
    if let Ok(mut bindings) = get_mouse_bindings().lock() {
        let entry = bindings.entry(button).or_insert_with(Vec::new);
        if !entry.contains(&CLOSEALL_PID) {
            entry.push(CLOSEALL_PID);
        }
    }
    ensure_mouse_hook();
}

#[tauri::command]
fn unregister_mouse_closeall(button: u8) {
    if let Ok(mut bindings) = get_mouse_bindings().lock() {
        if let Some(pids) = bindings.get_mut(&button) {
            pids.retain(|&p| p != CLOSEALL_PID);
            if pids.is_empty() { bindings.remove(&button); }
        }
    }
}

#[tauri::command]
fn update_closeall_whitelist(pids: Vec<u32>) {
    if let Ok(mut whitelist) = get_closeall_whitelist().lock() {
        *whitelist = pids;
    }
}

#[tauri::command]
fn register_mouse_bind(button: u8, pid: u32) {
    if let Ok(mut bindings) = get_mouse_bindings().lock() {
        let entry = bindings.entry(button).or_insert_with(Vec::new);
        if !entry.contains(&pid) {
            entry.push(pid);
        }
    }
    ensure_mouse_hook();
}

#[tauri::command]
fn unregister_mouse_bind(button: u8, pid: u32) {
    if let Ok(mut bindings) = get_mouse_bindings().lock() {
        if let Some(pids) = bindings.get_mut(&button) {
            pids.retain(|&p| p != pid);
            if pids.is_empty() {
                bindings.remove(&button);
            }
        }
    }
}

fn main() {
    use tauri::{CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu};

    let tray_menu = SystemTrayMenu::new()
        .add_item(CustomMenuItem::new("show", "Deschide"))
        .add_item(CustomMenuItem::new("exit", "Ieși"));

    tauri::Builder::default()
        .system_tray(
            SystemTray::new()
                .with_menu(tray_menu)
                .with_tooltip("Metin2 Tools"),
        )
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::LeftClick { .. } => {
                if let Some(win) = app.get_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
            SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                "show" => {
                    if let Some(win) = app.get_window("main") {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
                "exit" => {
                    app.exit(0);
                }
                _ => {}
            },
            _ => {}
        })
        .on_window_event(|event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event.event() {
                // Fereastra principala se ascunde in tray; pop-out-urile se inchid normal
                if event.window().label() == "main" {
                    api.prevent_close();
                    let _ = event.window().hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            list_metin2_windows,
            set_window_title,
            focus_window,
            is_admin,
            relaunch_as_admin,
            close_tcp_for_pid,
            close_tcp_all_except,
            register_mouse_bind,
            unregister_mouse_bind,
            register_mouse_closeall,
            unregister_mouse_closeall,
            update_closeall_whitelist,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
