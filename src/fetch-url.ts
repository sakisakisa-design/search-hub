import { extractHostname } from "./utils";

export async function fetchUrl(url: string): Promise<{
  url: string;
  title: string;
  hostname: string;
  content: string;
  fetched_at: string;
}> {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Only http and https URLs are supported");
  const res = await fetch(parsed.toString(), {
    headers: {
      accept: "text/html, text/plain, application/xhtml+xml",
      "user-agent": "search-hub-mcp/0.1"
    }
  });
  if (!res.ok) throw new Error(`Failed to fetch URL: HTTP ${res.status}`);
  const html = await res.text();
  const title = extractTitle(html) || extractHostname(parsed.toString()) || parsed.toString();
  const content = htmlToText(html).slice(0, 30000);
  return {
    url: parsed.toString(),
    title,
    hostname: parsed.hostname,
    content,
    fetched_at: new Date().toISOString()
  };
}

function extractTitle(html: string): string {
  return decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "");
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
