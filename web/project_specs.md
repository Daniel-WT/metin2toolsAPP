# Project Specs: Metin2 Tools (v5.1.x Suite - Web & Pro Sync)

## Overview
Metin2 Tools is a professional monitoring and management suite for Metin2 players. It features real-time data synchronization between the Web platform and the Desktop Pro (Tauri) application using Firebase as the Single Source of Truth.

## Core Rules: Platform Synchronization (CRITICAL)
1. **Single Source of Truth**: All data MUST be stored in Firebase under `teams/{teamId}`. Local storage is strictly for non-critical UI preferences.
2. **Mirror Functionality**: Every feature added to the Web platform must eventually exist in the Pro (Tauri) app with identical data structures and logic.
3. **Modular Code**: Features must be split into separate JS files (e.g., `team-gate.js`, `inventory.js`) to prevent file bloat and ensure easy debugging. No single file should exceed manageable limits.
4. **No Placeholders**: Use real assets or generated images. UI must feel premium, dark-themed, and responsive.

## Tech Stack
- **Web Frontend**: Vanilla JS, HTML5, CSS3 (Premium dark theme, Rajdhani font).
- **Desktop Pro**: React + Tauri (Windows).
- **Database**: Firebase Realtime Database (with Team Isolation).
- **Authentication**: Firebase Auth (Email/Password).

## Architecture: The Bridge
All data is stored in Firebase under a unified team-based structure:
- `teams/{teamId}/`: Private team data (spawn, skinReminder, inventory, alerte).
- `teams/{teamId}/metadata/`: Team name, ownerId, and **inviteCode** (6 chars, uppercase).
- `users/{uid}/`: User profile (name, color, teamId).
- `team_requests/`: Collection of pending team creations (requestedName, requestedBy, status).

## File Structure (Web)
```
index.html        — Main application entry (Header/Tab structure)
css/
  styles.css      — Core design system (Glassmorphism, Flex layouts)
js/
  app.js            — Tab switching and initialization
  auth.js           — Auth state listener and redirection logic
  team-gate.js      — (NEW) Logic for Join/Create request overlay
  team-mgmt.js      — Team dashboard, members list, and permissions
  firebase-layer.js — Main Firebase listener layer (v5.1.0+)
  spawn.js          — Spawn tracking and map pins
  skin-reminder.js  — Expiry tracking (shared logic with Pro)
  inventory.js      — Inventory management
  utils.js          — Shared UI helpers (showToast, modals, escHtml)
```

## Key Modules

### 5. Team Selection Gate
- **Isolation**: Users without a `teamId` are BLOCKED for all features. The overlay `#team-gate` is displayed, and application initialization (`window.initApp`) is halted.
- **Forced Access**: This rule applies to ALL users, including Super-Admin, to ensure data consistency.
- **Join Logic**: Users enter a 6-character alphanumeric code (generated in Pro/Web dashboard). Searching `teams/*/metadata/inviteCode` links the user to the team.
- **Create Logic**: Users submit a name for a new team. This is stored in `team_requests/{id}` for manual Super-Admin approval.

## Pro App Specifics
- **Admin Panel**: Fixed a crash related to missing user emails (added safety checks for `user.email`).

### 2. Team Management Dashboard
- **Sync**: Mirroring Pro App dashboard.
- **Cards**: Displays "Nume Echipă" and "Cod Invitație" (Rajdhani font, monospace).
- **Permissions**: Granular control (Spawn, Costume, Inventar, Alarme, etc.) per member.
- **Roles**: Lider (Owner), Admin, Membru.

### 3. Header & UI Alignment
- **Header Structure**: `header` -> `header-controls` -> `header-right`.
- **Live Time**: Positioned in top-right, integrated into `header-controls` to ensure alignment with profile/notif buttons.
- **Central Container**: `.app` has `max-width: 1200px` and `margin: 0 auto`.

## Changelog Recent (v5.4.x)
- **Tabel Fulger eliminat** — UI-ul tabelului Fulger a fost eliminat din `index.html` și `tab-spawn.html`; funcția `renderFulgerTable()` este no-op; datele Fulger sunt păstrate în Firebase pentru compatibilitate retroactivă.
- **Auto-clear 5 min înainte de spawn** — `spawnTimerTick()` detectează când `ch1Diff <= 300` și execută `doResetSpawnTables()` cu un key de ciclu unic (`lastPreClearTime`) pentru a preveni duplicate; respectă cooldown-ul de 60s după setare manuală.
- **SkinAlertModal — Pro App** — Adăugat în `App.tsx`; modal global vizibil pe toate tab-urile; sunete per categorie (`skinVolume × globalVolume`); confirmare persistentă în localStorage cu key bazat pe `expBucket = Math.floor(expiresAt/60000)`.
- **Notification bell** — Pro App: butonul Bell din header deschide un panou care afișează iteme expirate (roșu), care expiră sub 24h (amber) și costume personalizate care necesită depersonalizare (violet).
- **Volume system** — Master × categorie (spawnVolume, skinVolume); slidere în header; fără flickering (useRef + listener cu `[]` deps).
- **Profile menu** — Mutat din sidebar în dropdown la click pe avatar (header dreapta sus); conține Setări + Deconectare.
- **Form validation** — Câmpuri goale implicite în SkinReminder și Pets; buton Adaugă dezactivat dacă toate câmpurile de durată sunt goale; protecție NaN cu `|| 0`.

## Roadmap / Future Prompts
- **Admin Panel Expansion**:
  - Add `tab-admin` DIV to `index.html`.
  - Implement "Users" tab: list all users, search, toggle Admin/Super-Admin, Ban/Unban, Delete Account.
  - Implement "Teams" tab: list all teams, members count, global Disband Team.
  - Implement "Requests" tab: approve/reject team creation requests.
  - Premium UI: Use glassmorphism, proper spacing, and subtle animations.
- **Sync Optimization**: Ensuring heartbeat/presence doesn't cause excessive DB writes.
- **Pro App Update**: Bring the "Join Team" UI to the same level of functionality as the Web version.

## Definition of Done (Admin Expansion)
- [ ] Admin Panel is accessible via a dedicated tab (for Super-Admins).
- [ ] Users can be managed globally (Role elevation, Banning, Deletion).
- [ ] Teams can be managed globally (Disbanding with cascading cleanup).
- [ ] UI matches the premium dark theme of the rest of the application.
- [ ] Feature parity with Pro App's administrative capabilities.

## Current Tasks (v5.4.1)

### 1. Spawn Alert Fix (Pro App)
- **Issue**: The alert pop-out disappears instantly or doesn't persist correctly, and the sound keeps playing in a loop even after the window is gone.
- **Goal**:
  - The alert pop-out window MUST stay open until the user clicks "Confirmare" or the countdown reaches 0.
  - The audio alarm must stop exactly when the last alert is confirmed or when the window is closed.
- **Logic**:
  - In `SpawnContext.tsx`, ensure `activeAlerts` are only cleared upon user confirmation or when the spawn time has passed (diff <= 0).
  - Ensure `stopSpawnAlarm()` is called in the `useEffect` cleanup or whenever `activeAlerts.length` reaches 0.
  - Remove aggressive self-closing logic in `AlertWindowView.tsx` to prevent "instant disappearance" during initialization.

### 2. Sticky Footer (Web Interface)
- **Issue**: The footer (`.footer-status`) appears in the middle of the page if the content is short, instead of sticking to the bottom of the viewport.
- **Goal**: Implement a proper flexbox layout on the `body` or main container to ensure the footer is always anchored at the bottom of the page.
- **Design**: Maintain the premium dark theme and ensure the footer remains unobtrusive but accessible.

## Definition of Done (v5.4.1)
- [ ] Spawn alert audio stops immediately upon confirming all alerts or closing the pop-out window.
- [ ] Footer on the web interface is consistently positioned at the bottom of the viewport regardless of content length.
- [ ] Version numbers are bumped in `js/firebase-layer.js` and `index.html`.
- [ ] Changes are tested and verified on both platforms.
