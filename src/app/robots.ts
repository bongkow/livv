import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/encryption"],
        disallow: ["/chat", "/rooms"],
      },
    ],
    sitemap: "https://livv.bongkow.com/sitemap.xml",
  };
}
