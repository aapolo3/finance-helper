# Flow — private budget

Manual-input finance app with a Monarch-style Sankey diagram. Data stays in this browser (IndexedDB) until you sign in with Google to sync. No bank linking.

Live site: https://finance-helper-274a9.web.app

## Run

```bash
npm install
npm run dev
```

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Vite dev server |
| `npm test` | Run the tests (Vitest) |
| `npm run lint` | Run oxlint |
| `npm run build` | Typecheck and build for production |
| `npm run preview` | Serve the production build locally |

## Features

- **Today:** safe-to-spend Runway first, then projected balance, leftover after bills and goals, spending, a Balance chart, a customizable card grid, and the Sankey
- **Cash flow:** income and expenses with weekly / biweekly / monthly / yearly / one-time cadence, in a list or columns
- **Budget:** where the period's income is going, by category
- **Recurring:** every scheduled paycheck, bill, and goal contribution in date order
- **Goals:** contribution cadence and time-to-goal estimate
- **Calendar:** the same events day by day
- **Settings:** sign-in and sync, budget history, currency, week start, appearance, color palette, Sankey colors, sample data

Across the app:

- Adjustable monthly income override
- Weekly and monthly views
- Payment plans (`ends after N charges`)
- On/off toggles for what-if budgeting, for chosen months
- Light, dark, or system appearance (per device)
- Eight color palettes, default Paper; the choice syncs when signed in

## Privacy / sync

Data is stored in IndexedDB on this device. No budget data leaves the device until you use **Settings → Sign in with Google**, which syncs to Firestore (`finance-helper-274a9`). The page does load its fonts from Google Fonts, so the browser contacts Google on load. Synced paths:

| Path | Contents |
|------|----------|
| `users/{uid}/budget/current` | The budget |
| `users/{uid}/settings/preferences` | Color palette |
| `users/{uid}/budgetHistory/{docId}` | Restorable budget snapshots |

- If two devices disagree, the newer revision wins. The replaced copy is archived to budget history first, and history can be restored from Settings.
- Edits save locally after 80 ms and to the cloud after 1500 ms, so a burst of edits costs one Firestore write.
- The Firebase SDK loads on demand rather than with the first page. If the load fails, for example offline, the next attempt retries it.

## Deploy

```bash
npm run build
npx firebase deploy --only hosting --project finance-helper-274a9
# or everything:
npx firebase deploy --only hosting,auth,firestore --project finance-helper-274a9
```

In Firebase Console → Authentication → Settings → Authorized domains, include `localhost`, `127.0.0.1`, and `finance-helper-274a9.web.app` for Google sign-in.
