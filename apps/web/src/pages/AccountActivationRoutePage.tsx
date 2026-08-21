import { useParams } from "@tanstack/react-router";

import { AccountActivationPage } from "@/pages/AccountActivationPage";

export function AccountActivationRoutePage() {
  const { token } = useParams({ from: "/activate/$token" });
  return <AccountActivationPage token={token} />;
}
