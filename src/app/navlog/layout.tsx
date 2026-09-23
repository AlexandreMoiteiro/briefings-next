import type { ReactNode } from "react";
import styles from "./navlog-layout.module.css";

export default function NavlogLayout({ children }: { children: ReactNode }) {
  return <div className={styles.shell}>{children}</div>;
}
