const MAX_HTML = 400_000;
const FETCH_MS = 7000;

export type LinkPreview = {
  url: string;
  embeddable: boolean;
  title: string;
  description: string;
  image: string;
  siteName: string;
  favicon: string;
};

export function isPublicHttpUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      host === "0.0.0.0" ||
      host === "::1"
    ) {
      return null;
    }
    if (isPrivateIp(host)) return null;
    return url;
  } catch {
    return null;
  }
}

function isPrivateIp(host: string) {
  if (host === "127.0.0.1" || host === "::1") return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!ipv4) return false;
  const a = Number(ipv4[1]);
  const b = Number(ipv4[2]);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function attr(html: string, names: string[]) {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*)["']`,
      "i",
    );
    const a = re.exec(html);
    if (a?.[1]) return decode(a[1]);
    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${name}["']`,
      "i",
    );
    const b = re2.exec(html);
    if (b?.[1]) return decode(b[1]);
  }
  return "";
}

function decode(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function absoluteUrl(from: URL, value: string) {
  try {
    return new URL(value, from).href;
  } catch {
    return "";
  }
}

export function headersAllowEmbed(
  headers: Headers,
  parentOrigin?: string,
): boolean {
  const xfo = (headers.get("x-frame-options") || "").trim().toLowerCase();
  if (xfo === "deny" || xfo === "sameorigin") return false;
  if (xfo.startsWith("allow-from") && parentOrigin) {
    if (!xfo.includes(parentOrigin.toLowerCase())) return false;
  }

  const csp = headers.get("content-security-policy") || "";
  const ancestors = /(?:^|;)\s*frame-ancestors\s+([^;]+)/i.exec(csp);
  if (!ancestors) return true;
  const value = ancestors[1].trim().toLowerCase();
  if (value === "'none'") return false;
  if (value === "'self'") return false;
  if (parentOrigin && value.includes(parentOrigin.toLowerCase())) return true;
  if (value.includes("*") && !value.includes("'none'")) return true;
  return false;
}

export async function fetchLinkPreview(
  raw: string,
  parentOrigin?: string,
): Promise<LinkPreview | null> {
  const url = isPublicHttpUrl(raw);
  if (!url) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);
  let res: Response;
  try {
    res = await fetch(url.href, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (compatible; OTGFPreview/1.0; +https://otgf.app)",
      },
    });
  } catch {
    clearTimeout(timer);
    return {
      url: url.href,
      embeddable: false,
      title: url.hostname.replace(/^www\./, ""),
      description: "",
      image: "",
      siteName: url.hostname.replace(/^www\./, ""),
      favicon: faviconFor(url),
    };
  }
  clearTimeout(timer);

  const finalUrl = isPublicHttpUrl(res.url) ?? url;
  const embeddable = headersAllowEmbed(res.headers, parentOrigin);
  const type = res.headers.get("content-type") || "";
  const fallback: LinkPreview = {
    url: finalUrl.href,
    embeddable,
    title: finalUrl.hostname.replace(/^www\./, ""),
    description: "",
    image: "",
    siteName: finalUrl.hostname.replace(/^www\./, ""),
    favicon: faviconFor(finalUrl),
  };

  if (!type.includes("text/html") && !type.includes("application/xhtml")) {
    return fallback;
  }

  const buf = await res.arrayBuffer();
  const html = new TextDecoder("utf-8", { fatal: false }).decode(
    buf.byteLength > MAX_HTML ? buf.slice(0, MAX_HTML) : buf,
  );

  const titleTag = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] || "";
  const title =
    attr(html, ["og:title", "twitter:title"]) || decode(titleTag) || fallback.title;
  const description = attr(html, [
    "og:description",
    "twitter:description",
    "description",
  ]);
  const imageRaw = attr(html, ["og:image", "twitter:image"]);
  const siteName = attr(html, ["og:site_name"]) || fallback.siteName;
  const iconRel =
    /<link[^>]+rel=["'](?:shortcut icon|icon)["'][^>]+href=["']([^"']+)["']/i.exec(
      html,
    )?.[1] ||
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut icon|icon)["']/i.exec(
      html,
    )?.[1];

  return {
    url: finalUrl.href,
    embeddable,
    title: title.slice(0, 180),
    description: description.slice(0, 280),
    image: imageRaw ? absoluteUrl(finalUrl, imageRaw) : "",
    siteName: siteName.slice(0, 80),
    favicon: iconRel ? absoluteUrl(finalUrl, iconRel) : faviconFor(finalUrl),
  };
}

function faviconFor(url: URL) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url.hostname)}&sz=64`;
}
