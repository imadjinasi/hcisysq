import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";

import { getCurrentSession, landingPath } from "@/lib/auth";
import { AdminAccessPage } from "@/pages/AdminAccessPage";
import { AdminEmployeeDetailRoutePage } from "@/pages/AdminEmployeeDetailRoutePage";
import { AdminEmployeeImportHistoryPage } from "@/pages/AdminEmployeeImportHistoryPage";
import { AdminEmployeeImportPage } from "@/pages/AdminEmployeeImportPage";
import { AdminEmployeesPage } from "@/pages/AdminEmployeesPage";
import { AdminOrganizationPage } from "@/pages/AdminOrganizationPage";
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

const adminEmployeesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/employees",
  beforeLoad: () => requirePrincipal("SUPER_ADMIN"),
  component: AdminEmployeesPage,
});

const adminEmployeeDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/employees/$employeeId",
  beforeLoad: () => requirePrincipal("SUPER_ADMIN"),
  component: AdminEmployeeDetailRoutePage,
});

const adminEmployeeImportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/employees/import",
  beforeLoad: () => requirePrincipal("SUPER_ADMIN"),
  component: AdminEmployeeImportPage,
});

const adminEmployeeImportHistoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/employees/imports",
  beforeLoad: () => requirePrincipal("SUPER_ADMIN"),
  component: AdminEmployeeImportHistoryPage,
});

const adminOrganizationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/organization",
  beforeLoad: () => requirePrincipal("SUPER_ADMIN"),
  component: AdminOrganizationPage,
});

const adminAccessRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/access",
  beforeLoad: () => requirePrincipal("SUPER_ADMIN"),
  component: AdminAccessPage,
});

const boardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/board",
  beforeLoad: () => requirePrincipal("FOUNDATION_BOARD"),
  component: FoundationBoardPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute,
  adminRoute,
  adminEmployeesRoute,
  adminEmployeeDetailRoute,
  adminEmployeeImportRoute,
  adminEmployeeImportHistoryRoute,
  adminOrganizationRoute,
  adminAccessRoute,
  boardRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
