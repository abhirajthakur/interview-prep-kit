// Lowercase, letters and digits only, single spaces. Used to compare quotes against source text
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// Counts real words: bullet dashes and stray punctuation do not count
export function wordCount(text: string): number {
  return text.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}
