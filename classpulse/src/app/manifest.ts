import type { MetadataRoute } from "next";

/** Web app manifest: lets teachers install ClassPulse on Chromebooks, Windows, Android and iOS. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "ClassPulse",
    short_name: "ClassPulse",
    description: "Better classroom management. Stronger student support. Less paperwork.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    orientation: "any",
    background_color: "#00133d",
    theme_color: "#001a40",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/brand/classpulse-app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      { name: "Live classroom", short_name: "Classroom", url: "/classroom", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Take attendance", short_name: "Attendance", url: "/attendance", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Students", url: "/students", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
