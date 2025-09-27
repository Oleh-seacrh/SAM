/**
 * Generate flag image source URL for country ISO-2 code
 * Using flag-icons.net for reliable flag images
 */
export function flagImgSrc(iso: string): string {
  if (!iso || iso.length !== 2) {
    return '';
  }
  return `https://flagcdn.com/16x12/${iso.toLowerCase()}.png`;
}

/**
 * Get flag emoji for country ISO-2 code (fallback option)
 */
export function flagEmoji(iso: string): string {
  if (!iso || iso.length !== 2) {
    return '🏳️';
  }
  
  const codePoints = iso
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
    
  return String.fromCodePoint(...codePoints);
}