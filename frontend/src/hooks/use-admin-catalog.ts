import { useMemo } from "react";

import { useAccount } from "../components/layout/AccountProvider";
import { adminCatalog } from "../lib/api/catalog";

export function useAdminCatalog() {
  const { token } = useAccount();
  return useMemo(() => {
    if (!token) throw new Error("An authenticated admin session is required.");
    return adminCatalog(token);
  }, [token]);
}
