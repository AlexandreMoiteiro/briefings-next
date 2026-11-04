/** Display-only fallback for older curated routes that were never assigned a category.
 * Never use a title-based guess as an authorization or database value. */
export function displayRouteCategory(route: { name: string; category?: "VFR" | "IFR" | null }): "VFR" | "IFR" | null {
  if (route.category) return route.category;
  if (/\bVFR\b/i.test(route.name)) return "VFR";
  if (/\bIFR\b|\bIR SKILL\b|\bINSTRUMENT\b/i.test(route.name)) return "IFR";
  return null;
}
