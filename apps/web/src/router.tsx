import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";

import { getCurrentSession, landingPath } from "@/lib/auth";
import { AdminPage } from "@/pages/AdminPage";
import { EmployeeDashboardPage } from "@/pages/EmployeeDashboardPage";
import { FoundationBoardPage } from "@/pages/FoundationBoardPage";
import { LoginPage } from "@/pages/LoginPage";
import type { PrincipalType } from "@/types/hcis";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: () => <LoginPage />,
});

async function requirePrincipal(expected: PrincipalType) {
  const session = await getCurrentSession();
  if (!session) throw redirect({ to: "/" });

  if (session.principal.principalType !== expected) {
    throw redirect({ to: landingPath(session.principal.principalType) });
  }

  return session;
}

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: async () => {
    const session = await getCurrentSession();
    if (session) throw redirect({ to: landingPath(session.principal.principalType) });
  },
  component: LoginPage,
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app",
  beforeLoad: () => requirePrincipal("EMPLOYEE"),
  component: EmployeeDashboardPage,
});

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  beforeLoad: () => requirePrincipal("SUPER_ADMIN"),
  component: AdminPage,
});

const boardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/board",
  beforeLoad: () => requirePrincipal("FOUNDATION_BOARD"),
  component: FoundationBoardPage,
});

const routeTree = rootRoute.addChildren([loginRoute, appRoute, adminRoute, boardRoute]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
