import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";

import { EmployeeDashboardPage } from "@/pages/EmployeeDashboardPage";
import { LoginPage } from "@/pages/LoginPage";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: () => <LoginPage />,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LoginPage,
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app",
  component: EmployeeDashboardPage,
});

const routeTree = rootRoute.addChildren([loginRoute, appRoute]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
