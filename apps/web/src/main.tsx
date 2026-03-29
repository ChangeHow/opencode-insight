import React from "react";
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
import { DashboardPage } from "@/routes/overview";
import { ProvidersPage } from "@/routes/providers";
import { DetailPage } from "@/routes/detail/page";
import { SessionDetailPage } from "@/routes/detail/session";
import "./styles.css";

const rootRoute = createRootRoute({
  component: () => {
    const theme = useAtomValue(themeAtom);

    React.useEffect(() => {
      const media = window.matchMedia("(prefers-color-scheme: dark)");

      const applyTheme = () => {
        const resolvedTheme = theme === "system" ? (media.matches ? "dark" : "light") : theme;
        document.documentElement.dataset.theme = resolvedTheme;
      };

      applyTheme();

      if (theme !== "system") {
        return;
      }

      media.addEventListener("change", applyTheme);
      return () => media.removeEventListener("change", applyTheme);
    }, [theme]);

    return <Outlet />;
  },
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
