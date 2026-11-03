# MedMinder

A private record of the medicines you take and how you're doing on them — built to be
handed to a pharmacist. No account, no server, no build step. Everything lives in
`localStorage` on your own device.

**Live:** https://medminder-app.pages.dev

## What it does

- **Today** — the doses due today, tap to mark taken or skipped. Tapping again undoes it.
  Page back and forward through days with the arrows to fill in something you forgot.
- **Medicines** — name, strength, form, how much per dose, what it's for, how often and at
  what times. Optional start/end dates cover fixed courses. Give it a quantity and it
  counts down as you log doses, warning you when it's time to reorder.
- **Health** — blood pressure, blood sugar (with fasting / after-meal context), weight,
  pulse, temperature and SpO₂, each with a running trend line.
- **History** — a five-week heatmap, current streak, and 30-day adherence per medicine.
- **Share with pharmacist** — the ↥ button in the header. Builds a clean medication list
  with doses, frequencies, what each is for, how consistently you've taken them, and your
  recent readings. Three ways out:
  - **Print / Save PDF** — a proper typeset A4 sheet
  - **Copy text** — plain text, ready to paste into WhatsApp or email
  - **Share** — the system share sheet (on phones that support it)

Set your name once from ⋯ → *Your name* and it heads every sheet.

Keyboard: `1`–`4` switch tabs, `n` adds a medicine, `r` opens the report, `Esc` closes.

## No reminders

This deliberately doesn't do alarms or notifications. A web page can't reliably wake a
phone on a schedule without a push server, and that would mean your medicine schedule
leaving the device. If you want alarms, set them in your phone's clock app — this stays a
record you keep, not an app that nags you.

## Layout

```
public/          the site — this folder is what gets deployed, nothing else
  index.html     markup, the add/edit dialogs, the report sheet
  styles.css     design tokens, light + dark themes, layout, print stylesheet
  app.js         state, schedule maths, rendering, report builder
  sw.js          offline cache
  manifest.webmanifest, icon.svg, icon-maskable.svg
```

Keeping the site in `public/` is deliberate: `wrangler pages deploy` uploads every file in
the directory you point it at, and it ignores `.assetsignore`. Pointing it at the project
root once published `README.md` and `.claude/launch.json` to the open internet.

## Running it

```bash
npm run dev
```

Serves `public/` at http://localhost:4173. Opening `public/index.html` straight off disk
works too, but offline support and install-to-home-screen need a real origin.

## Deploying

```bash
npm run deploy
```

Pushes `public/` to the Cloudflare Pages project `medminder-app`. Needs `wrangler login`
once. When you change `app.js`, `styles.css` or `index.html`, bump `CACHE` in
`public/sw.js` so returning visitors don't get the old cached copy.

## Your data

It lives in `localStorage` for `medminder-app.pages.dev`, so your phone and your laptop
keep separate records, and clearing site data wipes it. Use ⋯ → *Back up data* to save a
JSON file, and *Restore from backup* to load it on another device. The deployed URL is
public to anyone who has it, but it only ever serves static files — nothing you record
leaves your device.

## A note

MedMinder records what *you* tell it. It doesn't check interactions, doses or contra-
indications — that's what you're handing the sheet to a pharmacist for.
