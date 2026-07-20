const DEFAULT_TAXI_MINUTES = 10;

let taxiMinutes = DEFAULT_TAXI_MINUTES;

export function getP2006TTaxiMinutes() {
  return taxiMinutes;
}

export function setP2006TTaxiMinutes(value: number) {
  taxiMinutes = Math.max(0, Math.round(Number(value || 0)));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("p2006t-taxi-time-change"));
  }
}

export function resetP2006TTaxiMinutes() {
  setP2006TTaxiMinutes(DEFAULT_TAXI_MINUTES);
}
