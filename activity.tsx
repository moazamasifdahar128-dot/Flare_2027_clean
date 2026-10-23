import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/activity")({
  component: () => <Navigate to="/inbox" />,
});
