import type { UserSummary } from "../../../types";

export type CommentSegment = { text: string; isMention: boolean };

const escapeForRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Splits a comment into plain and @mention segments.
 *
 * The names of the people actually mentioned are matched first, because a name
 * can contain spaces and a bare word pattern would only catch its first half.
 * Anything else shaped like a single-word @handle is still marked, so a mention
 * of someone since removed from the drawing does not lose its styling.
 */
export const splitCommentMentions = (
  content: string,
  mentioned: UserSummary[],
): CommentSegment[] => {
  const names = mentioned
    .map((user) => user.name)
    .filter((name): name is string => Boolean(name))
    // Longest first, so "@Dana Lee" wins over a shorter "@Dana".
    .sort((a, b) => b.length - a.length)
    .map((name) => `@${escapeForRegExp(name)}`);

  // nosemgrep -- every name is escaped with escapeForRegExp
  const pattern = new RegExp(`(${[...names, "@[\\w.-]+"].join("|")})`, "g");

  return content
    .split(pattern)
    .filter((part) => part !== "")
    .map((part) => ({ text: part, isMention: part.startsWith("@") }));
};
