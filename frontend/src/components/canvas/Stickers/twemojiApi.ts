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
 * Get emojis from a specific group
 */
export const getEmojisByGroup = async (
  groupSlug: string,
): Promise<TwemojiItem[]> => {
  const data = await fetchEmojiData();
  const group = data.find((g) => g.slug === groupSlug);
  return group?.emojis || [];
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

/**
 * Get popular/commonly used emojis
 */
export const getPopularEmojis = (): TwemojiItem[] => {
  // Hand-picked popular emojis
  return [
    {
      emoji: "😀",
      name: "grinning face",
      slug: "grinning_face",
      skin_tone_support: false,
      unicode_version: "1.0",
      emoji_version: "1.0",
    },
    {
      emoji: "😂",
      name: "face with tears of joy",
      slug: "face_with_tears_of_joy",
      skin_tone_support: false,
      unicode_version: "0.6",
      emoji_version: "0.6",
    },
    {
      emoji: "❤️",
      name: "red heart",
      slug: "red_heart",
      skin_tone_support: false,
      unicode_version: "0.6",
      emoji_version: "0.6",
    },
    {
      emoji: "🔥",
      name: "fire",
      slug: "fire",
      skin_tone_support: false,
      unicode_version: "0.6",
      emoji_version: "0.6",
    },
    {
      emoji: "👍",
      name: "thumbs up",
      slug: "thumbs_up",
      skin_tone_support: true,
      unicode_version: "0.6",
      emoji_version: "0.6",
    },
    {
      emoji: "✨",
      name: "sparkles",
      slug: "sparkles",
      skin_tone_support: false,
      unicode_version: "0.6",
      emoji_version: "0.6",
    },
    {
      emoji: "🎉",
      name: "party popper",
      slug: "party_popper",
      skin_tone_support: false,
      unicode_version: "0.6",
      emoji_version: "0.6",
    },
    {
      emoji: "💯",
      name: "hundred points",
      slug: "hundred_points",
      skin_tone_support: false,
      unicode_version: "0.6",
      emoji_version: "0.6",
    },
    {
      emoji: "🙏",
      name: "folded hands",
      slug: "folded_hands",
      skin_tone_support: true,
      unicode_version: "0.6",
      emoji_version: "0.6",
    },
    {
      emoji: "😍",
      name: "smiling face with heart-eyes",
      slug: "smiling_face_with_heart_eyes",
      skin_tone_support: false,
      unicode_version: "0.6",
      emoji_version: "0.6",
    },
    {
      emoji: "🥳",
      name: "partying face",
      slug: "partying_face",
      skin_tone_support: false,
      unicode_version: "11.0",
      emoji_version: "11.0",
    },
    {
      emoji: "😎",
      name: "smiling face with sunglasses",
      slug: "smiling_face_with_sunglasses",
      skin_tone_support: false,
      unicode_version: "1.0",
      emoji_version: "1.0",
    },
    {
      emoji: "🤔",
      name: "thinking face",
      slug: "thinking_face",
      skin_tone_support: false,
      unicode_version: "1.0",
      emoji_version: "1.0",
    },
    {
      emoji: "👀",
      name: "eyes",
      slug: "eyes",
      skin_tone_support: false,
      unicode_version: "0.6",
      emoji_version: "0.6",
    },
    {
      emoji: "💪",
      name: "flexed biceps",
      slug: "flexed_biceps",
      skin_tone_support: true,
      unicode_version: "0.6",
      emoji_version: "0.6",
    },
    {
      emoji: "🚀",
      name: "rocket",
      slug: "rocket",
      skin_tone_support: false,
      unicode_version: "0.6",
      emoji_version: "0.6",
    },
    {
      emoji: "⭐",
      name: "star",
      slug: "star",
      skin_tone_support: false,
      unicode_version: "0.6",
      emoji_version: "0.6",
    },
    {
      emoji: "💡",
      name: "light bulb",
      slug: "light_bulb",
      skin_tone_support: false,
      unicode_version: "0.6",
      emoji_version: "0.6",
    },
    {
      emoji: "✅",
      name: "check mark button",
      slug: "check_mark_button",
      skin_tone_support: false,
      unicode_version: "0.6",
      emoji_version: "0.6",
    },
    {
      emoji: "❌",
      name: "cross mark",
      slug: "cross_mark",
      skin_tone_support: false,
      unicode_version: "0.6",
      emoji_version: "0.6",
    },
    {
      emoji: "⚠️",
      name: "warning",
      slug: "warning",
      skin_tone_support: false,
      unicode_version: "0.6",
      emoji_version: "0.6",
    },
    {
      emoji: "📌",
      name: "pushpin",
      slug: "pushpin",
      skin_tone_support: false,
      unicode_version: "0.6",
      emoji_version: "0.6",
    },
    {
      emoji: "💬",
      name: "speech balloon",
      slug: "speech_balloon",
      skin_tone_support: false,
      unicode_version: "0.6",
      emoji_version: "0.6",
    },
    {
      emoji: "📝",
      name: "memo",
      slug: "memo",
      skin_tone_support: false,
      unicode_version: "0.6",
      emoji_version: "0.6",
    },
  ];
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
