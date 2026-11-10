import type { MetadataRoute } from "next";
import { withBase } from "@/lib/paths";

export const dynamic = "force-static";

/** Web app manifest: lets teachers install ClassPulse on Chromebooks, Windows, Android and iOS. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: withBase("/"),
    name: "ClassPulse",
    short_name: "ClassPulse",
    description: "Better classroom management. Stronger student support. Less paperwork.",
    start_url: withBase("/dashboard/"),
    scope: withBase("/"),
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    orientation: "any",
    background_color: "#00133d",
    theme_color: "#001a40",
    categories: ["education", "productivity"],
    icons: [
      { src: withBase("/icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: withBase("/icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: withBase("/icon-maskable-512.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: withBase("/brand/classpulse-app-icon.svg"), sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      { name: "Live classroom", short_name: "Classroom", url: withBase("/classroom/"), icons: [{ src: withBase("/icon-192.png"), sizes: "192x192" }] },
      { name: "Take attendance", short_name: "Attendance", url: withBase("/attendance/"), icons: [{ src: withBase("/icon-192.png"), sizes: "192x192" }] },
      { name: "Students", url: withBase("/students/"), icons: [{ src: withBase("/icon-192.png"), sizes: "192x192" }] },
    ],
  };
}
