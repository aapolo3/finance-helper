# Backend, web performance and security hardening

Source: read-only audits of 2026-11-06. No separate spec exists; this file is the authority.

## Global Constraints

- Do not commit. The user makes all commits. Leave changes in the working tree.
- Do not deploy, and do not contact or write to Firebase. Do not start a dev server.
- No behavior change the user can see, except faster loading and fewer network calls.
- Offline-first stays intact: the app must load and edit from IndexedDB with no network.
- Every local edit must still reach IndexedDB and, when signed in, Firestore. Pending cloud saves must not be lost on sign-out, account switch or page hide.
- Account isolation stays intact: no write may land under a uid other than the one that made the edit.
- `npx vitest run`, `npx tsc -b` and `npx oxlint` must not regress. Baseline: 98 tests pass, `tsc` clean.
- Build output goes outside the repo: `npx vite build --outDir <scratch dir> --emptyOutDir`. Do not overwrite `dist/`.

## Task 1: Reduce Firestore cost of saving

Files: `src/state/budgetStore.ts`, `src/storage/firestoreBudget.ts`, `src/storage/budgetHistory.ts`, and their tests.

1. Split the save debounce in `budgetStore.ts`: keep the IndexedDB write at 80ms; debounce the cloud write at 1500ms. Pending cloud writes must flush on page hide and before sign-out or account switch, wherever such flushing exists today or is needed for the same guarantee.
2. Serialize persists: each new persist chains on the previous one, so overlapping `setDoc` calls cannot land out of order.
3. `saveCloudBudget`: for reason `auto`, stop the `getDoc` on each save by holding the last-known remote state in memory, when that keeps archive behavior correct. The in-memory value must be reset per uid.
4. `archiveCloudBudget`: dedupe with a `limit(1)` query for the newest history doc, instead of reading up to 30 docs. Run prune only when a doc was actually created.

Tests: cover debounce split, ordering under overlapping persists, flush, and prune-only-on-create.

## Task 2: Remove redundant work on the pull path

Files: `src/storage/cloudSync.ts`, `src/storage/budgetHistory.ts`, `src/state/budgetStore.ts`, and tests.

1. In the remote snapshot handler, remove the cloud `archiveCloudBudget(...'auto')` call, because the saving device already archived. Keep the local archive.
2. Remove the duplicate `loadCloudBudget` at `startCloudSync` by passing through the state `mergeOnSignIn` read, if one is available.
3. `seedCloudHistoryIfEmpty`: check emptiness with `limit(1)`.
4. Remove the redundant save in `syncNow` after a pull, only if it does not push anything that a pull alone would miss. If it is needed, leave it and say why in the report.

## Task 3: Take Firebase off the critical path

Files: `src/lib/firebase.ts`, `src/state/authStore.ts`, `src/storage/*` that import Firebase, `vite.config.ts` if needed.

Load Firebase by dynamic `import()`, so `index.html` no longer modulepreloads the firebase chunk and IndexedDB hydrate can render first. Type-only imports stay static. Signed-in users must not see a signed-out flash that differs from today's loading behavior. A failed chunk load (offline) must not break local use.

Verify with a scratch build: `index.html` has no modulepreload for firebase. Report chunk sizes.

## Task 4: Security configuration

Files: `.gitignore`, `firebase.json`.

1. Add to `.gitignore`: `*.csv`, `firebase-adminsdk-*.json`, `serviceAccountKey.json`. Do not ignore root-level JSON config such as `firebase.json` or `package.json`.
2. In `firebase.json`, update the stale inline-script hash in the CSP to match a fresh build. Keep the header `Content-Security-Policy-Report-Only`.
