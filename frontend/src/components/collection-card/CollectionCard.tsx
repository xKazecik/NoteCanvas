import React, { useEffect, useRef, useState } from "react";
import { Folder, Palette } from "lucide-react";
import clsx from "clsx";

import type { Collection } from "../../types";
import {
  COLLECTION_COLORS,
  getCollectionColorStyle,
  getSwatchClass,
} from "./collectionColors";

type CollectionCardProps = {
  collection: Collection;
  /** How many drawings and subcollections sit directly inside. */
  childCount: number;
  onOpen: (id: string) => void;
  onRecolor: (id: string, color: string | null) => void;
  /** A drawing or collection dropped onto this card moves into it. */
  onDrop?: (event: React.DragEvent, collectionId: string) => void;
};

export const CollectionCard: React.FC<CollectionCardProps> = ({
  collection,
  childCount,
  onOpen,
  onRecolor,
  onDrop,
}) => {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const style = getCollectionColorStyle(collection.color);
  // Only the owner can restyle a collection; a shared one stays as its owner set it.
  const canRecolor = collection.isOwner !== false;

  useEffect(() => {
    if (!isPickerOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!cardRef.current?.contains(event.target as Node)) {
        setIsPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [isPickerOpen]);

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      aria-label={`Open collection ${collection.name}`}
      onClick={() => onOpen(collection.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(collection.id);
        }
      }}
      draggable={canRecolor}
      onDragStart={(event) => {
        event.dataTransfer.setData("collectionId", collection.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragOver(false);
        onDrop?.(event, collection.id);
      }}
      // Roughly half a drawing card, which is a 16/10 preview plus its footer.
      className={clsx(
        "group relative h-[118px] rounded-xl border-2 p-4 flex flex-col justify-between cursor-pointer select-none transition-all duration-200 outline-none",
        "shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]",
        "hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)]",
        "focus-visible:ring-2 focus-visible:ring-indigo-500",
        style.card,
        isDragOver && "-translate-y-0.5 ring-2 ring-indigo-500",
      )}
    >
      <div className="flex items-start gap-3 min-w-0">
        <Folder size={22} className={clsx("shrink-0 mt-0.5", style.icon)} />
        <span className="font-bold text-slate-900 dark:text-white truncate leading-snug">
          {collection.name}
        </span>
      </div>

      <div className="flex items-end justify-between gap-2">
        <span className="text-xs font-bold text-slate-400 dark:text-neutral-500">
          {childCount === 0
            ? "Empty"
            : `${childCount} item${childCount === 1 ? "" : "s"}`}
        </span>

        {canRecolor && (
          <button
            type="button"
            title="Collection colour"
            aria-label="Collection colour"
            onClick={(event) => {
              event.stopPropagation();
              setIsPickerOpen((open) => !open);
            }}
            className="p-1.5 rounded-md text-slate-400 dark:text-neutral-500 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          >
            <Palette size={15} strokeWidth={2.5} />
          </button>
        )}
      </div>

      {isPickerOpen && (
        <div
          role="dialog"
          aria-label="Pick a colour"
          onClick={(event) => event.stopPropagation()}
          className="absolute bottom-11 right-2 z-30 p-2 rounded-lg bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]"
        >
          <div className="grid grid-cols-5 gap-1.5">
            <button
              type="button"
              title="No colour"
              aria-label="No colour"
              onClick={() => {
                onRecolor(collection.id, null);
                setIsPickerOpen(false);
              }}
              className={clsx(
                "w-5 h-5 rounded-full border-2 border-slate-300 dark:border-neutral-600 bg-white dark:bg-neutral-900",
                !collection.color && "ring-2 ring-offset-1 ring-indigo-500",
              )}
            />
            {COLLECTION_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                title={color}
                aria-label={color}
                onClick={() => {
                  onRecolor(collection.id, color);
                  setIsPickerOpen(false);
                }}
                className={clsx(
                  "w-5 h-5 rounded-full border-2 border-black/20",
                  getSwatchClass(color),
                  collection.color === color &&
                    "ring-2 ring-offset-1 ring-indigo-500",
                )}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
