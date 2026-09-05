import {
  COLOR_CHARCOAL_BLACK,
  COLOR_VOICE_CALL,
  COLOR_WHITE,
  THEME,
  UserIdleState,
} from "@excalidraw/common";

import { roundRect } from "./renderer/roundRect";

import type { InteractiveCanvasRenderConfig } from "./scene/types";
import type {
  Collaborator,
  CommentMarker,
  InteractiveCanvasAppState,
  SocketId,
} from "./types";

function hashToInteger(id: string) {
  let hash = 0;
  if (id.length === 0) {
    return hash;
  }
  for (let i = 0; i < id.length; i++) {
    const char = id.charCodeAt(i);
    hash = (hash << 5) - hash + char;
  }
  return hash;
}

export const getClientColor = (
  socketId: SocketId,
  collaborator: Collaborator | undefined,
) => {
  // to get more even distribution in case `id` is not uniformly distributed to
  // begin with, we hash it
  const hash = Math.abs(hashToInteger(collaborator?.id || socketId));
  // we want to get a multiple of 10 number in the range of 0-360 (in other
  // words a hue value of step size 10). There are 37 such values including 0.
  const hue = (hash % 37) * 10;
  const saturation = 100;
  const lightness = 83;

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

/**
 * returns first char, capitalized
 */
export const getNameInitial = (name?: string | null) => {
  // first char can be a surrogate pair, hence using codePointAt
  const firstCodePoint = name?.trim()?.codePointAt(0);
  return (
    firstCodePoint ? String.fromCodePoint(firstCodePoint) : "?"
  ).toUpperCase();
};

export const renderRemoteCursors = ({
  context,
  renderConfig,
  appState,
  normalizedWidth,
  normalizedHeight,
}: {
  context: CanvasRenderingContext2D;
  renderConfig: InteractiveCanvasRenderConfig;
  appState: InteractiveCanvasAppState;
  normalizedWidth: number;
  normalizedHeight: number;
}) => {
  // Paint remote pointers
  for (const [socketId, pointer] of renderConfig.remotePointerViewportCoords) {
    let { x, y } = pointer;

    const collaborator = appState.collaborators.get(socketId);

    x -= appState.offsetLeft;
    y -= appState.offsetTop;

    const width = 11;
    const height = 14;

    const isOutOfBounds =
      x < 0 ||
      x > normalizedWidth - width ||
      y < 0 ||
      y > normalizedHeight - height;

    x = Math.max(x, 0);
    x = Math.min(x, normalizedWidth - width);
    y = Math.max(y, 0);
    y = Math.min(y, normalizedHeight - height);

    const background = getClientColor(socketId, collaborator);

    context.save();
    context.strokeStyle = background;
    context.fillStyle = background;

    const userState = renderConfig.remotePointerUserStates.get(socketId);
    const isInactive =
      isOutOfBounds ||
      userState === UserIdleState.IDLE ||
      userState === UserIdleState.AWAY;

    if (isInactive) {
      context.globalAlpha = 0.3;
    }

    if (renderConfig.remotePointerButton.get(socketId) === "down") {
      context.beginPath();
      context.arc(x, y, 15, 0, 2 * Math.PI, false);
      context.lineWidth = 3;
      context.strokeStyle = "#ffffff88";
      context.stroke();
      context.closePath();

      context.beginPath();
      context.arc(x, y, 15, 0, 2 * Math.PI, false);
      context.lineWidth = 1;
      context.strokeStyle = background;
      context.stroke();
      context.closePath();
    }

    // TODO remove the dark theme color after we stop inverting canvas colors
    const IS_SPEAKING_COLOR =
      appState.theme === THEME.DARK ? "#2f6330" : COLOR_VOICE_CALL;

    const isSpeaking = collaborator?.isSpeaking;

    if (isSpeaking) {
      // cursor outline for currently speaking user
      context.fillStyle = IS_SPEAKING_COLOR;
      context.strokeStyle = IS_SPEAKING_COLOR;
      context.lineWidth = 10;
      context.lineJoin = "round";
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + 0, y + 14);
      context.lineTo(x + 4, y + 9);
      context.lineTo(x + 11, y + 8);
      context.closePath();
      context.stroke();
      context.fill();
    }

    // Background (white outline) for arrow
    context.fillStyle = COLOR_WHITE;
    context.strokeStyle = COLOR_WHITE;
    context.lineWidth = 6;
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + 0, y + 14);
    context.lineTo(x + 4, y + 9);
    context.lineTo(x + 11, y + 8);
    context.closePath();
    context.stroke();
    context.fill();

    // Arrow
    context.fillStyle = background;
    context.strokeStyle = background;
    context.lineWidth = 2;
    context.lineJoin = "round";
    context.beginPath();
    if (isInactive) {
      context.moveTo(x - 1, y - 1);
      context.lineTo(x - 1, y + 15);
      context.lineTo(x + 5, y + 10);
      context.lineTo(x + 12, y + 9);
      context.closePath();
      context.fill();
    } else {
      context.moveTo(x, y);
      context.lineTo(x + 0, y + 14);
      context.lineTo(x + 4, y + 9);
      context.lineTo(x + 11, y + 8);
      context.closePath();
      context.fill();
      context.stroke();
    }

    const username = renderConfig.remotePointerUsernames.get(socketId) || "";

    if (!isOutOfBounds && username) {
      context.font = "600 12px sans-serif"; // font has to be set before context.measureText()

      const offsetX = (isSpeaking ? x + 0 : x) + width / 2;
      const offsetY = (isSpeaking ? y + 0 : y) + height + 2;
      const paddingHorizontal = 5;
      const paddingVertical = 3;
      const measure = context.measureText(username);
      const measureHeight =
        measure.actualBoundingBoxDescent + measure.actualBoundingBoxAscent;
      const finalHeight = Math.max(measureHeight, 12);

      const boxX = offsetX - 1;
      const boxY = offsetY - 1;
      const boxWidth = measure.width + 2 + paddingHorizontal * 2 + 2;
      const boxHeight = finalHeight + 2 + paddingVertical * 2 + 2;
      if (context.roundRect) {
        context.beginPath();
        context.roundRect(boxX, boxY, boxWidth, boxHeight, 8);
        context.fillStyle = background;
        context.fill();
        context.strokeStyle = COLOR_WHITE;
        context.stroke();

        if (isSpeaking) {
          context.beginPath();
          context.roundRect(boxX - 2, boxY - 2, boxWidth + 4, boxHeight + 4, 8);
          context.strokeStyle = IS_SPEAKING_COLOR;
          context.stroke();
        }
      } else {
        roundRect(context, boxX, boxY, boxWidth, boxHeight, 8, COLOR_WHITE);
      }
      context.fillStyle = COLOR_CHARCOAL_BLACK;

      context.fillText(
        username,
        offsetX + paddingHorizontal + 1,
        offsetY +
          paddingVertical +
          measure.actualBoundingBoxAscent +
          Math.floor((finalHeight - measureHeight) / 2) +
          2,
      );

      // draw three vertical bars signalling someone is speaking
      if (isSpeaking) {
        context.fillStyle = IS_SPEAKING_COLOR;
        const barheight = 8;
        const margin = 8;
        const gap = 5;
        context.fillRect(
          boxX + boxWidth + margin,
          boxY + (boxHeight / 2 - barheight / 2),
          2,
          barheight,
        );
        context.fillRect(
          boxX + boxWidth + margin + gap,
          boxY + (boxHeight / 2 - (barheight * 2) / 2),
          2,
          barheight * 2,
        );
        context.fillRect(
          boxX + boxWidth + margin + gap * 2,
          boxY + (boxHeight / 2 - barheight / 2),
          2,
          barheight,
        );
      }
    }

    context.restore();
    context.closePath();
  }
};

// Cache for loaded avatar images
const avatarImageCache = new Map<
  string,
  HTMLImageElement | "loading" | "error"
>();

/**
 * Loads an avatar image and caches it.
 * Returns the image if already loaded, null if loading/error.
 */
function getAvatarImage(url: string): HTMLImageElement | null {
  const cached = avatarImageCache.get(url);

  if (cached === "loading" || cached === "error") {
    return null;
  }

  if (cached instanceof HTMLImageElement) {
    return cached;
  }

  // Start loading
  avatarImageCache.set(url, "loading");
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    avatarImageCache.set(url, img);
  };
  img.onerror = () => {
    avatarImageCache.set(url, "error");
  };
  img.src = url;

  return null;
}

/**
 * Renders comment markers on the interactive canvas.
 * Draws a teardrop/pin shape with avatar stack inside.
 * Follows the same pattern as renderRemoteCursors for consistency.
 */
export const renderCommentMarkers = ({
  context,
  appState,
  markers,
  normalizedWidth,
  normalizedHeight,
}: {
  context: CanvasRenderingContext2D;
  appState: InteractiveCanvasAppState;
  markers: CommentMarker[];
  normalizedWidth: number;
  normalizedHeight: number;
}) => {
  // Dimensions matching the CSS implementation
  const AVATAR_SIZE = 24;
  const AVATAR_OVERLAP = 12; // margin-left: -12px in CSS
  const PADDING = 2; // p-0.5 = 2px
  const MAX_AVATARS = 3; // Limit visible avatars

  for (const marker of markers) {
    // Skip resolved markers
    if (marker.resolved) {
      continue;
    }

    // Convert scene coordinates to container-relative coordinates
    const x = (marker.x + appState.scrollX) * appState.zoom.value;
    const y = (marker.y + appState.scrollY) * appState.zoom.value;

    // Calculate pin dimensions based on number of participants
    const participantCount = Math.min(marker.participants.length, MAX_AVATARS);
    const avatarsWidth =
      AVATAR_SIZE + (participantCount - 1) * (AVATAR_SIZE - AVATAR_OVERLAP);
    const pinWidth = avatarsWidth + PADDING * 2;
    const pinHeight = AVATAR_SIZE + PADDING * 2;

    // Skip if outside viewport
    if (
      x < -pinWidth * 2 ||
      x > normalizedWidth + pinWidth ||
      y < -pinHeight * 2 ||
      y > normalizedHeight + pinHeight
    ) {
      continue;
    }

    context.save();

    const isSelected = marker.selected;
    const isDark = appState.theme === THEME.DARK;

    // Pin colors (matches CSS: bg-surface-low-for-dropdown)
    const pinBgColor = isSelected ? "#6965db" : isDark ? "#3d3d42" : "#f8f9fa";

    // The marker coordinate (x, y) is where the pin TIP (bottom-left corner) should be
    // CSS: border-radius: 66px 67px 67px 0 (tl, tr, br, bl) - bl is sharp
    // CSS: transform: rotate(-45deg)
    //
    // After -45° rotation, the sharp bottom-left corner points down-left

    // Calculate pin position so the tip is at marker coords
    // The pin center after rotation needs to be offset
    const pinCenterX = x + pinWidth * 0.35;
    const pinCenterY = y - pinHeight * 0.35;

    context.translate(pinCenterX, pinCenterY);
    context.rotate((-45 * Math.PI) / 180);

    // Draw pin shadow
    context.shadowColor = "rgba(0, 0, 0, 0.1)";
    context.shadowBlur = 4;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 2;

    // Draw pin shape - teardrop with asymmetric border-radius
    context.beginPath();
    drawTeardropPin(
      context,
      -pinWidth / 2,
      -pinHeight / 2,
      pinWidth,
      pinHeight,
    );
    context.fillStyle = pinBgColor;
    context.fill();

    // Reset shadow
    context.shadowColor = "transparent";
    context.shadowBlur = 0;

    // Selection ring
    if (isSelected) {
      context.strokeStyle = "#a5b4fc";
      context.lineWidth = 2;
      context.beginPath();
      drawTeardropPin(
        context,
        -pinWidth / 2 - 2,
        -pinHeight / 2 - 2,
        pinWidth + 4,
        pinHeight + 4,
      );
      context.stroke();
    }

    // Draw avatars (counter-rotated to stay upright)
    context.save();
    context.rotate((45 * Math.PI) / 180); // Counter-rotate

    // Calculate starting position for avatar stack
    const startX = -avatarsWidth / 2 + AVATAR_SIZE / 2;
    const avatarY = 0;

    // Draw avatars in reverse order (last on top) then draw from right to left
    const visibleParticipants = marker.participants.slice(0, MAX_AVATARS);

    for (let i = visibleParticipants.length - 1; i >= 0; i--) {
      const participant = visibleParticipants[i];
      const avatarX = startX + i * (AVATAR_SIZE - AVATAR_OVERLAP);
      const avatarRadius = AVATAR_SIZE / 2;

      // Clip to circle for avatar
      context.save();
      context.beginPath();
      context.arc(avatarX, avatarY, avatarRadius, 0, 2 * Math.PI);
      context.clip();

      // Try to draw avatar image
      let drewImage = false;
      if (participant.avatar) {
        const img = getAvatarImage(participant.avatar);
        if (img) {
          context.drawImage(
            img,
            avatarX - avatarRadius,
            avatarY - avatarRadius,
            AVATAR_SIZE,
            AVATAR_SIZE,
          );
          drewImage = true;
        }
      }

      // Fallback: draw initial
      if (!drewImage) {
        // Background
        const avatarBgColor = isDark ? "#4a47a3" : "#e8e7f8";
        context.fillStyle = avatarBgColor;
        context.fillRect(
          avatarX - avatarRadius,
          avatarY - avatarRadius,
          AVATAR_SIZE,
          AVATAR_SIZE,
        );

        // Initial letter
        context.fillStyle = isDark ? "#e8e7f8" : "#6965db";
        context.font = "600 12px -apple-system, BlinkMacSystemFont, sans-serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        const initial = participant.name?.charAt(0).toUpperCase() || "?";
        context.fillText(initial, avatarX, avatarY);
      }

      context.restore(); // Restore from clip

      // Draw avatar border
      context.beginPath();
      context.arc(avatarX, avatarY, avatarRadius, 0, 2 * Math.PI);
      context.strokeStyle = isDark ? "#232329" : "#ffffff";
      context.lineWidth = 1;
      context.stroke();
    }

    context.restore(); // Restore from counter-rotation
    context.restore(); // Restore from main transform
  }
};

/**
 * Draws a teardrop pin shape (rounded rectangle with one sharp corner).
 * CSS border-radius: 66px 67px 67px 0 means:
 * - top-left: rounded
 * - top-right: rounded
 * - bottom-right: rounded
 * - bottom-left: SHARP (this is the pin tip)
 */
function drawTeardropPin(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  // Radius is based on the smaller dimension
  const radius = Math.min(width, height) * 0.5;

  // Start at bottom-left (sharp corner / pin tip)
  ctx.moveTo(x, y + height);

  // Left edge up to where top-left curve starts
  ctx.lineTo(x, y + radius);

  // Top-left rounded corner
  ctx.arcTo(x, y, x + radius, y, radius);

  // Top edge
  ctx.lineTo(x + width - radius, y);

  // Top-right rounded corner
  ctx.arcTo(x + width, y, x + width, y + radius, radius);

  // Right edge down to where bottom-right curve starts
  ctx.lineTo(x + width, y + height - radius);

  // Bottom-right rounded corner
  ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);

  // Bottom edge back to sharp corner
  ctx.lineTo(x, y + height);

  ctx.closePath();
}
