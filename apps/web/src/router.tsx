import {
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
  Outlet,
  redirect,
} from "@tanstack/react-router";

import { getCurrentSession, landingPath } from "@/lib/auth";
import { AccountActivationPage } from "@/pages/AccountActivationPage";
import { AdminAccessPage } from "@/pages/AdminAccessPage";
import { AdminAttendancePage } from "@/pages/AdminAttendancePage";
import { AdminEmployeeDetailRoutePage } from "@/pages/AdminEmployeeDetailRoutePage";
import { AdminEmployeeImportHistoryPage } from "@/pages/AdminEmployeeImportHistoryPage";
import { AdminEmployeeImportPage } from "@/pages/AdminEmployeeImportPage";
import { AdminEmployeesPage } from "@/pages/AdminEmployeesPage";
import { AdminLeaveCalendarPage } from "@/pages/AdminLeaveCalendarPage";
import { AdminLeaveConfigurationPage } from "@/pages/AdminLeaveConfigurationPage";
import { AdminOrganizationPage } from "@/pages/AdminOrganizationPage";
import { AdminPage } from "@/pages/AdminPage";
import { EmployeeApprovalsPage } from "@/pages/EmployeeApprovalsPage";
import { EmployeeAttendancePage } from "@/pages/EmployeeAttendancePage";
import { EmployeeAttendanceResolutionPage } from "@/pages/EmployeeAttendanceResolutionPage";
import { EmployeeDashboardPage } from "@/pages/EmployeeDashboardPage";
import { EmployeeLeavePage } from "@/pages/EmployeeLeavePage";
import { EmployeePlannedLeavePage } from "@/pages/EmployeePlannedLeavePage";
import { EmployeeSpecialLeavePage } from "@/pages/EmployeeSpecialLeavePage";
import { FoundationBoardPage } from "@/pages/FoundationBoardPage";
import { HcAttendanceResolutionPage } from "@/pages/HcAttendanceResolutionPage";
import { HcLeaveValidationPage } from "@/pages/HcLeaveValidationPage";
import { HcPlannedLeavePage } from "@/pages/HcPlannedLeavePage";
import { LoginPage } from "@/pages/LoginPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import type { PrincipalType } from "@/types/hcis";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: NotFoundPage,
});

async function requirePrincipal(expected: PrincipalType) {
  const session = await getCurrentSession();
  if (!session) throw redirect({ to: "/" });
  if (session.principal.principalType !== expected) throw notFound();
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

const activationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/activate",
  component: AccountActivationPage,
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app",
  beforeLoad: () => requirePrincipal("EMPLOYEE"),
  component: EmployeeDashboardPage,
});

const employeeAttendanceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app/attendance",
  beforeLoad: () => requirePrincipal("EMPLOYEE"),
  component: EmployeeAttendancePage,
});

const employeeLeaveRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app/leave",
  beforeLoad: () => requirePrincipal("EMPLOYEE"),
  component: EmployeeLeavePage,
});

const employeeSpecialLeaveRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app/leave/special",
  beforeLoad: () => requirePrincipal("EMPLOYEE"),
  component: EmployeeSpecialLeavePage,
});

const employeePlannedLeaveRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app/leave/planned",
  beforeLoad: () => requirePrincipal("EMPLOYEE"),
  component: EmployeePlannedLeavePage,
});

const employeeAttendanceResolutionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app/attendance-resolution",
  beforeLoad: () => requirePrincipal("EMPLOYEE"),
  component: EmployeeAttendanceResolutionPage,
});

const employeeApprovalsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app/approvals",
  beforeLoad: () => requirePrincipal("EMPLOYEE"),
  component: EmployeeApprovalsPage,
});

const hcLeaveValidationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app/hc/leave",
  beforeLoad: () => requirePrincipal("EMPLOYEE"),
  component: HcLeaveValidationPage,
});

const hcPlannedLeaveRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app/hc/planned-leave",
  beforeLoad: () => requirePrincipal("EMPLOYEE"),
  component: HcPlannedLeavePage,
});

const hcAttendanceResolutionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app/hc/attendance-resolution",
  beforeLoad: () => requirePrincipal("EMPLOYEE"),
  component: HcAttendanceResolutionPage,
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

const adminAttendanceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/attendance",
  beforeLoad: () => requirePrincipal("SUPER_ADMIN"),
  component: AdminAttendancePage,
});

const adminLeaveRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/leave",
  beforeLoad: () => requirePrincipal("SUPER_ADMIN"),
  component: AdminLeaveConfigurationPage,
});

const adminLeaveCalendarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/leave/calendar",
  beforeLoad: () => requirePrincipal("SUPER_ADMIN"),
  component: AdminLeaveCalendarPage,
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
  activationRoute,
  appRoute,
  employeeAttendanceRoute,
  employeeLeaveRoute,
  employeeSpecialLeaveRoute,
  employeePlannedLeaveRoute,
  employeeAttendanceResolutionRoute,
  employeeApprovalsRoute,
  hcLeaveValidationRoute,
  hcPlannedLeaveRoute,
  hcAttendanceResolutionRoute,
  adminRoute,
  adminEmployeesRoute,
  adminEmployeeDetailRoute,
  adminEmployeeImportRoute,
  adminEmployeeImportHistoryRoute,
  adminOrganizationRoute,
  adminAttendanceRoute,
  adminLeaveRoute,
  adminLeaveCalendarRoute,
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
