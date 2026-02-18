# Smart Heating Design Tool — JavaScript/TypeScript (Static Site)

This project is a static-site rewrite of the Dash tool, designed for deployment on **GitHub Pages**.

It ports these Python modules to TypeScript so calculations can run entirely in the browser:
- `domain/hydraulics.py` → `src/domain/hydraulics.ts`
- `domain/valve.py` → `src/domain/valve.ts`
- `services/pump_service.py` → `src/services/pumpService.ts`

> Heat loss + detailed radiator sizing are not fully ported yet because the underlying `domain/heat_load.py` and `domain/radiator.py` were not included.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Deploy to GitHub Pages

A workflow is included at `.github/workflows/deploy.yml`.

1. Push to the `main` branch.
2. In GitHub: Settings → Pages → set Source to **GitHub Actions**.
3. The site will publish from the built `dist/` output.

## Notes about units

Internally pressures are computed in **Pa** (matching the Python code) and displayed as **kPa** in the UI.
