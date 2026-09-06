import { describe, expect, it } from "vitest";

import type { UserSummary } from "../../../types";
import { splitCommentMentions } from "./mentionHighlight";

const user = (id: string, name: string): UserSummary => ({
  id,
  name,
  email: `${id}@test.local`,
});

const mentions = (content: string, mentioned: UserSummary[] = []) =>
  splitCommentMentions(content, mentioned)
    .filter((segment) => segment.isMention)
    .map((segment) => segment.text);

describe("splitCommentMentions", () => {
  it("keeps a whole multi-word name together", () => {
    expect(
      mentions("Ask @Dana Lee about it", [user("u1", "Dana Lee")]),
    ).toEqual(["@Dana Lee"]);
  });

  it("prefers the longer name when one is a prefix of another", () => {
    expect(
      mentions("ping @Dana Lee", [user("u1", "Dana"), user("u2", "Dana Lee")]),
    ).toEqual(["@Dana Lee"]);
  });

  it("still marks a single-word handle with no matching user", () => {
    expect(mentions("cc @someone else")).toEqual(["@someone"]);
  });

  it("marks several mentions in one comment", () => {
    expect(
      mentions("@Dana Lee and @Sam, thoughts?", [
        user("u1", "Dana Lee"),
        user("u2", "Sam"),
      ]),
    ).toEqual(["@Dana Lee", "@Sam"]);
  });

  it("treats a name with regex characters literally", () => {
    expect(mentions("hi @A.(B)+C", [user("u1", "A.(B)+C")])).toEqual([
      "@A.(B)+C",
    ]);
  });

  it("returns the text unchanged when there is no mention", () => {
    const segments = splitCommentMentions("no mentions here", []);
    expect(segments).toEqual([{ text: "no mentions here", isMention: false }]);
  });

  it("preserves the surrounding text", () => {
    const segments = splitCommentMentions("hey @Dana Lee!", [
      user("u1", "Dana Lee"),
    ]);
    expect(segments.map((s) => s.text).join("")).toBe("hey @Dana Lee!");
  });
});
