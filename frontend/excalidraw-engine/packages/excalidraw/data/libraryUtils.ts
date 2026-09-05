import { getLanguage } from "../i18n";

import type { LibraryItem, LibraryLocalizedNames } from "../types";

/**
 * Resolves the localized library name for a library item.
 *
 * Priority:
 * 1. Exact match in libraryNames (e.g., "ru-RU")
 * 2. Language prefix match in libraryNames (e.g., "ru" when current is "ru-RU")
 * 3. English fallback in libraryNames (e.g., "en")
 * 4. libraryName field (default fallback)
 *
 * @param item - The library item
 * @param defaultName - Fallback name if no localized name is found
 * @returns The resolved library name
 */
export const getLocalizedLibraryName = (
  item: LibraryItem,
  defaultName: string,
): string => {
  const { libraryNames, libraryName } = item;

  // If no localized names object, use libraryName or default
  if (!libraryNames || Object.keys(libraryNames).length === 0) {
    return libraryName || defaultName;
  }

  const currentLang = getLanguage();
  const langCode = currentLang.code;

  // 1. Exact match (e.g., "ru-RU")
  if (libraryNames[langCode]) {
    return libraryNames[langCode];
  }

  // 2. Language prefix match (e.g., "ru" when current is "ru-RU")
  const langPrefix = langCode.split("-")[0];
  if (langPrefix !== langCode && libraryNames[langPrefix]) {
    return libraryNames[langPrefix];
  }

  // 3. Try to find any key that starts with the same prefix
  const prefixMatch = Object.keys(libraryNames).find((key) =>
    key.startsWith(langPrefix),
  );
  if (prefixMatch) {
    return libraryNames[prefixMatch];
  }

  // 4. English fallback
  if (libraryNames.en) {
    return libraryNames.en;
  }

  // 5. Any English variant fallback
  const enVariant = Object.keys(libraryNames).find((key) =>
    key.startsWith("en"),
  );
  if (enVariant) {
    return libraryNames[enVariant];
  }

  // 6. Use libraryName field or default
  return libraryName || defaultName;
};

/**
 * Resolves localized library name from a names map directly
 * (useful when processing raw library data before creating LibraryItem)
 */
export const resolveLocalizedName = (
  names: LibraryLocalizedNames | undefined,
  fallbackName: string,
): string => {
  if (!names || Object.keys(names).length === 0) {
    return fallbackName;
  }

  const currentLang = getLanguage();
  const langCode = currentLang.code;

  // 1. Exact match
  if (names[langCode]) {
    return names[langCode];
  }

  // 2. Language prefix match
  const langPrefix = langCode.split("-")[0];
  if (langPrefix !== langCode && names[langPrefix]) {
    return names[langPrefix];
  }

  // 3. Try to find any key that starts with the same prefix
  const prefixMatch = Object.keys(names).find((key) =>
    key.startsWith(langPrefix),
  );
  if (prefixMatch) {
    return names[prefixMatch];
  }

  // 4. English fallback
  if (names.en) {
    return names.en;
  }

  // 5. Any English variant fallback
  const enVariant = Object.keys(names).find((key) => key.startsWith("en"));
  if (enVariant) {
    return names[enVariant];
  }

  return fallbackName;
};
