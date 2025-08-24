export function getDomain(input: string): string {
  try {
    const u = new URL(input);
    return u.hostname.replace(/^www\./, "");
  } catch {
    // якщо прийшов displayLink від Google
    return input.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}

export function canonicalHomepage(input: string): string {
  try {
    const u = new URL(input);
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return `https://${getDomain(input)}`;
  }
}
