# React + Vite

## Fictional jobs-card demo

The Jobs page can show isolated, fictional sample cards for local UI work. The demo is available only when Vite is running in development mode and `VITE_JOBS_DEMO=true`; it does not call the recommendations API or use importer/database data.

To enable it locally, add this line to `frontend/.env.local` and restart the Vite server:

```env
VITE_JOBS_DEMO=true
```

To disable it, remove the line or set it to `false`, then restart Vite. The demo is forcibly disabled in production builds. Every sample is marked as fictional and has no application or job-details link.

## Jobs page

The Jobs page keeps personalized recommendations and adds a separate browse view backed by the existing `/jobs` API. Browse supports keyword, location, required-skill, experience, and job-type filters with pagination. Listings show source links and source-check metadata; salary and other details appear only when present in the API response. Both views continue to use the backend's active, verified, expiry, and availability-freshness filters.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
