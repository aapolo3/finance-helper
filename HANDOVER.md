# Flow handover

Flow is a private budget you type in yourself. It answers one question: if my paychecks, bills, and savings goals land on the dates I expect, what will I have left?

It does not connect to a bank. Every number is entered by hand. That is intentional. The app is a planning surface, not an account ledger.

Live site: https://finance-helper-274a9.web.app

## Who it is for

Someone who wants to see a month (or a week) before it happens: rent, subscriptions, a paycheck schedule, and a savings goal, then a projected balance. They can turn an item off to try a what-if, or remove a canceled subscription from future months without erasing the months where it was already paid.

## What a person does

1. Answer the first-run prompt with the current balance. It becomes the opening balance of the current month.
2. Add income and expenses, usually one-time by default, with a date and a cadence when the item repeats.
3. Open Today. The period on screen (week or month) shows income, spending, goals, and a projected balance. A Sankey diagram shows where that money goes. The calendar shows the same events day by day.
4. Move to the next month. That month opens with the previous month’s projected balance, then applies its own paychecks and bills.
5. Optionally sign in with Google so the same budget is available on another device.

## The seven screens

**Today** is the answer. The safe-to-spend Runway leads, followed by projected balance, leftover after bills and goals, spending, a Balance chart, a customizable card grid, the Sankey, and the calendar. Week view spends only what is due that week and holds back later bills in the same calendar month so they are not forgotten.

**Cash flow** is the list of income and expenses. Amounts follow the same period as Today. Each row can be edited, duplicated, turned off, or deleted. Turning an item off pauses it and leaves the row visible. Deleting it asks how far the removal goes: this month and later, only this month, this month and earlier, or every month. A canceled subscription should be deleted from this month forward so it stops cluttering later months, while earlier months still show the charge that was already paid.

**Budget** shows where the period's income is going, by category.

**Recurring** lists every scheduled paycheck, bill, and goal contribution in the period, in date order.

**Goals** are savings targets with a contribution amount and cadence. Contributions count against the period like bills.

**Calendar** shows the period's events day by day.

**Settings** holds Google sign-in, budget history (checkpoints you can restore), currency, week start, appearance, color palette, Sankey colors, and sample data.
## How the money is counted

- Dates are calendar dates in the local timezone, not clock times. A new item defaults to today.
- Recurring income counts the paychecks that fall in the period. If no payday is set, the amount is spread across the period.
- Expenses count the occurrences that fall in the period. A payment plan is an expense that stops after a set number of charges. One-time items do not ask for that limit.
- Starting cash is the opening balance of the current month. It is not updated automatically, and the first-run prompt is currently the only place to set it.
- Each later month starts from the projected balance on the last day of the month before it.
- Turning an item off (`offRanges`) keeps it on the list but drops it from totals for the chosen months. Deleting it (`removedRanges`) drops it from both the list and the totals for those months.

## Where the data lives

The budget is stored in IndexedDB in the browser first. Signing in with Google syncs a copy to Cloud Firestore under `users/{uid}/budget/current` in the Firebase project `finance-helper-274a9`. If two devices disagree, the copy with the newer `updatedAtMs` wins. Save checkpoint keeps a restorable snapshot of the full budget, including the Sankey theme.

Signed in, the color palette syncs to `users/{uid}/settings/preferences` and restorable snapshots live in `users/{uid}/budgetHistory`. Appearance (light, dark, system) stays per device.

Until someone signs in, no budget data leaves the device. The page does load its fonts from Google Fonts, so the browser contacts Google on load.

## How the code is arranged

TypeScript and React (Vite). The budget rules live in `src/domain` and do not depend on the screen. `src/state/budgetStore.ts` holds the budget. `src/views` is the screens. `src/storage` is IndexedDB, Firestore, and history. `src/lib/firebaseLoader.ts` loads the Firebase SDK on demand.

`npm run dev` starts the app. `npm test` runs the tests. `npm run build` typechecks and builds. Hosting is Firebase; the deploy commands are in `README.md`.
