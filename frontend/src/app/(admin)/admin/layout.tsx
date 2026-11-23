import type { ReactNode } from "react";

import { AdminGate } from "../../../components/admin/AdminGate";
import { AcademyHeader } from "../../../components/layout/AcademyHeader";
import { AccountProvider } from "../../../components/layout/AccountProvider";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AccountProvider><AcademyHeader /><AdminGate>{children}</AdminGate></AccountProvider>;
}
