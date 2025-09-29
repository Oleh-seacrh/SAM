export function flagImgSrc(iso: string): string {
  if (!iso || iso.length !== 2) return "";
  return `https://flagcdn.com/16x12/${iso.toLowerCase()}.png`;
}

export function flagEmoji(iso: string): string {
  if (!iso || iso.length !== 2) return "🏳️";
  return String.fromCodePoint(
    ...iso
      .toUpperCase()
      .split("")
      .map((c) => 127397 + c.charCodeAt(0))
  );
}
