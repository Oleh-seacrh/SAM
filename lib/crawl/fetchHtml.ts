// lib/crawl/fetchHtml.ts
// Fetch HTML with timeout and size limit

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // Remove trailing slash, lowercase
    let path = u.pathname.endsWith("/") && u.pathname.length > 1
      ? u.pathname.slice(0, -1)
      : u.pathname;
    return `${u.protocol}//${u.hostname}${path}${u.search}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export async function fetchHtml(
  url: string,
  timeoutMs: number = 5000,
  maxSizeBytes: number = 800 * 1024 // 800KB
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      throw new Error("Not HTML");
    }

    // Read response with size limit
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalSize += value.length;
      if (totalSize > maxSizeBytes) {
        reader.cancel();
        throw new Error(`Response too large: ${totalSize} bytes`);
      }

      chunks.push(value);
    }

    const allChunks = new Uint8Array(totalSize);
    let position = 0;
    for (const chunk of chunks) {
      allChunks.set(chunk, position);
      position += chunk.length;
    }

    const html = new TextDecoder("utf-8").decode(allChunks);
    return html;
  } catch (error: any) {
    if (error.name === "AbortError") {
      throw new Error(`Timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
