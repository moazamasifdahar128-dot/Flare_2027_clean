import { createFileRoute } from "@tanstack/react-router";
import { PaymentsPage } from "@/components/shola/founder-room";

export const Route = createFileRoute("/founder/payment-accounts")({
  component: PaymentsPage,
});
