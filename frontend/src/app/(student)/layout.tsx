import type { ReactNode } from "react";

import { AcademyHeader } from "../../components/layout/AcademyHeader";
import { AccountProvider } from "../../components/layout/AccountProvider";

export default function StudentLayout({ children }: { children: ReactNode }) {
  return <AccountProvider><AcademyHeader />{children}</AccountProvider>;
}
