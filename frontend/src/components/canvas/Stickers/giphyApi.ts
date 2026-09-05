// GIPHY API helper functions for Stickers & GIFs sidebar

// Get GIPHY API key from runtime env (Docker) or build-time env (local dev)
const getGiphyApiKey = (): string => {
  // Check runtime environment first (Docker container)
  if (
    typeof window !== "undefined" &&
    (window as any).__ENV__?.VITE_APP_GIPHY_API_KEY
  ) {
    return (window as any).__ENV__.VITE_APP_GIPHY_API_KEY;
  }
  // Fall back to build-time environment (local development)
  return import.meta.env.VITE_APP_GIPHY_API_KEY || "";
};

const GIPHY_API_BASE = "https://api.giphy.com";

export type ContentType = "all" | "stickers" | "emojis" | "gifs";

export interface GiphyImage {
  url: string;
  width: string;
  height: string;
}

export interface GiphyItem {
  id: string;
  title: string;
  images: {
    fixed_width: GiphyImage;
    fixed_width_still: GiphyImage;
    original: GiphyImage;
    preview_gif: GiphyImage;
  };
  type: "gif" | "sticker" | "emoji";
}

export interface GiphyResponse {
  data: GiphyItem[];
  pagination: {
    total_count: number;
    count: number;
    offset: number;
  };
}

export const isApiKeyConfigured = (): boolean => {
  const apiKey = getGiphyApiKey();
  return Boolean(
    apiKey && apiKey.length > 0 && apiKey !== "__VITE_APP_GIPHY_API_KEY__",
  );
};

const buildUrl = (
  endpoint: string,
  params: Record<string, string | number>,
): string => {
  const url = new URL(endpoint, GIPHY_API_BASE);
  url.searchParams.set("api_key", getGiphyApiKey());
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });
  return url.toString();
};

export const fetchTrendingGifs = async (
  limit = 25,
  offset = 0,
): Promise<GiphyResponse> => {
  const url = buildUrl("/v1/gifs/trending", { limit, offset, rating: "g" });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GIPHY API error: ${response.status}`);
  }
  const data = await response.json();
  // Mark items as gifs
  data.data = data.data.map((item: GiphyItem) => ({ ...item, type: "gif" }));
  return data;
};

export const searchGifs = async (
  query: string,
  limit = 25,
  offset = 0,
): Promise<GiphyResponse> => {
  const url = buildUrl("/v1/gifs/search", {
    q: query,
    limit,
    offset,
    rating: "g",
  });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GIPHY API error: ${response.status}`);
  }
  const data = await response.json();
  data.data = data.data.map((item: GiphyItem) => ({ ...item, type: "gif" }));
  return data;
};

export const fetchTrendingStickers = async (
  limit = 25,
  offset = 0,
): Promise<GiphyResponse> => {
  const url = buildUrl("/v1/stickers/trending", { limit, offset, rating: "g" });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GIPHY API error: ${response.status}`);
  }
  const data = await response.json();
  data.data = data.data.map((item: GiphyItem) => ({
    ...item,
    type: "sticker",
  }));
  return data;
};

export const searchStickers = async (
  query: string,
  limit = 25,
  offset = 0,
): Promise<GiphyResponse> => {
  const url = buildUrl("/v1/stickers/search", {
    q: query,
    limit,
    offset,
    rating: "g",
  });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GIPHY API error: ${response.status}`);
  }
  const data = await response.json();
  data.data = data.data.map((item: GiphyItem) => ({
    ...item,
    type: "sticker",
  }));
  return data;
};

export const fetchEmojis = async (
  limit = 25,
  offset = 0,
): Promise<GiphyResponse> => {
  const url = buildUrl("/v2/emoji", { limit, offset });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GIPHY API error: ${response.status}`);
  }
  const data = await response.json();
  data.data = data.data.map((item: GiphyItem) => ({ ...item, type: "emoji" }));
  return data;
};

export const searchEmojis = async (
  // GIPHY has no emoji search endpoint, so the query is accepted and ignored to
  // keep this interchangeable with the other search functions.
  _query: string,
  limit = 25,
  offset = 0,
): Promise<GiphyResponse> => {
  // Emojis don't have a search endpoint, so we use stickers search with emoji-related terms
  // and filter the results, or just return emojis endpoint results
  // For now, we'll use the emoji endpoint which returns all emojis
  return fetchEmojis(limit, offset);
};

// Fetch trending content based on type
export const fetchTrending = async (
  type: ContentType,
  limit = 25,
  offset = 0,
): Promise<GiphyResponse> => {
  switch (type) {
    case "gifs":
      return fetchTrendingGifs(limit, offset);
    case "stickers":
      return fetchTrendingStickers(limit, offset);
    case "emojis":
      return fetchEmojis(limit, offset);
    case "all":
    default: {
      // Fetch from all sources and combine
      const itemsPerSource = Math.ceil(limit / 3);
      const [gifs, stickers, emojis] = await Promise.all([
        fetchTrendingGifs(itemsPerSource, Math.floor(offset / 3)),
        fetchTrendingStickers(itemsPerSource, Math.floor(offset / 3)),
        fetchEmojis(itemsPerSource, Math.floor(offset / 3)),
      ]);

      // Interleave results for variety
      const combined: GiphyItem[] = [];
      const maxLen = Math.max(
        gifs.data.length,
        stickers.data.length,
        emojis.data.length,
      );
      for (let i = 0; i < maxLen; i++) {
        if (gifs.data[i]) {
          combined.push(gifs.data[i]);
        }
        if (stickers.data[i]) {
          combined.push(stickers.data[i]);
        }
        if (emojis.data[i]) {
          combined.push(emojis.data[i]);
        }
      }

      return {
        data: combined.slice(0, limit),
        pagination: {
          total_count:
            gifs.pagination.total_count +
            stickers.pagination.total_count +
            emojis.pagination.total_count,
          count: combined.length,
          offset,
        },
      };
    }
  }
};

// Search content based on type
export const searchContent = async (
  type: ContentType,
  query: string,
  limit = 25,
  offset = 0,
): Promise<GiphyResponse> => {
  if (!query.trim()) {
    return fetchTrending(type, limit, offset);
  }

  switch (type) {
    case "gifs":
      return searchGifs(query, limit, offset);
    case "stickers":
      return searchStickers(query, limit, offset);
    case "emojis":
      return searchEmojis(query, limit, offset);
    case "all":
    default: {
      // Search from gifs and stickers (emojis don't have search)
      const itemsPerSource = Math.ceil(limit / 2);
      const [gifs, stickers] = await Promise.all([
        searchGifs(query, itemsPerSource, Math.floor(offset / 2)),
        searchStickers(query, itemsPerSource, Math.floor(offset / 2)),
      ]);

      // Interleave results
      const combined: GiphyItem[] = [];
      const maxLen = Math.max(gifs.data.length, stickers.data.length);
      for (let i = 0; i < maxLen; i++) {
        if (gifs.data[i]) {
          combined.push(gifs.data[i]);
        }
        if (stickers.data[i]) {
          combined.push(stickers.data[i]);
        }
      }

      return {
        data: combined.slice(0, limit),
        pagination: {
          total_count:
            gifs.pagination.total_count + stickers.pagination.total_count,
          count: combined.length,
          offset,
        },
      };
    }
  }
};

// Convert image URL to data URL for canvas insertion
export const imageUrlToDataUrl = async (url: string): Promise<string> => {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
