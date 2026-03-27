import React from "react";
import ReactDOM from "react-dom/client";
import { useAtomValue } from "jotai";
import { Navigate, Outlet, RouterProvider, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { themeAtom } from "@/lib/atoms";
import { DashboardPage, DetailPage, ProvidersPage, SessionDetailPage } from "@/routes/dashboard";
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

    return (
      <>
        <Outlet />
      </>
    );
  },
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <Navigate to="/overview" />,
});

const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/overview",
  component: DashboardPage,
});

const providersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/providers",
  component: ProvidersPage,
});

const detailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/detail/$date",
  component: DetailPage,
});

const sessionDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/detail/$date/$session",
  component: SessionDetailPage,
});

const routeTree = rootRoute.addChildren([indexRoute, overviewRoute, providersRoute, detailRoute, sessionDetailRoute]);

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
