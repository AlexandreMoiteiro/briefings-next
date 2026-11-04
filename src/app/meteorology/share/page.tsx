import type { Metadata } from "next";
import MeteorologyPage from "../page";

export const metadata: Metadata = {
  title: "AEMET Weather Charts · Briefings",
  description: "Standalone AEMET SIGWX and wind/temperature charts. Times in UTC.",
};

export default function ShareMeteorologyPage() {
  return <MeteorologyPage />;
}
