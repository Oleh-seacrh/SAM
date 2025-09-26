export type BrandMatch = { url: string; brands: string[] };

export type InferenceInput = {
  provider: string;
  model?: string;
  items: { url: string; title: string; snippet: string }[];
  brands: string[];
};
