# Project Specs: Metin2 Tools Bridge (v4.2.0+)

Acest document descrie arhitectura și pașii necesari pentru a menține o sincronizare perfectă între aplicația desktop (Tauri) și versiunea web a platformei Metin2 Tools.

## 1. Obiectiv Principal
Crearea unei experiențe unificate unde un utilizator (sau o echipă) poate accesa aceleași date, timere și setări indiferent de platforma folosită (PC, Browser, Mobil), folosind Firebase ca "Single Source of Truth" (Sursă Unică de Adevăr).

---

## 2. Arhitectura Sistemului (The Bridge)

### A. Sursa de Date (Firebase Realtime Database)
Toate datele sunt stocate într-o structură ierarhică protejată prin reguli de securitate (RLS):
- `teams/{teamId}/`: Date private ale echipei (spawn, inventar, alerte).
- `users/{uid}/`: Profilul individual al utilizatorului (nume, culoare, teamId).
- `meta/`: Versiunea aplicației, anunțuri globale.
- `serverStatus/`: Statusul serverelor (global pentru toți utilizatorii).

### B. Autentificarea Partajată (Firebase Auth)
- **Email & Parolă**: Ambele platforme folosesc același sistem de login.
- **Sesiune persistentă**: Odată logat în aplicație sau pe site, utilizatorul este recunoscut automat prin token-ul de securitate Firebase.

### C. Izolarea Datelor (Helper-ul `p()`)
- S-a implementat funcția globală `p(path)` care injectează automat prefixul de echipă.
- **Exemplu**: `db.ref('spawn/data')` devine automat `db.ref('teams/ECHIPA1/spawn/data')`.
- Acest lucru previne scurgerea datelor între echipe diferite.

---

## 3. Componente și Implementare

### 1. Aplicația Desktop (Tauri / Pro)
- **Rol**: Colectare date în timp real, monitorizare activă, performanță maximă.
- **Tehnologie**: React + Tauri + Firebase SDK.
- **Bridge**: Salvează datele direct în Firebase folosind helper-ul `p()`.

### 2. Platforma Web (metin2tools-dev)
- **Rol**: Vizualizare rapidă, management de la distanță, acces pentru membrii echipei care nu au aplicația deschisă.
- **Tehnologie**: Vanilla JS + Firebase SDK + Cloudflare Workers.
- **Bridge**: Folosește aceleași fișiere JS (`spawn.js`, `inventory.js`, `auth.js`) ca și aplicația Pro pentru a asigura comportament identic.

### 3. Worker-ul (Cloudflare)
- **Rol**: Proxy pentru API-uri restricționate (Discord Webhooks, Verificare Porturi TCP) și sarcini programate (Cron).
- **Bridge**: Trimite alerte pe Discord în numele utilizatorilor, chiar dacă aceștia au browser-ul închis.

---

## 4. Ce mai este necesar pentru finalizare?

### I. Sincronizarea Profilului
- [ ] Implementarea unui ecran de "Setări Profil" unde utilizatorul își poate schimba numele și culoarea, iar acestea să apară instant pe toate platformele.

### II. Sistem de Notificări Universal
- [ ] Integrarea Web Push Notifications pentru browser, astfel încât utilizatorii de pe site să primească alerte chiar dacă tab-ul este în fundal (fără a depinde doar de Discord).

### III. Monitorizare Centralizată a Mentenanței
- [ ] Unificarea logicii de "Auto-Monitor" astfel încât, dacă aplicația unui admin detectează mentenanța, site-ul să afișeze automat un banner de avertizare pentru toți ceilalți utilizatori.

### IV. Optimizare Performanță (Context Window)
- [ ] Curățarea codului vechi (redundant) din `index.html` și mutarea logicii în componente JS separate pentru a reduce dimensiunea fișierelor și a ușura munca AI-ului în viitor.

---

## 5. Definiția "Gata" pentru acest task
- [x] Login-ul Firebase funcționează pe ambele platforme.
- [x] Datele salvate pe site apar instant în aplicația Pro (si invers).
- [x] Sistemul de echipe permite izolarea datelor.
- [x] Worker-ul a fost curățat de autentificarea veche și servește fișierele corect.
- [x] Securitatea "Anti-Inspect" este activă (app-root ascuns până la login).
