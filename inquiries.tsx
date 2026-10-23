import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/inquiries")({
  component: () => <Navigate to="/inbox" />,
});
