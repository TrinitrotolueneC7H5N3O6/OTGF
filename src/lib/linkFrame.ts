/** Rewrites well-known pages into a URL that can live inside an iframe. */
export function frameSrcFor(raw: string): string {
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();

    if (isGoogleHost(host)) {
      if (
        url.pathname === "/" ||
        url.pathname === "/webhp" ||
        url.pathname === "/search" ||
        url.pathname === "/search/"
      ) {
        if (url.pathname === "/") url.pathname = "/webhp";
        url.searchParams.set("igu", "1");
        return url.toString();
      }
      if (url.pathname.startsWith("/maps")) {
        const q =
          url.searchParams.get("q") ||
          url.searchParams.get("query") ||
          url.searchParams.get("daddr");
        const embed = new URL("https://maps.google.com/maps");
        if (q) embed.searchParams.set("q", q);
        embed.searchParams.set("output", "embed");
        return embed.toString();
      }
    }

    if (host === "youtu.be") {
      const id = url.pathname.replace(/^\//, "").split("/")[0];
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = url.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
      const shorts = url.pathname.match(/^\/shorts\/([^/]+)/);
      if (shorts?.[1]) return `https://www.youtube.com/embed/${shorts[1]}`;
    }

    return raw;
  } catch {
    return raw;
  }
}

function isGoogleHost(host: string) {
  return (
    host === "google.com" ||
    host.startsWith("google.") ||
    host.endsWith(".google.com") ||
    host === "maps.google.com"
  );
}
