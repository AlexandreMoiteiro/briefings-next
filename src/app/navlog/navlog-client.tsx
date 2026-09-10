"use client";

import { NavlogStudio } from "./navlog-studio";

/**
 * Legacy compatibility export.
 *
 * The active NavLog page no longer uses this component. Keep a zero-argument
 * wrapper temporarily so older versioned NavLog modules continue to type-check
 * until they are deleted in a dedicated cleanup.
 */
export function NavlogClient() {
  return <NavlogStudio aircraftType="Tecnam P2006T" />;
}
