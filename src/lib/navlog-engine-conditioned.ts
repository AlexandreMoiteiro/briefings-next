import type {
  NavlogCalculationResult,
  NavlogDataBundle,
  NavlogRouteWaypoint,
  NavlogSetupForm,
} from "@/lib/navlog";
import { getP2006TNavlogConditionsVersion } from "@/lib/performance/p2006t-navlog-settings";
import { buildNavlogCalculation as calculateNavlog } from "./navlog-engine";

export {
  applyMagVar,
  destinationPoint,
  formatClock,
  formatDuration,
  gcCourseTc,
  gcDistanceNm,
  makeVorRadialDistanceFix,
  makeWaypointFromPoint,
  navlogLegsToCsv,
  navlogSummary,
  parseRouteText,
  pointAlongGreatCircle,
  routeItem15,
  waypointToNode,
  windTriangle,
  wrap360,
} from "./navlog-engine";

export function buildNavlogCalculation(
  setup: NavlogSetupForm,
  waypoints: NavlogRouteWaypoint[],
  data: NavlogDataBundle | null
): NavlogCalculationResult {
  let cachedVersion = -1;
  let cached: NavlogCalculationResult | null = null;

  const current = () => {
    const version = getP2006TNavlogConditionsVersion();
    if (!cached || cachedVersion !== version) {
      cached = calculateNavlog(setup, waypoints, data);
      cachedVersion = version;
    }
    return cached;
  };

  return {
    get nodes() {
      return current().nodes;
    },
    get legs() {
      return current().legs;
    },
  };
}
