# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One person planning their own money ahead of time. They want to see a month (or a week) before it happens: rent, subscriptions, a paycheck schedule and a savings goal, ending in a projected balance. They enter every number by hand, by choice, and do not want to link a bank.

## Product Purpose

Flow answers one question: if my paychecks, bills and savings goals land on the dates I expect, what will I have left? Success is the person knowing, at a glance, whether they are living within their means this period and what a change (a what-if) would do.

## Positioning

A planning surface, not an account ledger. No bank connection, by design. Data stays on the device (IndexedDB) until the person chooses to sign in with Google to sync. No budget data leaves the device before that, though the page loads its fonts from Google Fonts.

## Operating Context

- Starting cash is typed into a first-run prompt and opens the current month. It is not updated automatically, and the prompt is currently the only place to set it.
- Each later month opens with the previous month's projected end balance.
- Week view spends only what is due that week and holds back later bills in the same month.
- Seven screens: Today, Cash flow, Budget, Recurring, Goals, Calendar, Settings.

## Capabilities and Constraints

- Cadences: weekly, biweekly, monthly, yearly, one-time. Payment plans end after N charges; one-time items have no limit.
- Rows can be edited, duplicated, turned off (paused for chosen months, still listed) or deleted with a scope: this month and later, only this month, this month and earlier, or every month.
- Goals: target, contribution amount and cadence, time-to-goal estimate. Contributions count against the period like bills.
- Today: safe-to-spend Runway first, then projected balance, Balance chart, leftover after bills and goals, spending, customizable card grid, Monarch-style Sankey, calendar with week and month views.
- Budget: where the period's income goes, by category. Recurring: every scheduled paycheck, bill and goal contribution in date order. Calendar: the period's events day by day.
- Settings: Google sign-in, budget history checkpoints that can be restored, currency, week start, appearance (light, dark, system), eight colour palettes, Sankey colour themes, sample data.
- Stack: React 19, Vite, Tailwind v4, zustand, d3-sankey, Firebase (Auth, Firestore, Hosting).

## Brand Commitments

Name: Flow. Plain, direct copy voice.

## Evidence on Hand

Demo budget data in `src/domain/demo.ts`. No testimonials, customers or metrics exist; do not invent them.

## Product Principles

- Manual on purpose: every number is the person's own, so the UI makes entering and changing numbers effortless.
- Private by default: the UI says plainly where data lives and when it leaves the device.
- One answer first: safe-to-spend leads; detail is one step away.
- What-ifs are cheap: turning things off and back on never loses data.
