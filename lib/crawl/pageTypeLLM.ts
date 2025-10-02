// lib/crawl/pageTypeLLM.ts
// Zero-shot page type classification using LLM

import type { PageDescriptor, PageTypeResult } from "../types";
import { pageTypePreset } from "../llm-presets";

export async function classifyPageType(
  descriptor: PageDescriptor,
  provider: "openai" | "anthropic" | "gemini" = "openai"
): Promise<PageTypeResult> {
  // Build compact representation of page
  const pageContent = buildPageContent(descriptor);
  const prompt = pageTypePreset(pageContent);

  try {
    const rawResponse = await callLLM(provider, prompt);
    const parsed = parseResponse(rawResponse);
    return parsed;
  } catch (error) {
    console.error("classifyPageType error:", error);
    // Fallback: heuristic classification
    return heuristicClassify(descriptor);
  }
}

function buildPageContent(descriptor: PageDescriptor): string {
  const parts: string[] = [];

  if (descriptor.title) {
    parts.push(`Title: ${descriptor.title}`);
  }

  if (descriptor.h1.length > 0) {
    parts.push(`H1: ${descriptor.h1.slice(0, 3).join(" | ")}`);
  }

  if (descriptor.h2.length > 0) {
    parts.push(`H2: ${descriptor.h2.slice(0, 5).join(" | ")}`);
  }

  if (descriptor.h3.length > 0) {
    parts.push(`H3: ${descriptor.h3.slice(0, 5).join(" | ")}`);
  }

  if (descriptor.firstParagraph) {
    parts.push(`First paragraph: ${descriptor.firstParagraph.slice(0, 300)}`);
  }

  if (descriptor.emails.length > 0) {
    parts.push(`Emails found: ${descriptor.emails.length}`);
  }

  if (descriptor.phones.length > 0) {
    parts.push(`Phones found: ${descriptor.phones.length}`);
  }

  return parts.join("\n");
}

async function callLLM(provider: string, prompt: string): Promise<string> {
  if (provider === "openai") {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("Missing OPENAI_API_KEY");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content: "You are a precise web page classifier. Output ONLY raw JSON.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 500,
      }),
    });

    const json = await response.json();
    if (!response.ok) {
      throw new Error(json?.error?.message || "OpenAI API error");
    }

    return json.choices?.[0]?.message?.content || "{}";
  }

  // For other providers, fallback to heuristic
  throw new Error(`Provider ${provider} not implemented for page classification`);
}

function parseResponse(raw: string): PageTypeResult {
  try {
    // Try direct parse
    const parsed = JSON.parse(raw);
    if (parsed.pageType && parsed.confidence !== undefined) {
      return {
        pageType: parsed.pageType,
        confidence: parsed.confidence,
        evidence: Array.isArray(parsed.evidence) ? parsed.evidence.slice(0, 3) : [],
      };
    }
  } catch {
    // Try to extract JSON from markdown
    const match = raw.match(/```json\s*([\s\S]*?)\s*```/);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]);
        return {
          pageType: parsed.pageType || "OTHER",
          confidence: parsed.confidence || 0.5,
          evidence: Array.isArray(parsed.evidence) ? parsed.evidence.slice(0, 3) : [],
        };
      } catch {
        // Fall through
      }
    }

    // Try to find JSON object in text
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          pageType: parsed.pageType || "OTHER",
          confidence: parsed.confidence || 0.5,
          evidence: Array.isArray(parsed.evidence) ? parsed.evidence.slice(0, 3) : [],
        };
      } catch {
        // Fall through
      }
    }
  }

  // Fallback
  return {
    pageType: "OTHER",
    confidence: 0.3,
    evidence: ["Failed to parse LLM response"],
  };
}

function heuristicClassify(descriptor: PageDescriptor): PageTypeResult {
  const text = [
    descriptor.title || "",
    ...descriptor.h1,
    ...descriptor.h2,
    descriptor.firstParagraph || "",
  ].join(" ").toLowerCase();

  // Check for contact indicators
  if (
    text.includes("contact") ||
    text.includes("get in touch") ||
    text.includes("reach us") ||
    (descriptor.emails.length > 0 && descriptor.phones.length > 0)
  ) {
    return {
      pageType: "CONTACT",
      confidence: 0.7,
      evidence: ["Contains contact-related keywords", "Has contact information"],
    };
  }

  // Check for about indicators
  if (
    text.includes("about us") ||
    text.includes("who we are") ||
    text.includes("our story") ||
    text.includes("our mission")
  ) {
    return {
      pageType: "ABOUT",
      confidence: 0.7,
      evidence: ["Contains about-related keywords"],
    };
  }

  // Check for products indicators
  if (
    text.includes("products") ||
    text.includes("services") ||
    text.includes("catalog") ||
    text.includes("what we offer")
  ) {
    return {
      pageType: "PRODUCTS",
      confidence: 0.7,
      evidence: ["Contains product-related keywords"],
    };
  }

  return {
    pageType: "OTHER",
    confidence: 0.5,
    evidence: ["No specific page type indicators found"],
  };
}
