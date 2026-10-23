import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/shops/new")({
  component: () => <Navigate to="/" />,
});
