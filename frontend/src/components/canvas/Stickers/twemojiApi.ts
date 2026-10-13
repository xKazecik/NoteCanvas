// Twemoji API helper functions for static emoji support
// Uses unicode-emoji-json dataset + Twemoji CDN for images
// Graphics licensed under CC-BY 4.0: https://creativecommons.org/licenses/by/4.0/

const EMOJI_DATA_URL =
  "https://cdn.jsdelivr.net/gh/muan/unicode-emoji-json@main/data-by-group.json";
// Using jsdelivr CDN since MaxCDN is shut down
// See: https://github.com/twitter/twemoji/issues/580
const TWEMOJI_CDN_BASE =
  "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets";

export interface TwemojiItem {
  emoji: string;
  name: string;
  slug: string;
  skin_tone_support: boolean;
  unicode_version: string;
  emoji_version: string;
}

export interface TwemojiGroup {
  name: string;
  slug: string;
  emojis: TwemojiItem[];
}

// Cache for emoji data
let emojiDataCache: TwemojiGroup[] | null = null;

/**
 * Convert emoji character to Twemoji CDN URL
 * Example: 😀 → https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg/1f600.svg
 */
export const emojiToTwemojiUrl = (
  emoji: string,
  format: "svg" | "png" = "svg",
): string => {
  // Convert emoji to codepoints
  const codepoints: string[] = [];
  for (const codePoint of emoji) {
    const code = codePoint.codePointAt(0);
    if (code !== undefined && code !== 0xfe0f) {
      // Skip variation selector
      codepoints.push(code.toString(16));
    }
  }
  const filename = codepoints.join("-");

  if (format === "svg") {
    return `${TWEMOJI_CDN_BASE}/svg/${filename}.svg`;
  }
  return `${TWEMOJI_CDN_BASE}/72x72/${filename}.png`;
};

/**
 * Fetch all emoji data grouped by category
 */
export const fetchEmojiData = async (): Promise<TwemojiGroup[]> => {
  if (emojiDataCache) {
    return emojiDataCache;
  }

  const response = await fetch(EMOJI_DATA_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch emoji data: ${response.status}`);
  }

  const data: TwemojiGroup[] = await response.json();

  // Filter out emojis with version > 14.0 (Twemoji 14.0.2 only supports up to Emoji 14.0)
  // Newer emojis won't have images available and will show as broken
  const filteredData = data.map((group) => ({
    ...group,
    emojis: group.emojis.filter((emoji) => {
      const version = parseFloat(emoji.emoji_version);
      return !isNaN(version) && version <= 14.0;
    }),
  }));

  emojiDataCache = filteredData;
  return filteredData;
};

/**
 * Get all emojis flattened (for search)
 */
export const getAllEmojis = async (): Promise<TwemojiItem[]> => {
  const data = await fetchEmojiData();
  return data.flatMap((group) => group.emojis);
};

/**
 * Search emojis by name
 */
export const searchEmojis = async (query: string): Promise<TwemojiItem[]> => {
  const allEmojis = await getAllEmojis();
  const lowerQuery = query.toLowerCase();
  return allEmojis.filter(
    (emoji) =>
      emoji.name.toLowerCase().includes(lowerQuery) ||
      emoji.slug.includes(lowerQuery),
  );
};

// Emoji group slugs for category navigation
export const EMOJI_GROUPS = [
  { slug: "smileys_emotion", name: "Smileys & Emotion", icon: "😀" },
  { slug: "people_body", name: "People & Body", icon: "👋" },
  { slug: "animals_nature", name: "Animals & Nature", icon: "🐶" },
  { slug: "food_drink", name: "Food & Drink", icon: "🍔" },
  { slug: "travel_places", name: "Travel & Places", icon: "✈️" },
  { slug: "activities", name: "Activities", icon: "⚽" },
  { slug: "objects", name: "Objects", icon: "💡" },
  { slug: "symbols", name: "Symbols", icon: "❤️" },
  { slug: "flags", name: "Flags", icon: "🏳️" },
] as const;

export type EmojiGroupSlug = typeof EMOJI_GROUPS[number]["slug"];
