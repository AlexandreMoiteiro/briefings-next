/**
 * Route IDs confirmed by the site owner as personally authored.
 *
 * The old shared table has no provenance: created_by is NULL on every route,
 * and its source field records imports, not authors. Intentionally start
 * empty until Alexandre confirms the exact routes. Never infer authorship
 * from source='seed' or source='routes.json'.
 */
export const verifiedNavlogRouteIds: readonly string[] = [];
