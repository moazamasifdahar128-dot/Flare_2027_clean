import { createFileRoute } from "@tanstack/react-router";
import { ReportsPage } from "@/components/shola/founder-room";

export const Route = createFileRoute("/founder/reports")({
  component: ReportsPage,
});
