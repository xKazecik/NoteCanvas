import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as api from "../../api";
import type { DrawingSortField, SortDirection } from "../../api";
import type { Collection, DrawingSummary } from "../../types";
import { isLatestRequest, mergeUniqueDrawings } from "./pagination";
import {
  getOfflineStateVersion,
  isNetworkError,
  subscribeOffline,
} from "../../offline/offlineState";
import { listFromSnapshot } from "../../offline/offlineSnapshot";

type SelectedCollectionId = string | null | undefined;

type UseDashboardDataOptions = {
  debouncedSearch: string;
  selectedCollectionId: SelectedCollectionId;
  sortField: DrawingSortField;
  sortDirection: SortDirection;
  pageSize: number;
  onRefreshSuccess?: () => void;
};

export const useDashboardData = ({
  debouncedSearch,
  selectedCollectionId,
  sortField,
  sortDirection,
  pageSize,
  onRefreshSuccess,
}: UseDashboardDataOptions) => {
  // The main page is the root of the folder tree, so it lists what sits at the
  // root: drawings in no collection, alongside the root collection cards the
  // dashboard renders itself. `undefined` would ask the API for every drawing,
  // nested ones included.
  const listedCollectionId =
    selectedCollectionId === undefined ? null : selectedCollectionId;

  const [drawings, setDrawings] = useState<DrawingSummary[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const listRequestVersionRef = useRef(0);
  const nextOffsetRef = useRef(0);

  const hasMore = drawings.length < totalCount;

  const refreshData = useCallback(async () => {
    const requestVersion = ++listRequestVersionRef.current;
    setIsLoading(true);
    try {
      const isSharedView = selectedCollectionId === "shared";
      const drawingsPromise = isSharedView
        ? api.getSharedDrawings(debouncedSearch, {
            limit: pageSize,
            offset: 0,
            sortField,
            sortDirection,
          })
        : api.getDrawings(debouncedSearch, listedCollectionId, {
            limit: pageSize,
            offset: 0,
            sortField,
            sortDirection,
          });

      const [drawingsResult, collectionsResult] = await Promise.allSettled([
        drawingsPromise,
        api.getCollections(),
      ]);
      if (!isLatestRequest(requestVersion, listRequestVersionRef.current))
        return;

      // No connection: show what this browser last saw, plus offline copies.
      if (
        drawingsResult.status === "rejected" &&
        isNetworkError(drawingsResult.reason)
      ) {
        const cached = await listFromSnapshot({
          search: debouncedSearch,
          selectedCollectionId,
          sortField,
          sortDirection,
        }).catch(() => null);
        if (!isLatestRequest(requestVersion, listRequestVersionRef.current))
          return;
        if (cached) {
          setDrawings(cached.drawings);
          setTotalCount(cached.drawings.length);
          nextOffsetRef.current = cached.drawings.length;
          if (cached.collections) setCollections(cached.collections);
          return;
        }
      }

      if (drawingsResult.status === "fulfilled") {
        setDrawings(drawingsResult.value.drawings);
        setTotalCount(drawingsResult.value.totalCount);
        nextOffsetRef.current = drawingsResult.value.drawings.length;
        onRefreshSuccess?.();
      } else {
        console.error("Failed to fetch drawings:", drawingsResult.reason);
      }

      if (collectionsResult.status === "fulfilled") {
        setCollections(collectionsResult.value);
      } else {
        console.error("Failed to fetch collections:", collectionsResult.reason);
      }
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      if (isLatestRequest(requestVersion, listRequestVersionRef.current)) {
        setIsLoading(false);
      }
    }
  }, [
    debouncedSearch,
    selectedCollectionId,
    listedCollectionId,
    pageSize,
    sortField,
    sortDirection,
    onRefreshSuccess,
  ]);

  const fetchMore = useCallback(async () => {
    if (isFetchingMore || !hasMore || isLoading) return;
    const requestVersion = listRequestVersionRef.current;
    setIsFetchingMore(true);
    try {
      const isSharedView = selectedCollectionId === "shared";
      const drawingsRes = await (isSharedView
        ? api.getSharedDrawings(debouncedSearch, {
            limit: pageSize,
            offset: nextOffsetRef.current,
            sortField,
            sortDirection,
          })
        : api.getDrawings(debouncedSearch, listedCollectionId, {
            limit: pageSize,
            offset: nextOffsetRef.current,
            sortField,
            sortDirection,
          }));
      if (!isLatestRequest(requestVersion, listRequestVersionRef.current))
        return;
      setDrawings((prev) => mergeUniqueDrawings(prev, drawingsRes.drawings));
      setTotalCount(drawingsRes.totalCount);
      nextOffsetRef.current += drawingsRes.drawings.length;
    } catch (err) {
      console.error("Failed to fetch more data:", err);
    } finally {
      setIsFetchingMore(false);
    }
  }, [
    isFetchingMore,
    hasMore,
    isLoading,
    debouncedSearch,
    selectedCollectionId,
    listedCollectionId,
    pageSize,
    sortField,
    sortDirection,
  ]);

  // Reload when the connection drops or returns, or a board goes offline or
  // back online, so the list matches what can actually be opened.
  const offlineStateVersion = useSyncExternalStore(
    subscribeOffline,
    getOfflineStateVersion,
  );
  useEffect(() => {
    refreshData();
  }, [refreshData, offlineStateVersion]);

  return {
    drawings,
    setDrawings,
    collections,
    setCollections,
    totalCount,
    setTotalCount,
    isFetchingMore,
    isLoading,
    hasMore,
    refreshData,
    fetchMore,
  };
};
