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
- Install tracker counts use the order date for the selected date range. Pending
  means an order is not active, cancelled, churned, or a preorder; Past Due is the
  subset of pending orders with an overdue install/track date. Installed means the
  order status reads as active, installed, activated, or complete, or an activation
  date is present. The Installed vs Pending chart and Install Tracker both use the
  same date and provider filters from the Controls section.
- Progress Comparison uses sale dates: current week-to-date vs the matching days
  from the prior week, month-to-date vs the matching days from the prior month,
  and year-to-date vs the matching dates from the prior year.
- Cancellation counts are order-level. An uploaded order is counted as cancelled
  when any cancellation status or cancellation date column is present on that
  order row.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
