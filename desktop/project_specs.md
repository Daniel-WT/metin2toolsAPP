# Metin2 Tools Pro - Project Specifications

## Overview
A professional, lightweight, and premium desktop suite for Metin2 power users. Designed for real-time boss tracking, inventory management, and team synchronization.

## Tech Stack
- **Core**: React 18 + Vite
- **Desktop Wrapper**: Tauri (Native Rust-based window management)
- **Styling**: Tailwind CSS (Custom Dark Premium Glassmorphism)
- **Database**: Firebase Realtime Database (Instant sync across team members)
- **Authentication**: Firebase Auth + Team-based permission system
- **Icons**: Lucide React
- **Animations**: Framer Motion + Tailwind Animate

## Architecture
- **Multi-Team System**: Users belong to specific teams. Data is scoped at `teams/{teamId}/` in Firebase.
- **Spawn Tracker**: Real-time monitor with countdowns, boss state persistence, and CH-specific tracking.
- **Title Bar**: Custom premium Title Bar with native window controls (Decorations: false).
- **Responsive Layout**: Sidebar-based navigation with a fixed-height content area for professional scrolling.

## Key Modules
1. **Overview (Dashboard)**: Central hub with team activity, stats, and interactive changelog.
2. **Spawn Tracker**: Interactive map, CH time tables, and real-time header monitor.
3. **Inventory**: Resource tracking and management.
4. **Checklist**: Shared tasks for the team.
5. **Transfers**: Scraper and highscore monitoring.

## Responsive Standards
- **Fluid Typography**: Text should scale or adapt based on container width.
- **Adaptive Tables**: Tables must fit within narrow pop-out windows without horizontal scrolling unless absolutely necessary.
- **Min-Width Management**: Avoid large fixed `min-width` values that break narrow layouts.

## Quality Standards
- **Aesthetics**: Dark premium mode, glassmorphism, subtle animations, proper hierarchy.
- **Performance**: Minimal re-renders, high-precision countdowns, lightweight bundles.
- **Versioning**: Systematic semantic versioning (vX.X.X) bumped on every functional/UI change.

## Maintenance Rules
- Always update `CHANGELOG` in `src/modules/Dashboard/index.tsx`.
- Always bump `APP_VERSION` in `js/firebase-layer.js` and `index.html`.
- Maintain this `project_specs.md` as the source of truth for architecture.

## Session History & Milestones
### v6.9.5 - The "Advanced Monitoring" Update (25 Apr 2026)
- **Branding Clean-up**: Removed "Pro" suffix from Title, Tauri Config, package.json, Login, and Dashboard for a cleaner identity.
- **Pop-out System**: Implemented full support for detachable Map, Spawn Table, and Ice Table windows with Always-on-top capability.
- **CH Pop-out (Timp Spawn)**: Created a high-precision monitoring window with a giant next-CH countdown and a 2-column grid for other channels.
- **Interactivity**: Added full interaction support in pop-out windows (Click to set time, Right-Click to toggle "Beaten" status).
- **Fluid Scaling**: Implemented automatic typography and layout scaling for pop-out windows to maintain legibility at micro-sizes.
- **Header Timer Refinement**: Fixed header countdown to show actual time remaining until spawn.
- **Remember Me**: Added email persistence on the login screen with a custom checkmark toggle.
- **Logout System**: Added a dedicated logout button in the Sidebar for rapid account switching.
- **Activity Feed**: Implemented a "Last 5 actions" summary in the dashboard with a "View All" modal history.
- **UI Clean-up**: Removed branding and version footers from pop-out views to maximize screen real estate for data.

### v6.9.6 - The "Responsive Precision" Update (25 Apr 2026)
- **Responsive Ice Table**: Removed fixed min-widths and implemented a fluid, fixed-column layout for the GheataTable.
- **UI Optimization**: Reduced cell padding and shortened labels in Spawn Tracker tables to ensure legibility in narrow pop-out windows.
- **Fluid Layouts**: Established new Responsive Standards in project specs for future component development.

### v6.9.7 - The "Column Calibration" Update (25 Apr 2026)
- **Table Balancing**: Increased width of the CH column and decreased the Rooms column for a better visual balance.
- **Fixed Layout**: Locked column widths in GheataTable to prevent layout shifts.

### v6.9.8 - The "Ultra-Compact" Update (25 Apr 2026)
- **Extreme Column Narrowing**: Reduced the "Camere" column to its absolute minimum (70px) to maximize space for higher resolutions and smaller pop-outs.
- **Table Density**: Optimized the overall table density for ultra-clean look on any screen.

### v6.9.9 - The "Mini-Monitor" Update (25 Apr 2026)
- **Compact CH Pop-out**: Optimized CHPopoutView for ultra-small windows by reducing all spacings and refining typography clamps.
- **Fluid UI**: All pop-out windows now support extreme scaling without losing information.

### v7.0.0 - The "Micro-System" Milestone (25 Apr 2026)
- **Extreme UI Compactness**: Implemented a "Micro-Mode" for all pop-out windows. Spacings reduced to near-zero (1-4px).
- **Simplified Indicators**: Removed text labels like "CH" and "Rămas" in extreme small views to prioritize raw data.
- **Micro-Timer**: Next CH countdown now uses ultra-compact typography and negative margins to fit in tiny headers.
- **Stability**: Confirmed layout integrity across all window sizes from full-screen to widget-size.

### v7.0.1 - The "Contextual UI" Update (25 Apr 2026)
- **Conditional Columns**: The "Pin" column is now hidden automatically in the Ice Table pop-out view to save space.
- **Smart Detection**: Implemented logic to detect pop-out mode via URL parameters.

### v7.0.2 - The "Nano-Table" Update (25 Apr 2026)
- **Extreme Compression**: Reduced pop-out padding in main.tsx (from 16px to 6px) and further squeezed all columns in GheataTable.
- **Adaptive Sizing**: Column widths now change dynamically based on whether the table is in a pop-out or the main dashboard.
- **Micro-Typography**: Reduced CH font size in pop-out mode for maximum clarity in tiny windows.

### v7.0.3 - The "Pixel Perfect" Update (25 Apr 2026)
- **Header Alignment**: Centered the "Camere" column header for better symmetry.
- **CH6 Visibility**: Added bottom padding to the table container to prevent the last row (CH6) from being cut off in micro-windows.

### v7.0.4 - The "Ultra-Slim" Update (25 Apr 2026)
- **Extreme Row Compression**: Reduced vertical padding (from py-3 to py-1) for all cells in pop-out mode.
- **Fixed CH6 Visibility**: Removed the outer bottom padding and compressed row heights to ensure all 6 channels fit in a micro-window without scrolling.

### v7.0.5 - The "Fluid Pop-out" Update (25 Apr 2026)
- **Fluid Proportions**: Switched from fixed pixel widths to percentage-based widths in pop-out mode.
- **Dynamic Growth**: The table now automatically expands or shrinks to fill the entire window width during resize.

### v7.0.6 - The "Perfect Ratio" Update (25 Apr 2026)
- **Ratio Preservation**: Adjusted percentage widths to match the "perfect" compact look identified in feedback.
- **Max-Width Constraint**: Added a `max-w-[500px]` constraint to the table container to prevent it from over-stretching on large monitors while remaining fluid on small ones.

### v7.0.7 - The "2D Scaling" Update (25 Apr 2026)
- **Vertical Scaling**: Rows in the Ice Table pop-out now grow in height based on window height (using h-[14%] per row).
- **Full Screen Fit**: Removed scrolling container for the pop-out to force the table to fill the entire viewport in both directions.

### v7.0.8 - The "Adaptive View" Update (25 Apr 2026)
- **Full-Height Scaling**: The Spawn Time pop-out now utilizes the entire window height.
- **Dynamic Flex**: Implemented a flex-based layout where the big timer and CH grid share the available vertical space (1:2 ratio).
- **Zero Waste**: Eliminated empty black space in large windows by forcing elements to grow and justify.

### v7.0.9 - The "Detail Restore" Update (25 Apr 2026)
- **Info Restoration**: Added back the descriptive "CH x în xx:xx" text in the Spawn Time pop-out header.
- **Fluid Typography**: Used `clamp()` for the restored text to ensure it remains legible and fits in all window sizes.

### v8.0.3 - The "Widget Era" Milestone (25 Apr 2026)
- **Borderless Mode**: Removed native window decorations for all pop-outs.
- **Custom Title Bar**: Implemented hidden drag regions and contextual close buttons.
- **Pure Widget Look**: Removed the "card" container (borders/backgrounds) in Ice Table pop-out for a true floating table effect.
- **2D Scaling**: Both monitoring windows now scale vertically and horizontally to fill the window.

### v8.0.4 - The "Perfect Drag" Update (25 Apr 2026)
- **Selective Interactivity**: Implemented `pointer-events` isolation. Background areas are now 100% draggable, while buttons and cells remain clickable.
- **Fixed Widget Dragging**: Resolved an issue where the entire table blocked the window drag region.

### v8.0.5 - The "Modal Interactivity" Fix (25 Apr 2026)
- **Modal Support**: Restored click interaction for the manual notation modal by adding explicit `pointer-events-auto`.
- **System Integrity**: Ensured that global drag regions do not interfere with overlaying UI elements.

### v8.0.6 - The "Color Sync" Update (25 Apr 2026)
- **User Color Persistence**: Fixed an issue where the user's custom color was not being saved to Firebase during status cycles.
- **Cross-Window Consistency**: Ensured that pop-out windows display the correct user colors for the "Going" status.

### v8.0.7 - The "Total Drag" Fix (25 Apr 2026)
- **Refined Hitboxes**: Applied selective `pointer-events` to the Spawn Time pop-out. Now the big timer area and background allow window dragging, while only the CH cards capture clicks.
- **Improved UX**: Fixed an oversight where a global wrapper was blocking the drag region in the Timp Spawn view.

### v8.0.9 - The "Silent Pop-out" Update (25 Apr 2026)
- **Audio Isolation**: Restricted spawn alarms and audio alerts to the main dashboard only.
- **Echo Prevention**: Fixed an issue where multiple open windows would cause overlapping alarm sounds.
- **Resize Stability**: Verified that borderless windows remain resizable on Windows by ensuring non-transparent edge hitboxes.

### v8.1.0 - The "Direct Edit" Update (25 Apr 2026)
- **Manual Input**: Added the ability to type spawn times directly within the Spawn Time pop-out cards.
- **Event Isolation**: Implemented `stopPropagation` on inputs to allow typing without accidentally triggering the "click-to-set-current-time" behavior.
- **Interactive Consistency**: Ensured all pop-out widgets support the same level of data entry as the main dashboard.

### v8.1.1 - Terminology Update (25 Apr 2026)
- **Status Change**: Renamed the "MORT" status to "DEAD" in the Ice Table for better consistency with gaming terminology.

### v8.1.2 - Resize Stability Fix (25 Apr 2026)
- **Edge Hitbox Inset**: Inset the `data-tauri-drag-region` by 4px from the window edges. This prevents the drag handler from overriding the OS resize handles.
- **Improved Window Control**: Verified that both pop-outs can now be resized and moved independently without conflict.

### v8.1.3 - The "Top Control" Update (25 Apr 2026)
- **Always on Top Toggle**: Implemented a right-click handler on widget backgrounds to toggle the "Always on Top" window state.
- **Visual Feedback**: Added a subtle, floating overlay that appears when "Always on Top" is disabled, ensuring the user knows the current window status.

### v8.1.4 - Enhanced State Feedback (25 Apr 2026)
- **State Notifications**: Added a brief green "Always on Top: ON" notification when re-enabling the pin state.
- **Improved Visibility**: The "OFF" indicator remains persistent to prevent the window from getting lost behind other windows unexpectedly.

### v8.1.5 - Map Visual Enhancements (25 Apr 2026)
- **Player Indicators**: Added floating badges for players marked as "Going" above the room indicators on the map.
- **CH Persistence**: Restored the display of CH numbers (SEF/GEN/DEAD) below the camera even when a player is present, ensuring total visibility of spawn statuses.
- **Animation & Clarity**: Added subtle animations for player badges and a pulse effect on active channels.

### v8.2.0 - Total Widget Integration (25 Apr 2026)
- **Map Pop-out**: Implemented full widget support for the Ice Map. Users can now pop out the map as a standalone, borderless window.
- **Unified Control**: The Map pop-out includes the same 'Always on Top' toggle and 'Inset Drag' system as the other widgets.
- **Visual Polish**: Added a dedicated header and pop-out button for the Map section in the main dashboard.

### v8.2.1 - Dependency Cleanup (25 Apr 2026)
- **Import Fix**: Removed `react-router-dom` from `MapView.tsx` as it was not part of the project dependencies.
- **Native URL Handling**: Switched to native `window.location.search` for detecting pop-out views, ensuring better build stability and reduced overhead.

### v8.2.2 - Activity Log Refinement (25 Apr 2026)
- **Terminology Update**: Changed the activity log message for marking a channel as beaten from "terminat" to "bătut" to align with user preferences.

### v8.2.3 - Map Drag Fix (25 Apr 2026)
- **Pointer Event Isolation**: Set the map image to `pointer-events-none` when not in pin mode, allowing dragging through the image to the underlying window handle.
- **Interactive Balance**: Ensured room markers and CH selection remain interactive while the rest of the map acts as a drag surface.

### v8.2.4 - Map Pinning Update (25 Apr 2026)
- **Context Menu Toggle**: Added the right-click "Always on Top" toggle to the map pop-out, consistent with other widgets.
- **Hitbox Optimization**: Refined the right-click detection to cover the entire map background.

### v8.2.5 - Map Ratio Stability (25 Apr 2026)
- **Aspect Ratio Lock**: Enforced a strict 1:1 aspect ratio for the map container. This prevents room indicators from drifting when the window is resized into non-square shapes.
- **Center Alignment**: The map now centers itself automatically within the pop-out window, maintaining pixel-perfect alignment between the image and the interactive markers.

### v8.2.6 - Log Terminology Consistency (25 Apr 2026)
- **Status Change Phrasing**: Harmonized the log messages to use the "bătut / nebătut" pattern for all channel status toggles.

### v8.2.7 - Global Spawn Reset (25 Apr 2026)
- **Deep Reset Logic**: Updated the "Reset" functions to include clearing the "bătut" status for channels. When the team resets the spawn, everything (rooms, pins, and channel statuses) returns to the default "nebătut" state.

### v8.2.8 - Audio Consolidation (25 Apr 2026)
- **Centralized Audio**: Removed audio triggers from the alert pop-up window. Sounds now only play from the main dashboard to prevent echoing or overlapping alarms.

### v8.2.9 - High-Fidelity Notifications (25 Apr 2026)
- **Melodic Upgrade**: Replaced the basic 2-minute beep with a professional D-Major arpeggio. It's designed to be clearly audible even at low volumes while remaining "chill" and non-jarring.
- **Volume Bug Fix**: Corrected a math error in the volume calculation that made 30-second critical alerts nearly silent. They now correctly respond to the Master Volume slider.

### v8.3.0 - Map Engine Stability (25 Apr 2026)
- **Math-Based Scaling**: Replaced the CSS `aspect-square` with a more robust mathematical constraint (`maxWidth: min(100%, 100vh)`). This ensures the map is always a perfect square centered in the window, regardless of how rectangular or irregular the window size is.
- **Fixed Drift**: Room indicators and map pins are now locked into the square container, preventing them from drifting even during aggressive resizing.

### v8.3.1 - Global Undo (Ctrl+Z) (25 Apr 2026)
- **Session History**: Enabled Ctrl+Z across all windows. Users can now undo any spawn-related action (timer changes, pins, resets) directly from the keyboard.

### v8.3.2 - Master Audio & Transparency (25 Apr 2026)
- **Master Volume Control**: Renamed 'Sistem' to 'Master' and linked the 2-minute melodic alert directly to it. This provides a unified volume ceiling for the entire application.
- **True Transparency**: Forced body transparency in alert windows, removing the black background wrapper and leaving only the clean notification card visible.

### v8.3.3 - Spawn Mode Reversibility (25 Apr 2026)
- **Undoable Toggle**: The Simplu/Dublu spawn mode toggle is now part of the global history. If you change the mode by mistake, Ctrl+Z will restore the previous setting.

### v8.3.4 - Context-Aware Spawn Selection (25 Apr 2026)
- **Automatic Mode Switching**: The application now automatically toggles the spawn type based on the active channel. CH1/2 trigger 'Dublu' mode, while CH3-6 trigger 'Simplu' mode, reducing manual clicks during high-speed monitoring.

### v8.4.0 - Boss Cycle Automation (25 Apr 2026)
- **Hourly Cycle Engine**: Implemented an automatic toggle for the spawn mode based on the CH1 time marker. Every hour, at the exact MM:SS defined for CH1, the application will "cycle" the mode between Simplu and Dublu.
- **Accuracy Refinement**: This aligns the application with the alternating pattern of the boss spawn without requiring manual status changes.

### v8.4.1 - Robust Cycle Engine (25 Apr 2026)
- **Numeric Time Parsing**: Replaced string-based time matching with numeric comparison (`parseInt`). This prevents the auto-cycle from failing when users enter times without leading zeros (e.g., '5:10' vs '05:10').
- **Precise Sync**: The hourly toggle is now even more reliable across different input styles.

### v8.4.2 - Alert UI Minimalism (25 Apr 2026)
- **Label Removal**: Removed the 'Main Window Audio Active' debug text from the alert pop-outs for a cleaner, production-ready interface.

### v8.4.3 - Intelligent Cycle Buffer (25 Apr 2026)
- **Delayed Mode Switch**: The auto-cycle now triggers exactly 5 minutes after the CH6 time marker. This prevents the spawn mode from flipping while the team is still clearing the last channels of the current cycle.

### v8.4.4 - Targeted Automation Isolation (25 Apr 2026)
- **View-Specific Logic**: Restricted the auto-cycle automation to the Spawn Timing Table pop-out window. This prevents background windows from interfering with the cycle logic and ensures it only runs when the specific monitoring view is active.

### v8.4.5 - Precision Input Refinement (25 Apr 2026)
- **Focused Input Areas**: Reduced the width of the time input fields in the Spawn Timing Table. Users now need to click directly on the text to edit, preventing accidental activations while interacting with the surrounding card area.

### v8.4.6 - Absolute Input Isolation (25 Apr 2026)
- **Zero-Ghost Area**: Forced the time input container to `w-fit mx-auto`. This ensures that there is absolutely no invisible clickable space to the left or right of the numbers, making the rest of the card surface safe for window dragging.

### v8.4.7 - Perfect Cursor Isolation (25 Apr 2026)
- **Cursor Normalization**: Applied `cursor-default` and `select-none` to all layout containers in the Spawn Timing Table. The 'I-beam' (text) cursor now only appears when hovering directly over the input field, eliminating visual confusion and improving UX precision.

### v8.4.8 - Surgical Pointer Isolation (25 Apr 2026)
- **Pointer Event Logic**: Implemented `pointer-events-none` on all layout wrappers around time inputs. This makes the surrounding empty space completely invisible to the mouse, effectively forcing the cursor to remain a default arrow until it is exactly over the interactive number field.
- **Responsive Sizing**: Adjusted input width to `70px` and reduced font size slightly to ensure a perfect fit even in extremely small pop-out windows.

### v8.4.9 - Global Selection Lock (25 Apr 2026)
- **Anti-Selection Logic**: Applied `select-none` and `cursor-default` to the entire card component. This prevents the browser from automatically selecting the time notation when the user clicks on any empty part of the card, strictly limiting text interaction to the input field itself.

### v8.5.0 - Hardened Layout Architecture (25 Apr 2026)
- **Fixed Width Isolation**: Replaced the fluid `flex-1` layout with a fixed-width `120px` column for the time notation. This prevents any horizontal stretching of the interactive area.
- **Strict Event Boundary**: By combining fixed widths with `pointer-events-none` on the entire layout column, the interactive surface is now physically limited to the 74px area of the input. All other card space is completely inert to clicks and selection.

### v8.5.1 - Nuclear Event Isolation (25 Apr 2026)
- **Deep Pointer Blocking**: Set `pointer-events-none` on the entire card wrapper. This makes the background of the card "ghost-like" to the browser, making it physically impossible to click or select text through the background.
- **Selective Re-activation**: Enabled `pointer-events-auto` only on the CH label and the time input, ensuring that interaction is restricted to the precision-targeted elements.

### v8.5.3 - Edit-in-Place Architecture (25 Apr 2026)
- **Dynamic Input Rendering**: Replaced persistent inputs with a toggleable `TimeInput` component. The interactive input element is now only rendered when the user explicitly clicks the time notation, physically removing the selection-prone input fields from the UI during normal viewing.
- **Precision Focus**: Implemented auto-focus and auto-selection on edit, providing a seamless transition from viewing to editing while maintaining a strictly inert background.

### v8.5.4 - Interaction Flow Refinement (25 Apr 2026)
- **Pointer Event Calibration**: Fixed a logic error where the central column was blocking its own child events. Interaction is now restored for the Edit-in-Place system while maintaining a non-selectable background.

### v8.5.5 - Targeted Pop-out Optimization (25 Apr 2026)
- **View-Specific Fix**: Identified and resolved the issue where 'Edit-in-Place' logic was missing from the specialized `CHPopoutView` (timpspawn). Applied the hardened selection-blocking architecture to this view, ensuring the pop-out is now fully optimized for precision interaction.

### v8.5.6 - Geometric Precision Refinement (25 Apr 2026)
- **Interactive Zone Hardening**: Corrected the horizontal stretching issue in the pop-out view. Replaced fluid widths with `w-fit mx-auto` for viewing and a hard-coded `80px` for editing, ensuring the interactive surface is strictly centered and limited to the numbers.

### v8.5.7 - Seamless Edit Mode (25 Apr 2026)
- **Visual Cleanup**: Removed the focus ring and background shading from the time input in the pop-out view. The transition from viewing to editing is now visually seamless, with no borders or overlays appearing during interaction.

### v8.5.8 - Smart Time Formatting (25 Apr 2026)
- **Auto-Colon Insertion**: Implemented an intelligent `onChange` handler that automatically inserts the `:` separator once three digits are entered. Users can now type continuous digits (e.g., '1422') and the system will instantly format them as a valid time notation ('14:22').
- **Sanitized Input**: Added automatic stripping of non-numeric characters to ensure data integrity during rapid entry.

### v8.5.9 - The "Professional Aesthetics" Update (26 Apr 2026)
- **Skin Reminder Overhaul**: Redesigned Skin Reminder cards for a more professional, clean, and premium look.
- **Glassmorphic UI**: Implemented a layered glass effect with subtle gradients and refined borders.
- **Improved Typography**: Established a clearer hierarchy for item names, accounts, and timers.
- **Compact Actions**: Reorganized card buttons into a cleaner, more balanced grid with better icon integration.
- **Sleek Progress**: Modernized the expiration progress bar with a thinner, more elegant design.
- **Responsive Modal**: Fixed an issue where the Add Item modal would overflow on smaller screens by implementing a scrollable container with a maximum height limit.
- **Smooth Transitions**: Added fluid animations for conditional fields (like Gender selection) within the Add Item modal, ensuring a polished user experience.
- **Skin Card Refinement (v2)**: Elevated the professional look of Skin Reminder cards with a more integrated header, unified badge system, and premium action grid.
- **Enhanced Visuals**: Increased the size of item icons and removed container borders to make the items stand out more clearly and professionally.
- **Custom Dialog System**: Replaced native browser prompts and confirmations with premium, theme-consistent modals for actions like deletion, renewal, and depersonalization.
- **Depersonalization Monitoring**: Added a real-time countdown timer to the depersonalization badge, allowing users to track exactly how much time is left until an item becomes tradable.
- **Centered Loading State**: Adjusted the initialization screen layout to be perfectly centered vertically and horizontally, providing a more balanced start-up experience.
- **Smart Alert System**: Implemented a comprehensive notification engine for skins, alerting users at critical thresholds (24h, 6h-1h) and providing a 4-day early warning for personalized items requiring depersonalization.
- **Advanced Renewal System**: Enhanced the item renewal process by allowing precise input of days, hours, and minutes, ensuring total control over item durations.

### v8.6.0 - The "Inventory Sync" Update (01 May 2026)
- **Firebase Alignment**: Standardized the inventory data path to `teams/{teamId}/inventory/items` to ensure full synchronization with the Web platform.
- **Data Normalization**: Unified the Inventory item structure between Pro and Web (id, name, image, accounts, order, addedAt).
- **Real-time Updates**: Implemented automatic UI refreshing when items are added, modified, or removed on any platform.
- **Enhanced UI**: Added a cleaner, more premium look to the Inventory cards, matching the latest Skin Reminder design.

### v8.7.0 - The "Alarm Rebuild" Update (09 May 2026)
- **Audio Engine Rewrite**: Fixed broken audio graph — harmonics now connect correctly to `masterGain → destination` instead of being lost. Volume is no longer silent.
- **Volume Math Fix**: `globalVolume` and `spawnVolume` are now stored and applied as 0-1 values consistently (was incorrectly dividing 0-1 by 100).
- **Tremolo Added**: All alarm tones now use an LFO for a pulsating alarm feel (like a real siren), same as the web platform.
- **2-Minute Visual Alert**: Added `TwoMinuteBanner` — a subtle top banner that appears when CH1 is 2 minutes away. Auto-disappears after 15 seconds. Identical behavior to the web site.
- **30-Second Modal Redesign**: Upgraded `SpawnAlertModal` with red pulsing icon, per-channel countdown, and clearer confirm button.
- **Sound Loop Fix**: Urgent alarm now repeats every 4 seconds (down from 5) and stops cleanly when the last alert is confirmed.
- **No Pop-out Echo**: Alarm logic is now guarded against running in pop-out windows to prevent duplicate sounds.
- **Smart Alert Clearing**: Alerts auto-remove themselves when the spawn time passes (no longer requires manual confirm if you miss it).
- **Global Visibility**: Both alert components are now rendered globally in `App.tsx` — they appear on all tabs, not just Spawn Tracker.

### v8.7.2 - Audio Envelope Fix (09 May 2026)
- **Muffled Tail Fix**: Added `linearRampToValueAtTime(0, t + dur)` after each exponential decay. In WebView2, the jump from `0.001` → `0` when the oscillator stopped caused an audible artifact (muffled/thud at end of each beep). Now the gain reaches exactly 0 before the oscillator stops.

### v8.7.1 - Audio Engine Fix (09 May 2026)
- **Muffled Sound Fix**: `playSpawnAlarm` now creates a fresh `AudioContext` on each call (identical to web behavior). The persistent context was accumulating internal state in WebView2 (Tauri), causing muffled/degraded sound quality.
- **Instant Stop**: `stopSpawnAlarm` now calls `ctx.close()` to instantly silence all audio — no more sound playing to completion after confirm.
- **Volume Control**: `sliderVol = globalVolume * spawnVolume` is captured per-call via `useCallback` deps, so slider changes take effect immediately on the next alarm cycle.

### v5.0.0 - TCP Close & Spawn Sync (15 May 2026)
- **TCP Close Connection**: Nou card in Tweaks — afiseaza PID-ul fiecarui client Metin2 detectat si permite inchiderea conexiunilor TCP cu un singur click.
- **Bind global (tasta sau mouse)**: Poti asocia orice tastatura shortcut sau buton lateral de mouse (Mouse4/Mouse5) pentru TCP close. Functioneaza fara focus pe aplicatie, prin `WH_MOUSE_LL` hook la nivel de sistem.
- **Multi-client pe aceeasi tasta**: Aceeasi combinatie de taste poate fi legata la mai multi clienti simultan — un singur shortcut inchide TCP la toti clientii asociati.
- **Anti-cheat safe**: TCP close foloseste `SetTcpEntry` / `GetExtendedTcpTable` din `iphlpapi.dll` — nu atinge memoria, fisierele sau procesul jocului.
- **PID sincronizat**: PID-ul este afisat atat in sectiunea TCP Close cat si in Window Renamer pentru consistenta vizuala.
- **Spawn Sync (Web)**: Sistem anchor-based pe site — tipul spawn se calculeaza automat la fiecare ciclu fara interventie manuala. Deduplicare multi-client la T=0 via tranzactie Firebase.

### v8.9.0 - Alarme Tab + Volume Control (12 May 2026)
- **Alarme Tab**: Nou tab "Alarme & Remindere" cu trei sectiuni — Alarme programate (zilnic/saptamanal/lunar), Remindere countdown (pauza/reset), Timere Repetitive (auto-reset + pop-out always-on-top).
- **Firebase Sync**: Alarmele si reminderele pot fi facute globale (toggle Globe). Se sincronizeaza cu `teams/${teamId}/alerte/items` si `/reminders`. Ping-urile de la alti membri sunt primite prin `onChildAdded` pe `/pings`.
- **UTC Timezone**: Alarmele globale stocheaza `oraUTC` (ora convertita in UTC la salvare). La afisare si la verificarea declansarii, se converteste inapoi la ora locala cu `utcToLocal()` — toti membrii aud alarma in acelasi moment real.
- **Pop-out Repeat Timer**: Fereastra always-on-top separata (220×130px, `resizable: true`, `minWidth: 180`). Se deschide cu butonul ExternalLink. Progres bar + countdown mare + buton Reset. Sunet tick la ultimele 3 secunde.
- **Volume Master**: Slider 0-100% in header-ul tabului, persistent in `localStorage` (`m2pro_alarm_volume`). Buton "Test" pentru preview sunet. Toate functiile audio (`playTick`, `playAlarm`, `playAlertSound`) citesc volumul din localStorage.

### v8.8.0 - Tweaks Tab (12 May 2026)
- **Tweaks Tab**: Nou tab "Tweaks" in sidebar cu doua sectiuni principale.
- **Rezolutie Fereastra**: Selecteaza `metin2.cfg` direct si aplica rezolutia cu un click. Preseturi predefinite (Low/Classic/SVGA/XGA/HD/etc.), preseturi custom cu nume, stergere si reordonare prin drag & drop cu animatie FLIP.
- **Window Title Changer**: Detecteaza automat toate procesele `Metin2Client.exe` deschise via `CreateToolhelp32Snapshot`. Permite redenumirea titlului ferestrelor prin `SetWindowTextW`. Buton "identify" (crosshair) aduce fereastra in prim-plan.
- **Admin Elevation**: Detectie automata daca aplicatia ruleaza ca Administrator (`GetTokenInformation`). Banner de avertizare daca nu e admin, cu buton "Restart Admin" (`ShellExecuteW` + runas) functional in build-ul de productie.
- **Persistenta locala**: Toate setarile Tweaks sunt per-utilizator in `localStorage` (nu Firebase) — nu se sincronizeaza cu echipa.
- **Drag & Drop pointer-based**: Sistem identic cu Inventory — pointer events + animatie FLIP, fara HTML5 DnD.

### v8.7.3 - Inventory Sync Fix + Notification Bell (09 May 2026)
- **Inventory Firebase Sync**: Fixed critical bug where `teamId` was `undefined` (destructured wrong from `useAuth()` — now uses `user?.teamId`). Inventory now reads/writes correctly to `teams/${teamId}/inventory/items`.
- **Crash Fix**: Removed call to undefined `setIsLoading()` in Firebase listener that caused component crash on mount.
- **selectedItem Live Sync**: Detail modal now stays in sync when Firebase data changes (other team members edit). Auto-closes if item was deleted from another session.
- **Edit Item Modal**: Added name + image edit capability in the detail modal footer ("Editează" button), matching web functionality.
- **Clean Firebase Writes**: `handleAddItem` and `handleAddAccount` no longer write empty strings for optional fields (platform, email) — uses spread operator to omit them.
- **Notification Bell**: Implemented notification panel in header showing expired items (red), items expiring within 24h (amber), and personalized items needing depersonalization (purple).
- **Pets Validation**: Submit button disabled + grayed when all duration fields (days, hours, mins) are empty for non-`sase-sapte` categories.
- **SkinAlertModal Hardening**: Added NaN guard for items with invalid `expiresAt`; added try-catch around localStorage parse to prevent crash on corrupted data.

---
*Last updated on 15 May 2026 (v5.0.0)*
