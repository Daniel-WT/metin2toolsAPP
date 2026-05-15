# Project Overview

Metin2 Tools este o suită profesională pentru Metin2: tracking iteme, timere de spawn, management echipă și status server.
Există **două aplicații separate** care se sincronizează permanent prin Firebase:

| App | Folder | Stack | Versiune curentă |
|-----|--------|-------|-----------------|
| **Web** | `metin2tools-dev` | Vanilla JS + HTML + CSS | v5.4.1 |
| **Desktop (Windows)** | `metin2tools-pro` | React + Tauri (Rust) | v8.7.0 |

**Regula de aur**: orice funcționalitate adăugată pe Web trebuie să existe și în Pro (și invers), cu structuri de date identice în Firebase.

## Sincronizare Firebase
- Toate datele sunt stocate în Firebase sub `teams/{teamId}/`
- `teams/{teamId}/metadata/` — numele echipei, ownerId, inviteCode
- `users/{uid}/` — profil utilizator (nume, culoare, teamId)
- `team_requests/` — cereri de creare echipă (aprobate de Super-Admin)
- Specs-urile fiecărei aplicații sunt **diferite** — dev are specs simplificate, pro are specs detaliate cu changelog complet.


---


# Design
You are a senior UI designer and frontend developer. Build premium, dark-themed interfaces. Use subtle animations, proper spacing, and visual hierarchy. No emoji icons. No inline styles. No generic gradients.




# Development Rules


**Rule 1: Always read first**
Before taking any action, always read:
- `CLAUDE.md`
- `project_specs.md`


If either file doesn't exist, create it before doing anything else.


**Rule 2: Define before you build**
Before writing any code:
1. Create or update `project_specs.md` and define:
  - What the website does and who uses it
  - Tech stack (framework, database, auth, hosting)
  - Pages and user flows (public vs authenticated)
  - Data models and where data is stored
  - Third-party services being used (Firebase, Cloudflare, etc.)
  - What "done" looks like for this task
2. Show the file
3. Wait for approval


No code should be written before this file is approved.


**Rule 3: Look before you create**
Always look at existing files before creating new ones. Don't start building until you understand what's being asked. If anything is unclear, ask before starting.


**Rule 4: Test before you respond**
After making any code changes, run the relevant tests or start the dev server to check for errors before responding. Never say "done" if the code is untested.

**Rule 5: Minimize context**
Always find ways to reduce context window usage. If there's a way to keep things operating the same but use less context, optimize and let me know. Remove ALL files that are redundant or unnecessary.

**Rule 6: Capture what works**
After any content creation session, check if the output revealed new patterns, phrases, or preferences. Update your reference files. This keeps your system a living document that gets better over time.

**Rule 7: Research before testing**
Before proposing any new test, research whether the data is already conclusive. If the answer is already known, make it a production rule — don't waste time confirming what the internet already solved. Only test variables where the answer genuinely depends on YOUR specific audience.

**Rule 8: Challenge the direction**
Think critically about the direction we're heading. If you think this isn't the most optimized path to reach the goal in the shortest time, suggest a better alternative. Don't just execute — push back when there's a faster, smarter, or more effective way.

**Rule 9: Quality gate**
No content gets published until it meets your quality bar. Rate every piece of content honestly — no inflating scores to move things along. If it's not ready, say what's wrong and fix it before proceeding.

**Rule 10: Bump version only when a feature or fix is finalized, or at the end of a session**
When a feature or fix is complete (not on every intermediate commit), bump the version in both:
- `js/firebase-layer.js` — the `APP_VERSION` constant at line 2
- `index.html` — the footer version text (search for `v2.x.x` near the bottom)

Use semantic versioning: patch (x.x.X) for bug fixes, minor (x.X.0) for new features.
When the patch number reaches 10, reset it to 0 and bump the minor version instead (e.g. 3.6.9 → 3.7.0, never 3.6.10).

**Core Rule**
Do exactly what is asked. Nothing more, nothing less. If something is unclear, ask before starting.

# How to Respond


Always explain like you're talking to a 15 year old with no coding background.


For every response, include:
- **What I just did** — plain romanian, no jargon
- **What you need to do** — step by step, assume they've never seen this before
- **Why** — one sentence explaining what it does or why it matters
- **Next step** — one clear action
- **Errors** — if something went wrong, explain it simply and say exactly how to fix it


When a task involves external tools or technical elements that a non-coder wouldn’t know (Firebase, Cloudflare, etc.):
- Walk through exactly where to find what they need (e.g. "go to your Firebase console")
- Describe what each key or setting does in one plain sentence
- If there's a bucket, folder, or config to create manually, explain what it is and why it exists
- Be as concise as possible. Do not ramble. Less is more


---


# Tech Stack
Language: romanian
AI: Claude

# Running the Project

- **Web** (`metin2tools-dev`): `npx serve`
- **Desktop Pro** (`metin2tools-pro`): `npm run tauri dev`

# Branch
Always commit and push to: `fix/m2tools`

# Project Specs
- Specs pentru Web: `c:\Users\Daniel\Desktop\metin2tools-dev\project_specs.md`
- Specs pentru Pro: `c:\Users\Daniel\Desktop\metin2tools-pro\project_specs.md`
- Specs-urile sunt **diferite** — Pro are changelog complet și mai multe detalii tehnice. Citește specs-ul aplicației la care lucrezi înainte de orice modificare.


---

**Code organisation rules:**
- Keep API routes thin — call a service or lib function, don't put business logic in the route handler
- One component per file; co-locate page-specific components with the page
- Firebase for database and real-time sync
- Don't create new top-level folders without asking first


---


# How to Write Code


- Write simple, readable code — clarity matters more than cleverness
- Make one change at a time
- Don't change code that isn't related to the current task
- Don't over-engineer — build exactly what's needed, nothing more
- Add a `console.log` at the start and end of each API route so it's easy to follow what's happening


If a big structural change is needed, explain why before making it.


---


# Secrets & Safety


- Never put API keys or passwords directly in the code
- Never commit `.env.local` to GitHub
- Use Firebase security rules to protect data
- Ask before deleting or renaming any important files


---


# Testing


Before marking any task as done:
- Run `npm run build` and fix any errors
- Start the dev server with `npm run dev` and check for runtime errors in the console
- Manually verify the feature works end-to-end in the browser
- Check that existing features weren't broken by the change


When building a new page or API route:
- Test the happy path (everything works as expected)
- Test the error path (what happens if something goes wrong)
- Check that auth is working — logged-in vs logged-out behaviour
- Confirm Firebase Security Rules are doing what they should (data is scoped correctly per user)


Never say "done" if:
- The build is failing
- There are console errors
- The feature hasn't been tested in the browser


---


# Scope


Only build what is described in `project_specs.md`.
If anything is unclear, ask before starting.
