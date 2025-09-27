export const runtime = "nodejs";

import { NextRequest } from "next/server";

type Item = { title?: string; snippet?: string; homepage: string; domain: string };
type Body = {
  provider: "openai" | "anthropic" | "gemini";
  model?: string;
  prompt: string;
  items: Item[];
};

// Helper function to fetch homepage content with timeout
async function fetchHomepageContent(url: string, timeoutMs = 5000): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      return '';
    }
    
    const html = await response.text();
    // Extract text from HTML (simple approach)
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 2000); // Limit to 2k characters
    
    return textContent;
  } catch (error) {
    // Return empty string on timeout or error
    return '';
  } finally {
    clearTimeout(timeoutId);
  }
}

async function buildUserText(prompt: string, items: Item[]) {
  const enrichedItems = [];
  
  // Fetch homepage content for each item
  for (const item of items) {
    const content = await fetchHomepageContent(item.homepage);
    enrichedItems.push({
      ...item,
      content: content || 'No content available'
    });
  }
  
  const list = enrichedItems.map(i => 
    `- ${i.domain} (${i.homepage})
  Title: ${i.title || 'N/A'}
  Snippet: ${i.snippet || 'N/A'}
  Homepage content: ${i.content.slice(0, 1500)}...`
  ).join("\n\n");
  
  const jsonShape = `Return JSON only in the shape:
{
  "scoresByDomain": {
    "<domain>": {
      "label": "good" | "maybe" | "bad",
      "confidence": 0.0,
      "reasons": ["short evidence bullets"],
      "tags": ["relevant tags"],
      "companyType": "manufacturer" | "distributor" | "dealer" | "other",
      "countryISO2": "XX" | null,
      "countryName": "Country name" | null,
      "detectedBrands": ["Brand1","Brand2"]
    }
  }
}`;
  
  return `You are an expert B2B prospecting assistant for medical imaging consumables (X-ray film, plates, chemistry, cassettes, viewers). Do not use any hints. Infer everything only from provided data (title, snippet, homepage, extracted text). Return STRICT JSON with fields described below.

${prompt.trim()}

For each site, analyze:
1. Label: "good" for ideal prospects, "maybe" for potential matches, "bad" for unsuitable
2. Company Type: Infer if they are manufacturer, distributor, dealer, or other
3. Country: Extract ISO-2 code and full country name if mentioned in content
4. Detected Brands: Only brands explicitly mentioned in the content

Sites to analyze:
${list}

${jsonShape}

Important: Only detect brands that are explicitly mentioned in the content. Do not hallucinate or assume brands. If no country is mentioned, set countryISO2 and countryName to null. Output JSON only.`;
}

function extractJson(s: string) {
  try { 
    const parsed = JSON.parse(s);
    // Validate the expected structure
    if (parsed.scoresByDomain && typeof parsed.scoresByDomain === 'object') {
      return parsed;
    }
    // Try to wrap older format
    if (typeof parsed === 'object' && !parsed.scoresByDomain) {
      return { scoresByDomain: parsed };
    }
    return parsed;
  } catch {}
  
  // Try to extract JSON block
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const cut = s.slice(start, end + 1);
    try { 
      const parsed = JSON.parse(cut);
      if (parsed.scoresByDomain && typeof parsed.scoresByDomain === 'object') {
        return parsed;
      }
      if (typeof parsed === 'object' && !parsed.scoresByDomain) {
        return { scoresByDomain: parsed };
      }
      return parsed;
    } catch {}
  }
  
  // Fallback with empty scoresByDomain
  return { scoresByDomain: {} };
}

export async function POST(req: NextRequest) {
  const { provider, model, prompt, items } = (await req.json()) as Body;

  if (!items?.length) {
    return Response.json({ error: "No items to score" }, { status: 400 });
  }
  if (!prompt?.trim()) {
    return Response.json({ error: "Missing prompt" }, { status: 400 });
  }

  const text = await buildUserText(prompt, items);

  let raw = "";
  try {
    if (provider === "openai") {
      const key = process.env.OPENAI_API_KEY;
      if (!key) return Response.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
      const mdl = model || "gpt-4o-mini";

      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "authorization": `Bearer ${key}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: mdl,
          temperature: 0,
          messages: [
            { role: "system", content: "You are an expert B2B prospecting assistant for medical imaging consumables. Analyze companies and return precise JSON with all required fields." },
            { role: "user", content: text }
          ],
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || "OpenAI error");
      raw = j.choices?.[0]?.message?.content ?? "";
    } else if (provider === "anthropic") {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) return Response.json({ error: "Missing ANTHROPIC_API_KEY" }, { status: 500 });
      const mdl = model || "claude-3-haiku-20240307";

      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: mdl,
          max_tokens: 3000,
          temperature: 0,
          messages: [
            { role: "user", content: text }
          ],
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || "Anthropic error");
      raw = j?.content?.[0]?.text ?? "";
    } else {
      // gemini
      const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      if (!key) return Response.json({ error: "Missing GEMINI_API_KEY/GOOGLE_API_KEY" }, { status: 500 });
      const mdl = model || "gemini-1.5-flash";

      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(mdl)}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text }] }],
            generationConfig: { temperature: 0 },
          }),
        }
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || "Gemini error");
      raw = j?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    }

    const parsed = extractJson(raw);

    // Return the new format with scoresByDomain
    return Response.json(parsed);
  } catch (e: any) {
    // Fallback response on error
    return Response.json({ 
      scoresByDomain: {},
      error: e.message || "Scoring failed", 
      raw 
    }, { status: 500 });
  }
}
