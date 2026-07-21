import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MoziWatch",
    short_name: "MoziWatch",
    description:
      "Campground mosquito reports and approximate outlooks across Canada and the United States.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f6ef",
    theme_color: "#0b4b45",
    icons: [
      {
        src: "/moziwatch-logo-tbg.png",
        sizes: "890x890",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
