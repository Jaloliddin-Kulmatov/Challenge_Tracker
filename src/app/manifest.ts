import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Challenge Tracker",
    short_name: "Challenges",
    description: "Create, schedule and track any challenge.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f7f7f5",
    theme_color: "#0f7a5c",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
