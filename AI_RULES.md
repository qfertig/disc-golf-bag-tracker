# AI_RULES.md

## Tech Stack Overview
- **React** with **TypeScript** for frontend logic
- **Next.js** for server-side rendering and routing
- **Capacitor** for cross-platform mobile (Android/iOS) integration
- **SQLite** via `@capacitor-community/sqlite` for local database storage
- **Tailwind CSS** for utility-first styling
- **shadcn/ui** for prebuilt, customizable UI components
- **Lucide React** for icon components
- **React Router** for client-side routing (managed in `src/App.tsx`)
- **SQL.js** for web-based SQLite support

## Library Usage Rules
1. **UI Components**: Use **shadcn/ui** components for all UI elements. Do not modify their source files—create new components if customization is needed.
2. **Styling**: Use **Tailwind CSS** for all styling. Leverage its responsive design utilities for mobile/tablet/desktop compatibility.
3. **Icons**: Use **Lucide React** icons (`import { IconName } from 'lucide-react'`) for all icon needs.
4. **Routing**: Use **React Router** for client-side navigation. Keep route definitions in `src/App.tsx`.
5. **Database**: Use `@capacitor-community/sqlite` for all local storage needs. Use `dbQuery`/`dbRun` from `src/lib/db.ts` for database interactions.
6. **Notifications**: Use `react-hot-toast` for toast notifications (import from `react-hot-toast`).
7. **Error Handling**: Use `try/catch` blocks for async operations unless explicitly instructed otherwise.
8. **No Third-Party Libraries**: Avoid adding new libraries without approval. Use existing ones where possible.
9. **Responsive Design**: Ensure all components use Tailwind's responsive utilities (e.g., `sm:`, `md:`, `lg:` prefixes).
10. **Code Structure**: Keep components small (<100 lines), focused, and organized in `src/components/`. Never add new components to existing files.