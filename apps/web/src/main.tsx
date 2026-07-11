import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { useAtomValue } from "jotai";
import {
  Navigate,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { themeAtom } from "@/lib/atoms";
import "./styles.css";

const DashboardPage = lazy(() =>
  import("@/routes/overview").then((module) => ({ default: module.DashboardPage })),
);
const ProvidersPage = lazy(() =>
  import("@/routes/providers").then((module) => ({ default: module.ProvidersPage })),
);
const DetailPage = lazy(() =>
  import("@/routes/detail/page").then((module) => ({ default: module.DetailPage })),
);
const SessionDetailPage = lazy(() =>
  import("@/routes/detail/session").then((module) => ({ default: module.SessionDetailPage })),
);

function RootRouteComponent() {
  const theme = useAtomValue(themeAtom);

  React.useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      const resolvedTheme = theme === "system" ? (media.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = resolvedTheme;
      document.documentElement.style.colorScheme = resolvedTheme;
    };

    applyTheme();

    if (theme !== "system") return;

    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [theme]);

  return (
    <Suspense
      fallback={
        <div role="status" className="grid min-h-screen place-items-center bg-[var(--background)]">
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
            Loading telemetry
          </span>
        </div>
      }
    >
      <Outlet />
    </Suspense>
  );
}

const rootRoute = createRootRoute({
  component: RootRouteComponent,
});

const dashboardLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "dashboard",
  component: () => (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Outlet />
    </main>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: "/",
  component: () => <Navigate to="/overview" />,
});

const overviewRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: "/overview",
  component: DashboardPage,
});

const providersRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: "/providers",
  component: ProvidersPage,
});

const detailLayoutRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: "/detail",
  component: () => <Outlet />,
});

const dayDetailRoute = createRoute({
  getParentRoute: () => detailLayoutRoute,
  path: "/$date",
  component: DetailPage,
});

const sessionDetailRoute = createRoute({
  getParentRoute: () => detailLayoutRoute,
  path: "/$date/$session",
  component: SessionDetailPage,
});

const routeTree = rootRoute.addChildren([
  dashboardLayoutRoute.addChildren([
    indexRoute,
    overviewRoute,
    providersRoute,
    detailLayoutRoute.addChildren([dayDetailRoute, sessionDetailRoute]),
  ]),
]);

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
