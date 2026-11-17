import type { MetadataRoute } from "next";

// Lets browsers install the site as a desktop app (its own window and Dock icon). It's still the
// live site inside, so signing in and posting work exactly as they do in the browser.
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "willy.work",
        short_name: "willy.work",
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#ffffff",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
    };
}
