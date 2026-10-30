# How I built Sip & Snooze

## The problem

My family tracked our newborn's feeds, diapers and sleep with Nara Baby, and it was moving to a subscription. I wanted a replacement that was:

- **Free to run and free to use**, with no subscription, ads or paywalled basics
- **Shared live** between parents and grandparents, across **two separate families**
- **Easy to switch to**, bringing our existing history over from Nara
- **Fast one-handed** at 3 AM

## Key decisions

| Decision | Why |
|---|---|
| **Installable web app (PWA) instead of an App Store app** | No $99/year Apple developer fee and no review process. It installs to the iPhone Home Screen, runs full screen and works offline. |
| **Firebase on the free Spark plan** | Auth, a real-time database with offline caching, and hosting, all with no server to run and no credit card. |
| **Firestore security rules as the access-control layer** | With no custom backend, the rules *are* the backend. Families join with an invite code, entries must be signed by their author, removing a member rotates the code, and two families can never read each other's data. All of this is covered by emulator tests. |
| **A `Backend` interface with a Firebase version and a localStorage demo version** | The whole app runs offline with no account (`npm run dev:demo`), so every UI change could be tried instantly without touching real family data. |
| **Store everything in metric, convert for display** | Each phone picks its own units (Mom in ml, Grandpa in oz) without changing the shared data. |
| **A universal CSV importer** | Most baby apps export CSV, so one importer that detects columns and units covers Nara and others, and avoids lock-in in both directions. |

## My process with Claude Code

I used Claude Code as my AI development tool for the whole project. Each feature followed the same loop:

1. **Define it.** I wrote the requirement from real use, often with screenshots of how Nara did it (the feeding flow, the History timeline, the per-form unit picker).
2. **Plan it.** I talked through approaches and trade-offs with Claude Code before building: for example, how to compare two siblings "at the same age" in History and Growth.
3. **Build it.** I used Claude Code to generate, refactor and test the implementation.
4. **Verify it.** I ran the change in the demo build at phone size in light and dark mode, ran the test suite, then used it with real data.
5. **Ship it** with `npm run deploy`, then gathered feedback from both families for the next round.

## Verified against real data: examples

**Nara import.** Testing with our real Nara export turned up several problems synthetic test data had missed:
- Bottle amounts in fluid ounces (`FLOZ`) weren't converted.
- Bottles that mixed formula and breast milk were split wrongly.
- Solids, the baby's birth date and the date range needed handling.

Each fix came with a test case built from the real file's format.

**Free-tier write limits.** The Firebase console showed about 18,000 writes in a single day, close to the 20,000/day free limit, caused by repeated imports. That led to two changes:
- **Imports that never duplicate:** each imported row gets an ID derived from a hash of its contents, so re-importing a file overwrites instead of adding copies.
- **Bounded reads:** only the last week stays subscribed, and older weeks load on demand.

**Everyday friction.** Feedback from using the app daily drove features like:
- A unit switch on every form, instead of going to Settings.
- **Use last amount** for bottles.
- Swiping between days in History.
- Per-baby color themes, made more visible in dark mode after feedback.

## Quality checks

- **44 unit tests** (Vitest): CSV import against sample files from other apps, unit conversions, age math, and growth comparison.
- **18 security-rules tests** on the Firestore emulator: membership, invite codes, family isolation, and author-signed entries.
- **TypeScript** type checking on every build.
- **A manual check at iPhone size** in light and dark mode before each deploy.

## What's next

I'm now building features directly in the codebase, starting with small items from the backlog such as time shortcuts on entry forms and an "awake for" indicator on the Today screen. Larger items on the list include a printable pediatrician summary and WHO growth percentiles.
