# Sip & Snooze

A free baby tracker for our families: feeds, diapers, sleep, medicine, temperature, doctor visits, vaccines and growth. It works as a web app saved to the iPhone Home Screen, syncs between everyone in a family, and keeps each family's data private.

Costs nothing to run. It uses Firebase's free Spark plan, which needs no credit card.

---

## Trying it on your Mac (no setup)

```bash
npm install
npm run dev
```

Open http://localhost:5173. Without Firebase it runs in **demo mode**: data stays in that browser only and no password is needed.

---

## Going live: one-time Firebase setup (about 15 minutes)

### 1. Create the project
1. Go to https://console.firebase.google.com and sign in with your Google account.
2. Click **Create a project**. Name it something like `baby-log`. You can turn Google Analytics **off**.

### 2. Turn on sign-in
1. In the left menu: **Security → Authentication → Get started**.
2. Under **Sign-in method**, pick **Email/Password**, switch on the first toggle, and click **Save**.

### 3. Create the database
1. In the left menu: **Databases & Storage → Firestore → Create database**. Choose the **Standard** edition and keep the database ID `(default)`.
2. Choose a location near you (e.g. `nam5 (United States)`). This can't be changed later.
3. Choose **Start in production mode**. Our own rules replace these in step 5.

### 4. Register the web app and copy its settings
1. On **Project Overview**, click **+ Add app** → the **`</>`** (Web) icon.
2. Nickname: `Sip & Snooze`. Leave "Firebase Hosting" unticked, then click **Register app**.
3. You'll see a `firebaseConfig` block. In this folder, copy `.env.example` to `.env.local` and fill in:
   - `apiKey` → `VITE_FIREBASE_API_KEY`
   - `authDomain` → `VITE_FIREBASE_AUTH_DOMAIN`
   - `projectId` → `VITE_FIREBASE_PROJECT_ID`
   - `appId` → `VITE_FIREBASE_APP_ID`

These values aren't secret. Every website using Firebase shows them. Your data is protected by the rules in `firestore.rules`.

### 5. Publish
```bash
npx firebase login
npx firebase use --add
npm run deploy
```
- `firebase login` opens the browser so you can sign in with the same Google account.
- `firebase use --add`: pick your project, and type `default` when asked for an alias.
- `npm run deploy` builds the app and uploads the security rules and the website.

When it finishes, it prints your address: **https://sipandsnooze.web.app** (set by `"site"` in `firebase.json`).

For **Continue with Google** to work there, add `sipandsnooze.web.app` under **Security → Authentication → Settings → Authorized domains**. `VITE_FIREBASE_AUTH_DOMAIN` must also be that address, so Google sign-in works inside the iPhone Home Screen app.

### 6. Put it on each phone
1. On the iPhone, open the address in **Safari**.
2. Tap **Share → Add to Home Screen → Add**.
3. Open Sip & Snooze from the Home Screen, tap **Create account**, then:
   - **First person in a family:** "Start a new family", add the baby, then share the **invite code** from Settings.
   - **Everyone else:** "Join your family" with that code.

The second family does the same and gets its own code. The two families can never see each other's data. Someone who helps both families (a grandparent, for example) can join both and switch in Settings.

---

## Updating the app later
Make the change, then run `npm run deploy` again. Phones pick up the new version the next time the app is opened.

## Handy commands
| Command | What it does |
|---|---|
| `npm run dev` | Run on your Mac (demo mode, or real Firebase if `.env.local` exists) |
| `npm run dev:demo` | Run on your Mac in demo mode, even with `.env.local` set |
| `npm test` | Check the CSV import against sample files from other apps |
| `npm run deploy` | Build and publish the website and security rules |
| `npm run test:rules` | Check that families can't see each other's data (needs Java) |
| `npm run emulators` + `npm run dev:emulator` | Run against a local fake Firebase for testing |

## How it's built
- **React + TypeScript + Vite**, styled with **Tailwind CSS**
- **vite-plugin-pwa**: Home Screen icon, full-screen, works offline
- **Firebase Auth** (email + password) and **Cloud Firestore** (data, sync, offline cache)
- **Firebase Hosting** for the website

Data layout: `families/{family}` → `babies/{baby}` → `entries` (feeds, diapers, sleep, medicine, temperature) and `records` (visits, vaccines, growth, questions). All amounts are stored in metric. Each phone picks its own units in Settings.
