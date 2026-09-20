const STOP_WORDS = new Set([
  "senior", "junior", "staff", "principal", "lead", "sr", "jr", "associate", "intern",
  "ii", "iii", "the", "and", "for", "remote", "with",
]);

/**
 * Short stems from the job title ("Senior Backend Engineer" -> ["backen", "engine"]).
 * Stems match both "engineer" and "engineering" in a URL. Used only to break ties between
 * pages that are otherwise equally likely to be hiring pages.
 */
export function roleHints(title: string): string[] {
  const words = title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  return [...new Set(words.map((w) => (w.length > 6 ? w.slice(0, 6) : w)))];
}
