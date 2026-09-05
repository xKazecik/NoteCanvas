import clsx from "clsx";
import { useCallback, useEffect, useState, useRef } from "react";

import { randomId, viewportCoordsToSceneCoords } from "@excalidraw/common";
import { newEmbeddableElement, newImageElement } from "@excalidraw/element";

import { t, type TranslationKeys } from "@excalidraw/excalidraw";
import { searchIcon } from "@excalidraw/excalidraw";
import { TextField } from "@excalidraw/excalidraw";

import type { FileId } from "@excalidraw/element/types";

import type {
  ExcalidrawImperativeAPI,
  DataURL,
} from "@excalidraw/excalidraw/types";

import {
  fetchTrending,
  searchContent,
  isApiKeyConfigured,
  type ContentType,
  type GiphyItem,
} from "../giphyApi";

import {
  fetchEmojiData,
  searchEmojis as searchTwemoji,
  emojiToTwemojiUrl,
  EMOJI_GROUPS,
  type TwemojiItem,
  type TwemojiGroup,
  type EmojiGroupSlug,
} from "../twemojiApi";

import styles from "./StickersPanel.module.scss";

// Extended content type to include static emojis
type ExtendedContentType = ContentType | "static";

// Store dragging item data for drop handling
interface DragData {
  item: GiphyItem;
  width: number;
  height: number;
}

// Drag data for static emoji
interface StaticEmojiDragData {
  type: "static-emoji";
  emoji: TwemojiItem;
  url: string;
}

interface StickersPanelProps {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}

const CONTENT_TABS: ReadonlyArray<{
  id: "all" | "stickers" | "gifs" | "static";
  labelKey: TranslationKeys;
}> = [
  { id: "all", labelKey: "stickers.all" },
  { id: "stickers", labelKey: "stickers.stickersTab" },
  // GIPHY emojis commented out - using Twemoji instead (better quality, more complete)
  // { id: "emojis", labelKey: "stickers.emojis" },
  { id: "gifs", labelKey: "stickers.gifs" },
  { id: "static", labelKey: "stickers.emojis" }, // Renamed to "Emojis" for better UX
];

const GiphyLogo = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 164 35"
    height="16"
    style={{ display: "inline-block", verticalAlign: "middle" }}
  >
    <g fill="currentColor">
      <path d="M0 3h4v29H0zM8 3h4v29H8z" />
      <path d="M0 3h11v4H0zM0 14h11v4H0zM0 28h11v4H0zM22 0h4v35h-4zM35 3h4v29h-4zM43 3h4v29h-4z" />
      <path d="M35 3h12v4H35zM35 14h12v4H35zM35 28h12v4H35z" />
      <path d="M22 14h9v4h-9zM57 3h4v29h-4z" />
      <path d="M57 3h11v4H57zM64 3h4v29h-4zM78 3h4v29h-4z" />
      <path d="M78 3h11v4H78zM78 28h11v4H78z" />
      <path d="M85 17h4v15h-4zM99 7h4v25h-4z" />
      <path d="M99 7h8v4h-8zM99 17h8v4h-8z" />
      <path d="M104 10h4v11h-4zM117 3h4v29h-4z" />
      <path d="M117 28h11v4h-11z" />
      <path d="M124 17h4v15h-4zM117 3h11v4h-11z" />
      <path d="M124 3h4v11h-4zM138 7h4v25h-4zM152 7h4v25h-4z" />
      <path d="M138 3h18v4h-18zM142 17h10v4h-10z" />
    </g>
  </svg>
);

// Default size for static emoji images
const STATIC_EMOJI_SIZE = 72;

export const StickersPanel: React.FC<StickersPanelProps> = ({
  excalidrawAPI,
}) => {
  const [activeTab, setActiveTab] = useState<ExtendedContentType>("gifs");
  const [searchQuery, setSearchQuery] = useState("");
  const [items, setItems] = useState<GiphyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insertingId, setInsertingId] = useState<string | null>(null);

  // Twemoji state - groups stored for potential future UI (group tabs)
  const [_twemojiGroups, setTwemojiGroups] = useState<TwemojiGroup[]>([]);
  void _twemojiGroups; // Reserved for future use
  const [twemojiItems, setTwemojiItems] = useState<TwemojiItem[]>([]);
  const [selectedEmojiGroup, setSelectedEmojiGroup] =
    useState<EmojiGroupSlug>("smileys_emotion");

  const searchInputRef = useRef<HTMLInputElement>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check if API key is configured (only needed for GIPHY tabs)
  const apiKeyMissing = !isApiKeyConfigured();
  const isStaticTab = activeTab === "static";

  // Load GIPHY content when tab changes or search query changes
  const loadGiphyContent = useCallback(
    async (query: string, type: ContentType) => {
      if (apiKeyMissing) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = query.trim()
          ? await searchContent(type, query)
          : await fetchTrending(type);
        setItems(response.data);
      } catch (err) {
        console.error("Failed to load GIPHY content:", err);
        setError(t("stickers.error"));
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [apiKeyMissing],
  );

  // Load Twemoji data
  const loadTwemojiContent = useCallback(
    async (query: string, groupSlug: EmojiGroupSlug) => {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchEmojiData();
        setTwemojiGroups(data);

        if (query.trim()) {
          // Search across all emojis
          const results = await searchTwemoji(query);
          setTwemojiItems(results.slice(0, 100)); // Limit results
        } else {
          // Show emojis from selected group
          const group = data.find((g) => g.slug === groupSlug);
          setTwemojiItems(group?.emojis || []);
        }
      } catch (err) {
        console.error("Failed to load Twemoji content:", err);
        setError(t("stickers.error"));
        setTwemojiItems([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Initial load and tab change
  useEffect(() => {
    if (isStaticTab) {
      loadTwemojiContent(searchQuery, selectedEmojiGroup);
    } else {
      loadGiphyContent(searchQuery, activeTab as ContentType);
    }
  }, [
    activeTab,
    loadGiphyContent,
    loadTwemojiContent,
    searchQuery,
    selectedEmojiGroup,
    isStaticTab,
  ]);

  // Debounced search
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);

      // Clear previous timeout
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      // Debounce search
      searchTimeoutRef.current = setTimeout(() => {
        if (isStaticTab) {
          loadTwemojiContent(value, selectedEmojiGroup);
        } else {
          loadGiphyContent(value, activeTab as ContentType);
        }
      }, 300);
    },
    [
      activeTab,
      loadGiphyContent,
      loadTwemojiContent,
      selectedEmojiGroup,
      isStaticTab,
    ],
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Insert item to canvas at specified scene coordinates or viewport center
  // GIFs and stickers are inserted as embeddable elements (animated iframes)
  // Emojis are inserted as static images
  const insertItemToCanvas = useCallback(
    async (item: GiphyItem, sceneX?: number, sceneY?: number) => {
      if (!excalidrawAPI || insertingId) {
        return;
      }

      setInsertingId(item.id);

      try {
        // Get dimensions from fixed_width for consistent sizing
        const width = parseInt(item.images.fixed_width.width, 10);
        const height = parseInt(item.images.fixed_width.height, 10);

        // Get current app state for positioning
        const appState = excalidrawAPI.getAppState();
        const elements = excalidrawAPI.getSceneElements();

        let x: number;
        let y: number;

        if (sceneX !== undefined && sceneY !== undefined) {
          // Position at drop location, centered on cursor
          x = sceneX - width / 2;
          y = sceneY - height / 2;
        } else {
          // Calculate center of visible viewport in scene coordinates
          // Viewport spans from -scrollX to -scrollX + width/zoom in scene coords
          x =
            -appState.scrollX +
            appState.width / (2 * appState.zoom.value) -
            width / 2;
          y =
            -appState.scrollY +
            appState.height / (2 * appState.zoom.value) -
            height / 2;
        }

        // All GIPHY content (GIFs, stickers, emojis) is animated
        // Create embeddable element with GIPHY embed URL
        const embedUrl = `https://giphy.com/embed/${item.id}`;

        const embeddableElement = newEmbeddableElement({
          type: "embeddable",
          x,
          y,
          width,
          height,
          link: embedUrl,
          // Use transparent stroke so content doesn't have a border
          strokeColor: "transparent",
        });

        // Update scene with new embeddable element
        excalidrawAPI.updateScene({
          elements: [...elements, embeddableElement],
        });
      } catch (err) {
        console.error("Failed to insert item:", err);
        excalidrawAPI.setToast({
          message: t("stickers.error"),
          duration: 3000,
          closable: true,
        });
      } finally {
        setInsertingId(null);
      }
    },
    [excalidrawAPI, insertingId],
  );

  // Insert static emoji (Twemoji) as SVG image
  const insertStaticEmoji = useCallback(
    async (emoji: TwemojiItem, sceneX?: number, sceneY?: number) => {
      if (!excalidrawAPI || insertingId) {
        return;
      }

      setInsertingId(emoji.slug);

      try {
        const svgUrl = emojiToTwemojiUrl(emoji.emoji, "svg");
        const size = STATIC_EMOJI_SIZE;

        // Fetch SVG and convert to data URL
        const response = await fetch(svgUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch emoji: ${response.status}`);
        }
        const svgText = await response.text();
        const dataUrl = `data:image/svg+xml;base64,${btoa(svgText)}`;

        const fileId = randomId() as FileId;

        // Add file to excalidraw
        excalidrawAPI.addFiles([
          {
            id: fileId,
            dataURL: dataUrl as DataURL,
            mimeType: "image/svg+xml",
            created: Date.now(),
          },
        ]);

        // Get current app state for positioning
        const appState = excalidrawAPI.getAppState();
        const elements = excalidrawAPI.getSceneElements();

        let x: number;
        let y: number;

        if (sceneX !== undefined && sceneY !== undefined) {
          x = sceneX - size / 2;
          y = sceneY - size / 2;
        } else {
          x =
            -appState.scrollX +
            appState.width / (2 * appState.zoom.value) -
            size / 2;
          y =
            -appState.scrollY +
            appState.height / (2 * appState.zoom.value) -
            size / 2;
        }

        // Create image element
        const imageElement = newImageElement({
          type: "image",
          x,
          y,
          width: size,
          height: size,
          fileId,
          status: "saved",
        });

        excalidrawAPI.updateScene({
          elements: [...elements, imageElement],
        });
      } catch (err) {
        console.error("Failed to insert emoji:", err);
        excalidrawAPI.setToast({
          message: t("stickers.error"),
          duration: 3000,
          closable: true,
        });
      } finally {
        setInsertingId(null);
      }
    },
    [excalidrawAPI, insertingId],
  );

  // Handle click to insert at viewport center
  const handleItemClick = useCallback(
    (item: GiphyItem) => {
      insertItemToCanvas(item);
    },
    [insertItemToCanvas],
  );

  // Handle click on static emoji
  const handleStaticEmojiClick = useCallback(
    (emoji: TwemojiItem) => {
      insertStaticEmoji(emoji);
    },
    [insertStaticEmoji],
  );

  // Handle drag start - prepare data for drop (GIPHY)
  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLButtonElement>, item: GiphyItem) => {
      const width = parseInt(item.images.fixed_width.width, 10);
      const height = parseInt(item.images.fixed_width.height, 10);

      // Store drag data as JSON
      const dragData: DragData = { item, width, height };
      e.dataTransfer.setData(
        "application/x-excalidraw-sticker",
        JSON.stringify(dragData),
      );
      e.dataTransfer.effectAllowed = "copy";

      // Use the preview image as drag image
      const img = e.currentTarget.querySelector("img");
      if (img) {
        e.dataTransfer.setDragImage(img, width / 2, height / 2);
      }
    },
    [],
  );

  // Handle drag start for static emoji
  const handleStaticEmojiDragStart = useCallback(
    (e: React.DragEvent<HTMLButtonElement>, emoji: TwemojiItem) => {
      const url = emojiToTwemojiUrl(emoji.emoji, "svg");
      const dragData: StaticEmojiDragData = {
        type: "static-emoji",
        emoji,
        url,
      };
      e.dataTransfer.setData(
        "application/x-excalidraw-static-emoji",
        JSON.stringify(dragData),
      );
      e.dataTransfer.effectAllowed = "copy";

      const img = e.currentTarget.querySelector("img");
      if (img) {
        e.dataTransfer.setDragImage(
          img,
          STATIC_EMOJI_SIZE / 2,
          STATIC_EMOJI_SIZE / 2,
        );
      }
    },
    [],
  );

  // Set up global drop handler when panel mounts
  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }

    const handleDrop = async (e: DragEvent) => {
      // Handle GIPHY content
      const giphyData = e.dataTransfer?.getData(
        "application/x-excalidraw-sticker",
      );
      if (giphyData) {
        e.preventDefault();
        e.stopPropagation();

        try {
          const dragData: DragData = JSON.parse(giphyData);
          const appState = excalidrawAPI.getAppState();

          const { x: sceneX, y: sceneY } = viewportCoordsToSceneCoords(
            { clientX: e.clientX, clientY: e.clientY },
            {
              zoom: appState.zoom,
              offsetLeft: appState.offsetLeft,
              offsetTop: appState.offsetTop,
              scrollX: appState.scrollX,
              scrollY: appState.scrollY,
            },
          );

          await insertItemToCanvas(dragData.item, sceneX, sceneY);
        } catch (err) {
          console.error("Failed to handle GIPHY drop:", err);
        }
        return;
      }

      // Handle static emoji
      const emojiData = e.dataTransfer?.getData(
        "application/x-excalidraw-static-emoji",
      );
      if (emojiData) {
        e.preventDefault();
        e.stopPropagation();

        try {
          const dragData: StaticEmojiDragData = JSON.parse(emojiData);
          const appState = excalidrawAPI.getAppState();

          const { x: sceneX, y: sceneY } = viewportCoordsToSceneCoords(
            { clientX: e.clientX, clientY: e.clientY },
            {
              zoom: appState.zoom,
              offsetLeft: appState.offsetLeft,
              offsetTop: appState.offsetTop,
              scrollX: appState.scrollX,
              scrollY: appState.scrollY,
            },
          );

          await insertStaticEmoji(dragData.emoji, sceneX, sceneY);
        } catch (err) {
          console.error("Failed to handle emoji drop:", err);
        }
      }
    };

    const handleDragOver = (e: DragEvent) => {
      if (
        e.dataTransfer?.types.includes("application/x-excalidraw-sticker") ||
        e.dataTransfer?.types.includes("application/x-excalidraw-static-emoji")
      ) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }
    };

    document.addEventListener("drop", handleDrop);
    document.addEventListener("dragover", handleDragOver);

    return () => {
      document.removeEventListener("drop", handleDrop);
      document.removeEventListener("dragover", handleDragOver);
    };
  }, [excalidrawAPI, insertItemToCanvas, insertStaticEmoji]);

  // Render static emoji content
  const renderStaticEmojiContent = () => (
    <>
      {/* Category tabs for static emojis */}
      {!searchQuery.trim() && (
        <div className={styles.emojiCategories}>
          {EMOJI_GROUPS.map((group) => (
            <button
              key={group.slug}
              className={clsx(styles.emojiCategory, {
                [styles.emojiCategoryActive]: selectedEmojiGroup === group.slug,
              })}
              onClick={() => setSelectedEmojiGroup(group.slug)}
              title={group.name}
            >
              {group.icon}
            </button>
          ))}
        </div>
      )}

      {/* Section header */}
      <div className={styles.sectionHeader}>
        {searchQuery.trim()
          ? searchQuery
          : EMOJI_GROUPS.find((g) => g.slug === selectedEmojiGroup)?.name ||
            t("stickers.popular")}
      </div>

      {/* Static emoji grid */}
      <div
        className={styles.gridContainer}
        ref={gridContainerRef}
        onWheel={(e) => e.stopPropagation()}
      >
        {loading && twemojiItems.length === 0 ? (
          <div className={styles.loading}>
            <div className={styles.spinner} />
            <span>{t("stickers.loading")}</span>
          </div>
        ) : error ? (
          <div className={styles.error}>
            <p>{error}</p>
          </div>
        ) : twemojiItems.length === 0 ? (
          <div className={styles.empty}>
            <p>{t("stickers.noResults")}</p>
          </div>
        ) : (
          <div className={clsx(styles.grid, styles.gridStatic)}>
            {twemojiItems.map((emoji) => (
              <button
                key={emoji.slug}
                className={clsx(styles.item, styles.itemStatic, {
                  [styles.itemInserting]: insertingId === emoji.slug,
                })}
                onClick={() => handleStaticEmojiClick(emoji)}
                onDragStart={(e) => handleStaticEmojiDragStart(e, emoji)}
                draggable
                title={`${emoji.emoji} ${emoji.name} - ${t(
                  "stickers.dragToInsert",
                )}`}
                disabled={insertingId !== null}
              >
                <img
                  src={emojiToTwemojiUrl(emoji.emoji, "svg")}
                  alt={emoji.name}
                  loading="lazy"
                  draggable={false}
                />
                {insertingId === emoji.slug && (
                  <div className={styles.itemLoading}>
                    <div
                      className={clsx(styles.spinner, styles.spinnerSmall)}
                    />
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer with Twemoji attribution */}
      <div className={styles.footer}>
        <span className={clsx(styles.poweredBy, styles.poweredBySmall)}>
          {t("stickers.poweredByTwemoji")}
        </span>
      </div>
    </>
  );

  // Render GIPHY content
  const renderGiphyContent = () => (
    <>
      {/* Trending/Search results label */}
      <div className={styles.sectionHeader}>
        {searchQuery.trim() ? searchQuery : t("stickers.trending")}
      </div>

      {/* Content grid */}
      <div
        className={styles.gridContainer}
        ref={gridContainerRef}
        onWheel={(e) => e.stopPropagation()}
      >
        {apiKeyMissing ? (
          <div className={styles.error}>
            <div className={styles.errorIcon}>⚠️</div>
            <p>{t("stickers.apiKeyMissing")}</p>
          </div>
        ) : loading && items.length === 0 ? (
          <div className={styles.loading}>
            <div className={styles.spinner} />
            <span>{t("stickers.loading")}</span>
          </div>
        ) : error ? (
          <div className={styles.error}>
            <p>{error}</p>
          </div>
        ) : items.length === 0 ? (
          <div className={styles.empty}>
            <p>{t("stickers.noResults")}</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {items.map((item) => (
              <button
                key={item.id}
                className={clsx(styles.item, {
                  [styles.itemInserting]: insertingId === item.id,
                })}
                onClick={() => handleItemClick(item)}
                onDragStart={(e) => handleDragStart(e, item)}
                draggable
                title={
                  item.title
                    ? `${item.title} - ${t("stickers.dragToInsert")}`
                    : t("stickers.dragToInsert")
                }
                disabled={insertingId !== null}
              >
                <img
                  src={
                    item.images.fixed_width_still?.url ||
                    item.images.fixed_width.url
                  }
                  alt={item.title}
                  loading="lazy"
                  draggable={false}
                  onMouseEnter={(e) => {
                    // Show animated version on hover
                    (e.target as HTMLImageElement).src =
                      item.images.fixed_width.url;
                  }}
                  onMouseLeave={(e) => {
                    // Show still version when not hovering
                    if (item.images.fixed_width_still?.url) {
                      (e.target as HTMLImageElement).src =
                        item.images.fixed_width_still.url;
                    }
                  }}
                />
                {insertingId === item.id && (
                  <div className={styles.itemLoading}>
                    <div
                      className={clsx(styles.spinner, styles.spinnerSmall)}
                    />
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer with GIPHY attribution */}
      <div className={styles.footer}>
        <span className={styles.poweredBy}>
          {t("stickers.poweredBy")} <GiphyLogo />
        </span>
      </div>
    </>
  );

  return (
    <div className={styles.panel} onWheel={(e) => e.stopPropagation()}>
      {/* Search input using TextField component */}
      <div className={styles.searchWrapper}>
        <TextField
          ref={searchInputRef}
          value={searchQuery}
          placeholder={t("stickers.search")}
          icon={searchIcon}
          onChange={handleSearchChange}
          onKeyDown={(e) => e.stopPropagation()}
          fullWidth
          type="search"
        />
      </div>

      {/* Content type tabs */}
      <div className={styles.tabs}>
        {CONTENT_TABS.map((tab) => (
          <button
            key={tab.id}
            className={clsx(styles.tab, {
              [styles.tabActive]: activeTab === tab.id,
            })}
            onClick={() => setActiveTab(tab.id)}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* Render content based on active tab */}
      {isStaticTab ? renderStaticEmojiContent() : renderGiphyContent()}
    </div>
  );
};
