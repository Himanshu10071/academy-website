import Link from "next/link";
import type { ReactNode } from "react";

import { AcademyHeader } from "../../components/layout/AcademyHeader";
import { AccountProvider } from "../../components/layout/AccountProvider";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <AccountProvider>
      <AcademyHeader />
      {children}
      <footer className="site-footer">
        <div className="container footer-inner">
          <div><strong>Prince Academy</strong><p>Focused learning at your own pace.</p></div>
          <nav aria-label="Footer"><Link href="/#courses">Courses</Link><Link href="/#demos">Demos</Link></nav>
          <small>© 2026 Prince Academy</small>
        </div>
      </footer>
    </AccountProvider>
  );
}
