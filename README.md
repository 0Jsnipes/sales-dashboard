# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## Demo mode

- Add `?demo=true` to the URL (example: `http://localhost:5173/sales?demo=true`).
- Or set `VITE_DEMO_MODE=true` in `.env.local` and restart the dev server.
- Demo mode is read-only and uses mock data.

## Data notes

- ATT and T-Fiber knocks were stored as one combined knock total through 6/17/2026.
  Starting after that date, manually entered knocks are treated as ATT knocks and
  uploaded knock reports are treated as T-Fiber knocks.
- Install tracker counts are based on install status and install due date when
  available. Pending means an order is not active, cancelled, churned, or past due;
  overdue pending orders move into Past Due. Installed means the order status reads
  as active, installed, or activated. The Installed vs Pending chart and Install
  Tracker both use the same date and provider filters from the Controls section.
- Cancellation counts are order-level. An uploaded order is counted as cancelled
  when any cancellation status or cancellation date column is present on that
  order row. T-Fiber orders that are still pending more than 31 days after their
  order date are also counted as cancelled.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
