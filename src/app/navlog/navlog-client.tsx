"use client";

/**
 * Legacy compatibility export.
 *
 * The previous NavLog UI accumulated route cards, workflow cards and DOM/CSS
 * decorators. The active page now uses NavlogStudio directly through
 * navlog-client-stable.tsx. Keep this small alias temporarily so any old local
 * imports keep compiling while the versioned NavLog wrappers are removed in a
 * later cleanup.
 */
export { NavlogStudio as NavlogClient } from "./navlog-studio";
