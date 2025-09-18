export type WebSnippet = { url: string; title?: string; snippet?: string };
export async function searchWeb(query: string, timeoutMs: number): Promise<WebSnippet[]> {
  // TODO: підключиш свій пошук (Google CSE / Bing)
  return [];
}
