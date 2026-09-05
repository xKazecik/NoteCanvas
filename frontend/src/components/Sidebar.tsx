import React, { useState, useEffect, useMemo } from "react";
import {
  LayoutGrid,
  Folder,
  Plus,
  Archive,
  FolderOpen,
  Shield,
} from "lucide-react";
import type { Collection } from "../types";
import clsx from "clsx";
import { ConfirmModal } from "./ConfirmModal";
import { ShareCollectionModal } from "./ShareCollectionModal";
import { Logo } from "./Logo";
import { useAuth } from "../context/AuthContext";
import { displayFontFamily } from "../utils/displayFont";
import { SidebarItem } from "./sidebar/SidebarItem";
import { SidebarFooter } from "./sidebar/SidebarFooter";
import {
  SidebarContextMenu,
  type SidebarContextMenuState,
} from "./sidebar/SidebarContextMenu";
import {
  buildCollectionTree,
  collectionDescendantIds,
  type CollectionTreeNode,
} from "./sidebar/collectionTree";

interface SidebarProps {
  collections: Collection[];
  selectedCollectionId: string | null | undefined;
  onSelectCollection: (id: string | null | undefined) => void;
  onCreateCollection: (name: string, parentId?: string | null) => void;
  onEditCollection: (id: string, name: string) => void;
  onDeleteCollection: (id: string) => void;
  onMoveCollection?: (id: string, parentId: string | null) => void;
  onDrop?: (e: React.DragEvent, collectionId: string | null) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  collections,
  selectedCollectionId,
  onSelectCollection,
  onCreateCollection,
  onEditCollection,
  onDeleteCollection,
  onMoveCollection,
  onDrop,
}) => {
  const { logout, user, authEnabled } = useAuth();
  const [isCreating, setIsCreating] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [contextMenu, setContextMenu] =
    useState<SidebarContextMenuState | null>(null);
  const [collectionToDelete, setCollectionToDelete] = useState<string | null>(
    null,
  );
  const [collectionToShare, setCollectionToShare] = useState<string | null>(
    null,
  );
  // Which collection the pending "new collection" input will be created under;
  // null means the top level.
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const visibleCollections = useMemo(
    () => collections.filter((c) => c.name !== "Trash"),
    [collections],
  );
  const collectionTree = useMemo(
    () => buildCollectionTree(visibleCollections),
    [visibleCollections],
  );

  // Branches start open, so a newly nested collection is visible straight away
  // without the user having to hunt for it.
  const toggleCollapsed = (id: string) =>
    setCollapsedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const startCreatingUnder = (parentId: string | null) => {
    setCreateParentId(parentId);
    setNewCollectionName("");
    setIsCreating(true);
    if (parentId) {
      setCollapsedIds((previous) => {
        const next = new Set(previous);
        next.delete(parentId);
        return next;
      });
    }
  };

  // A drop carrying a collectionId re-parents that collection; anything else is
  // a drawing (or a file) and belongs to the dashboard's own handler.
  const handleItemDrop = (e: React.DragEvent, targetId: string | null) => {
    const draggedCollectionId = e.dataTransfer.getData("collectionId");
    if (!draggedCollectionId) {
      onDrop?.(e, targetId);
      return;
    }
    if (draggedCollectionId === targetId) return;
    if (
      targetId &&
      collectionDescendantIds(visibleCollections, draggedCollectionId).has(
        targetId,
      )
    ) {
      // Would move a collection inside its own subtree; the server rejects this
      // too, but there is no reason to make the round trip.
      return;
    }
    onMoveCollection?.(draggedCollectionId, targetId);
  };
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);
  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCollectionName.trim()) {
      onCreateCollection(newCollectionName, createParentId);
      setNewCollectionName("");
      setIsCreating(false);
      setCreateParentId(null);
    }
  };
  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId && editName.trim()) {
      onEditCollection(editingId, editName);
      setEditingId(null);
    }
  };
  const handleItemContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const collection = collections.find((c) => c.id === id);
    if (!collection?.isOwner && collection?.isOwner !== undefined) return;
    setContextMenu({ x: e.clientX, y: e.clientY, type: "item", id });
  };
  const handleBackgroundContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, type: "background" });
  };

  const renderCollectionNode = (node: CollectionTreeNode): React.ReactNode => {
    const { collection, children, depth } = node;
    const isExpanded = !collapsedIds.has(collection.id);
    // Only owners can restructure their own tree; a collection shared with you
    // stays where its owner put it.
    const canReorganize = collection.isOwner !== false;

    return (
      <React.Fragment key={collection.id}>
        <SidebarItem
          id={collection.id}
          icon={
            selectedCollectionId === collection.id ? (
              <FolderOpen size={18} />
            ) : (
              <Folder size={18} />
            )
          }
          label={collection.name}
          isActive={selectedCollectionId === collection.id}
          onClick={() => onSelectCollection(collection.id)}
          onDoubleClick={() => {
            setEditingId(collection.id);
            setEditName(collection.name);
          }}
          onContextMenu={(e) => handleItemContextMenu(e, collection.id)}
          isEditing={editingId === collection.id}
          editValue={editName}
          onEditChange={setEditName}
          onEditSubmit={handleEditSubmit}
          onEditBlur={() => setEditingId(null)}
          onDrop={handleItemDrop}
          depth={depth}
          hasChildren={children.length > 0}
          isExpanded={isExpanded}
          onToggleExpand={() => toggleCollapsed(collection.id)}
          isDraggable={canReorganize}
          onDragStart={(e) => {
            e.dataTransfer.setData("collectionId", collection.id);
            e.dataTransfer.effectAllowed = "move";
          }}
          extraAction={
            <div className="flex items-center gap-1">
              {/* Shared indicator — only for owned collections that have been shared */}
              {collection.isOwner !== false && collection.isShared && (
                <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800">
                  Shared
                </span>
              )}
              {/* Role badge */}
              <span
                className={clsx(
                  "text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0",
                  collection.isOwner === false
                    ? collection.sharedRole === "edit"
                      ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
                      : "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800"
                    : "bg-slate-100 dark:bg-neutral-800 text-slate-400 dark:text-neutral-500 border-slate-200 dark:border-neutral-700",
                )}
              >
                {collection.isOwner === false
                  ? collection.sharedRole === "edit"
                    ? "Editor"
                    : "Viewer"
                  : "Owner"}
              </span>
            </div>
          }
        />
        {isCreating && createParentId === collection.id && (
          <form
            onSubmit={handleCreateSubmit}
            className="mb-2 px-4"
            style={{ paddingLeft: `${16 + (depth + 1) * 14}px` }}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              type="text"
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              placeholder="New Subcollection..."
              className="w-full px-3 py-2 text-sm bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] outline-none placeholder:text-slate-400 dark:placeholder:text-neutral-500 font-bold text-slate-900 dark:text-white"
              onBlur={() => {
                if (!newCollectionName) {
                  setIsCreating(false);
                  setCreateParentId(null);
                }
              }}
            />
          </form>
        )}
        {isExpanded && children.map(renderCollectionNode)}
      </React.Fragment>
    );
  };
  return (
    <>
      <div className="w-full flex flex-col h-full bg-transparent">
        <div className="p-4 sm:p-5 pb-2">
          <h1
            className="text-2xl text-slate-900 dark:text-white flex items-center gap-3 tracking-tight"
            style={{ fontFamily: displayFontFamily }}
          >
            <Logo className="w-10 h-10" />
            <span className="mt-1">notecanvas</span>
            <span
              className="text-xs font-bold text-red-500 mt-2"
              style={{ fontFamily: "sans-serif" }}
            >
              BETA
            </span>
          </h1>
        </div>
        <nav
          className="flex-1 overflow-y-auto py-3 sm:py-4 space-y-4 sm:space-y-8 custom-scrollbar"
          onContextMenu={handleBackgroundContextMenu}
        >
          <div className="space-y-1">
            <div className="px-6 pb-2 text-[11px] font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-wider">
              Library
            </div>
            <div className="pl-3 pr-2">
              <button
                onClick={() => onSelectCollection(undefined)}
                className={clsx(
                  "w-full flex items-center gap-3 px-3 py-2.5 text-sm font-bold rounded-lg transition-all duration-200 border-2",
                  selectedCollectionId === undefined
                    ? "bg-indigo-50 dark:bg-neutral-800 text-indigo-900 dark:text-neutral-200 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] -translate-y-0.5"
                    : "text-slate-600 dark:text-neutral-400 border-transparent hover:bg-slate-50 dark:hover:bg-neutral-800 hover:border-black dark:hover:border-neutral-700 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5",
                )}
              >
                <LayoutGrid
                  size={18}
                  className={clsx(
                    selectedCollectionId === undefined
                      ? "text-indigo-900 dark:text-neutral-200"
                      : "text-slate-400 dark:text-neutral-500",
                  )}
                />
                <span className="min-w-0 flex-1 text-left">All Drawings</span>
              </button>
            </div>
            <SidebarItem
              id={"shared"}
              icon={<Shield size={18} />}
              label="Shared with me"
              isActive={selectedCollectionId === "shared"}
              onClick={() => onSelectCollection("shared")}
            />
            <SidebarItem
              id={null}
              icon={<Archive size={18} />}
              label="Unorganized"
              isActive={selectedCollectionId === null}
              onClick={() => onSelectCollection(null)}
              onDrop={onDrop}
            />
          </div>
          <div className="space-y-1">
            <div
              className="flex items-center justify-between px-6 pb-2 group/header"
              onDragOver={(e) => {
                // Dropping a collection here lifts it back to the top level.
                if (e.dataTransfer.types.includes("collectionid")) {
                  e.preventDefault();
                }
              }}
              onDrop={(e) => {
                const draggedCollectionId =
                  e.dataTransfer.getData("collectionId");
                if (!draggedCollectionId) return;
                e.preventDefault();
                onMoveCollection?.(draggedCollectionId, null);
              }}
            >
              <span className="text-[11px] font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-wider">
                Collections
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  startCreatingUnder(null);
                }}
                className="p-1 text-slate-400 dark:text-neutral-500 hover:text-indigo-600 dark:hover:text-neutral-200 hover:bg-indigo-50 dark:hover:bg-neutral-800 rounded-md transition-all opacity-0 group-hover/header:opacity-100"
                title="New Collection"
              >
                <Plus size={14} strokeWidth={2.5} />
              </button>
            </div>
            {isCreating && createParentId === null && (
              <form
                onSubmit={handleCreateSubmit}
                className="mb-2 px-4"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  autoFocus
                  type="text"
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  placeholder="New Collection..."
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] outline-none placeholder:text-slate-400 dark:placeholder:text-neutral-500 font-bold text-slate-900 dark:text-white"
                  onBlur={() => !newCollectionName && setIsCreating(false)}
                />
              </form>
            )}
            {collectionTree.map(renderCollectionNode)}
          </div>
        </nav>
        <SidebarFooter
          selectedCollectionId={selectedCollectionId}
          authEnabled={authEnabled}
          user={user}
          onDrop={onDrop}
          onLogout={logout}
        />
      </div>
      {contextMenu && (
        <SidebarContextMenu
          contextMenu={contextMenu}
          collections={collections}
          onClose={() => setContextMenu(null)}
          onCreateCollection={() => startCreatingUnder(null)}
          onCreateSubcollection={(parentId) => startCreatingUnder(parentId)}
          onMoveCollectionToRoot={(id) => onMoveCollection?.(id, null)}
          onRenameCollection={(collection) => {
            setEditingId(collection.id);
            setEditName(collection.name);
          }}
          onShareCollection={setCollectionToShare}
          onDeleteCollection={setCollectionToDelete}
        />
      )}
      <ConfirmModal
        isOpen={!!collectionToDelete}
        title="Delete Collection"
        message="Are you sure you want to delete this collection? All drawings inside will be moved to Unorganized."
        confirmText="Delete Collection"
        onConfirm={() => {
          if (collectionToDelete) {
            onDeleteCollection(collectionToDelete);
            setCollectionToDelete(null);
          }
        }}
        onCancel={() => setCollectionToDelete(null)}
      />
      <ShareCollectionModal
        isOpen={!!collectionToShare}
        collectionId={collectionToShare ?? ""}
        collectionName={
          collections.find((c) => c.id === collectionToShare)?.name ?? ""
        }
        onClose={() => setCollectionToShare(null)}
      />
    </>
  );
};
