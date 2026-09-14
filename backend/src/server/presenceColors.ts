/**
 * Collaborator colours.
 *
 * Presence colours are assigned by the server rather than the client, because
 * only the server knows who else is already in the room -- a client picking for
 * itself (by hashing its user id, as this used to) has no way to avoid handing
 * two people the same colour.
 *
 * Twelve hand-picked hues that stay distinguishable from one another and read
 * against both the light and the dark canvas.
 */
export const PRESENCE_COLORS = [
  "#e5484d", // red
  "#f76b15", // orange
  "#ffb224", // amber
  "#99d52a", // lime
  "#30a46c", // green
  "#12a594", // teal
  "#00a2c7", // cyan
  "#0091ff", // blue
  "#3e63dd", // indigo
  "#8e4ec6", // purple
  "#d6409f", // magenta
  "#e93d82", // pink
] as const;

export const DEFAULT_PRESENCE_COLOR = PRESENCE_COLORS[0];

const hslToHex = (hue: number, saturation: number, lightness: number): string => {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = l - chroma / 2;
  const sector = Math.floor(hue / 60) % 6;
  const [r, g, b] = [
    [chroma, secondary, 0],
    [secondary, chroma, 0],
    [0, chroma, secondary],
    [0, secondary, chroma],
    [secondary, 0, chroma],
    [chroma, 0, secondary],
  ][sector];
  const toHex = (channel: number) =>
    Math.round((channel + match) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

/**
 * Picks a colour no one in the room is using, at random so repeat visits to the
 * same drawing do not always look identical.
 *
 * Past the twelfth collaborator the palette is spent, so it keeps walking the
 * hue wheel by the golden angle -- which spreads each later joiner about as far
 * from the existing hues as it can -- and takes the first hue still free.
 */
export const pickPresenceColor = (
  takenColors: Iterable<string>,
  randomFraction: () => number = Math.random,
): string => {
  const taken = new Set<string>();
  for (const color of takenColors) {
    if (typeof color === "string") taken.add(color.toLowerCase());
  }

  const free = PRESENCE_COLORS.filter((color) => !taken.has(color));
  if (free.length > 0) {
    const index = Math.min(
      free.length - 1,
      Math.floor(randomFraction() * free.length),
    );
    return free[index];
  }

  let hue = 0;
  for (let step = 0; step < 360; step += 1) {
    hue = (hue + 137.508) % 360;
    const candidate = hslToHex(hue, 65, 52);
    if (!taken.has(candidate)) return candidate;
  }
  return DEFAULT_PRESENCE_COLOR;
};
