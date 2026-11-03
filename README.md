# RevDent

Dental clinic app for Pakistan. Patients, appointments (RCT sitting numbers), cancellations with a WhatsApp "please rebook" message, recalls (manual and automatic 6-monthly/annual with per-patient opt-out), prescription suggestions by treatment (or typed manually) sent by WhatsApp, treatment log, odontogram (Universal 1-32 / A-T), X-rays, autoclave log, finance, and a live shareable calendar.

## Run
```
npm install
npm run build      # esbuild, creates ./dist
npm start          # http://localhost:8080  (PORT, DATA_FILE, WA_VERIFY_TOKEN, WA_APP_SECRET are optional env vars)
```
Needs Node 18+. Use HTTPS in production (any host or reverse proxy; the offline mode and encryption need https or localhost).

**Flat layout:** all source files sit in one folder.

**Docker / Render:** `docker build -t revdent . && docker run -p 8080:8080 -v revdent-data:/data revdent`. `render.yaml` is included: connect the repo on render.com and it deploys with a persistent disk. The disk only stores shared-calendar data and encrypted cloud backups; patient records stay in each user's browser.

**Railway (no GitHub needed):** install the CLI (`npm i -g @railway/cli`), then in this folder run `railway login`, `railway init`, `railway up`, `railway domain`. In the Railway dashboard add a Volume mounted at `/data`, and set `DATA_FILE=/data/schedules.json` and `APP_PASSWORD`.

## Private access
- Set `APP_PASSWORD` on the server to make the browser ask for a password (any username) before anything loads. 8 wrong tries lock that address out for 5 minutes. Shared-calendar links then need this password too. The WhatsApp webhook (`/api/inbound`) and `/healthz` stay open; the webhook is checked by its own signature.
- Make the GitHub repo Private. Patient data stays in each browser and is encrypted by the app password in Settings → Security.

## Works offline
After the first visit the app is cached (service worker) and opens with no internet. Patients, appointments, treatments, X-rays and settings are saved on the device as you work, online or not. You can install it to the home screen (Chrome/Edge: "Install app"). Needs https or localhost.

## Security
- **Passphrase lock (Settings -> Security):** records and X-rays on the device are encrypted with AES-256-GCM, key from your passphrase (PBKDF2-SHA256, 600,000 rounds). The key lives only in memory; the app locks on idle. There is no reset: forget the passphrase and the only way back is a backup. Without the passphrase lock, data sits in the browser unencrypted (the app warns about this).
- **Encrypted cloud backup / multi-device sync:** data is encrypted on the device before upload; the server stores only ciphertext and a hash of the write key. The sync code (id + write key + encryption key) is the key to your data: keep it private. Two devices that edit offline are merged when they reconnect (newest edit per record wins; deletions propagate). X-ray images are not synced; they are in backup files.
- Server: rate limiting and lock-out after repeated wrong keys, security headers (CSP etc.), request size limits. The calendar share link shows only what you choose (initials / full name and reason / time slots only); anyone with the link can see it until you stop sharing.
- Backup files are encrypted when the lock is on (or when you give a backup passphrase).
- Limits: encryption protects data at rest. It cannot protect a device that is already unlocked and infected, or someone watching the screen. Rate limiting is per address and in memory. This has not had an independent security audit.

## Shared calendar: adding, cancelling, and patient cancellation texts
- **View link** (read-only) and optional **edit link** (tick the box in Calendar → Share). Edit-link users type their name, can add a patient with date and time, and can press "Mark cancelled". There is no delete anywhere; the server rejects any other action.
- Their changes wait on the server ("Waiting for clinic") and are applied when RevDent is open and online on the clinic's device (checked every ~8 s, or press Sync now). A shared add matches an existing patient by phone number, otherwise creates one flagged "please complete details".
- Cancelled appointments leave the day's Scheduled column and appear in a **Cancelled** column for the same date (clinic and shared view), with who/what cancelled it. The clinic can Restore or send the rebook message.
- **Automatic cancel from patient texts** needs the WhatsApp Business (Cloud API) number: set `WA_VERIFY_TOKEN` and `WA_APP_SECRET` on the server, and in the Meta dashboard use callback URL `https://YOUR-SERVER/api/inbound/<share id>` (shown in the app). Clear "cancel" messages from a known number cancel that patient's next appointment; questions, "change the time" and unknown numbers go to "Patient messages to check". Messages to a personal WhatsApp cannot be read by any website: use "Paste it here" on the Calendar page.
- Needs `server.js`; the Netlify function is view-only. The webhook has been tested only with simulated signed requests, not with live Meta.

## Other things to know
- WhatsApp: every message opens in WhatsApp with the text filled in and you tap Send. Sending without a tap needs the WhatsApp Business API and a server (not included).
- The live calendar link and cloud sync need this app hosted at an address others can reach (not localhost or a static preview). `netlify/functions/schedule.js` is an untested alternative host.
- Starter prescriptions are common textbook regimens; the dentist must review every dose. The app only warns about a recorded penicillin allergy (it does not check other interactions).
- Data is in the browser (localStorage + IndexedDB). Keep backups.
