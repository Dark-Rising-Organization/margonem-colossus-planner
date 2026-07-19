# Margonem — Planer Grup

Client-side React + TypeScript SPA built with Vite. It plans optimal character groups for the game Margonem. There is **no backend**; all state persists in the browser's `localStorage` (keys prefixed with `mgp_`). The UI is in Polish.

## Cursor Cloud specific instructions

- Single frontend service only. Standard scripts live in `package.json`:
  - `npm run dev` — Vite dev server (defaults to http://localhost:5173).
  - `npm run build` — typecheck (`tsc -b`) + production build.
  - `npm run preview` — serve the production build.
- There is **no lint script and no test suite** configured. "Lint"/typecheck is covered by `tsc -b` (run via `npm run build`).
- No environment variables or secrets are required.
- State is stored in `localStorage`; to reset the app to a clean state, clear site data (or use the "Wyczyść wszystko" button in the UI).
