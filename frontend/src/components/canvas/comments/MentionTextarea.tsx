import React, { useEffect, useRef, useState } from "react";
import clsx from "clsx";

import * as api from "../../../api";
import type { UserSummary } from "../../../types";

type MentionTextareaProps = {
  drawingId: string;
  value: string;
  onChange: (value: string) => void;
  /** Called with the users currently written as @mentions in the text. */
  onMentionsChange: (mentions: UserSummary[]) => void;
  onSubmit: () => void;
  placeholder?: string;
  autoFocus?: boolean;
};

/** The "@partial" being typed at the caret, if any. */
const getActiveMentionQuery = (
  text: string,
  caret: number,
): { query: string; start: number } | null => {
  const upToCaret = text.slice(0, caret);
  const at = upToCaret.lastIndexOf("@");
  if (at === -1) return null;

  // Only an @ that starts a word counts, and the fragment after it cannot
  // contain whitespace -- otherwise every @ earlier in a paragraph would match.
  const before = at === 0 ? "" : upToCaret[at - 1];
  if (before && !/\s/.test(before)) return null;

  const query = upToCaret.slice(at + 1);
  if (/\s/.test(query)) return null;

  return { query, start: at };
};

export const MentionTextarea: React.FC<MentionTextareaProps> = ({
  drawingId,
  value,
  onChange,
  onMentionsChange,
  onSubmit,
  placeholder = "Write a comment...",
  autoFocus,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [candidates, setCandidates] = useState<UserSummary[]>([]);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [highlighted, setHighlighted] = useState(0);
  // Everyone offered so far, so a name already in the text can be resolved back
  // to an id without asking the server again.
  const knownUsersRef = useRef<Map<string, UserSummary>>(new Map());

  const closeSuggestions = () => {
    setCandidates([]);
    setMentionStart(null);
    setHighlighted(0);
  };

  const handleChange = async (next: string, caret: number) => {
    onChange(next);

    const active = getActiveMentionQuery(next, caret);
    if (!active) {
      closeSuggestions();
    } else {
      setMentionStart(active.start);
      try {
        const users = await api.getMentionableUsers(drawingId, active.query);
        for (const user of users) knownUsersRef.current.set(user.name, user);
        setCandidates(users);
        setHighlighted(0);
      } catch (err) {
        console.error("Failed to load mention suggestions:", err);
        setCandidates([]);
      }
    }

    // Report whichever known names still appear as @mentions in the text.
    const mentioned: UserSummary[] = [];
    for (const [name, user] of knownUsersRef.current) {
      if (next.includes(`@${name}`)) mentioned.push(user);
    }
    onMentionsChange(mentioned);
  };

  const insertMention = (user: UserSummary) => {
    if (mentionStart === null) return;
    const textarea = textareaRef.current;
    const caret = textarea?.selectionStart ?? value.length;
    const next = `${value.slice(0, mentionStart)}@${user.name} ${value.slice(caret)}`;
    knownUsersRef.current.set(user.name, user);
    onChange(next);
    closeSuggestions();

    const nextCaret = mentionStart + user.name.length + 2;
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextCaret, nextCaret);
    });

    const mentioned: UserSummary[] = [];
    for (const [name, known] of knownUsersRef.current) {
      if (next.includes(`@${name}`)) mentioned.push(known);
    }
    onMentionsChange(mentioned);
  };

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  const isSuggesting = candidates.length > 0 && mentionStart !== null;

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        placeholder={placeholder}
        rows={2}
        onChange={(event) =>
          handleChange(event.target.value, event.target.selectionStart)
        }
        onKeyDown={(event) => {
          if (isSuggesting) {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setHighlighted((i) => (i + 1) % candidates.length);
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setHighlighted(
                (i) => (i - 1 + candidates.length) % candidates.length,
              );
              return;
            }
            if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault();
              insertMention(candidates[highlighted]);
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              closeSuggestions();
              return;
            }
          }
          // Enter sends; Shift+Enter starts a new line.
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSubmit();
          }
        }}
        className="w-full resize-none rounded-lg border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-slate-900 dark:text-white outline-none placeholder:text-slate-400 dark:placeholder:text-neutral-500"
      />

      {isSuggesting && (
        <ul className="absolute bottom-full left-0 z-40 mb-1 max-h-44 w-full overflow-y-auto rounded-lg border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-800 py-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]">
          {candidates.map((user, index) => (
            <li key={user.id}>
              <button
                type="button"
                onMouseDown={(event) => {
                  // mousedown, so the textarea does not lose focus first.
                  event.preventDefault();
                  insertMention(user);
                }}
                onMouseEnter={() => setHighlighted(index)}
                className={clsx(
                  "w-full px-3 py-1.5 text-left text-sm",
                  index === highlighted
                    ? "bg-indigo-50 dark:bg-neutral-700 text-indigo-900 dark:text-white"
                    : "text-slate-700 dark:text-neutral-300",
                )}
              >
                <span className="font-bold">{user.name}</span>
                <span className="ml-2 text-xs text-slate-400 dark:text-neutral-500">
                  {user.email}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
