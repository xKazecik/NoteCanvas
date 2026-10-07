import express from "express";
import { compareSemver, parseSemver } from "../../utils/semver";
import { config } from "../../config";
import type { SystemRouteDeps } from "./index";

type UpdateChannel = "stable" | "prerelease";

type ForgejoPackage = {
  name?: string;
  version?: string;
  html_url?: string;
  created_at?: string;
};

const PACKAGE_NAME = "notecanvas";
const PACKAGES_URL = `https://git.kazecik.com/api/v1/packages/xkazecik?type=container&q=${PACKAGE_NAME}&limit=50`;

type UpdateResponse = {
  currentVersion: string | null;
  channel: UpdateChannel;
  outboundEnabled: boolean;
  latestVersion: string | null;
  latestUrl: string | null;
  publishedAt: string | null;
  isUpdateAvailable: boolean | null;
  error?: string;
};

let UPDATE_CHECK_TTL_MS = 10 * 60 * 1000;

let cache:
  | {
      channel: UpdateChannel;
      fetchedAt: number;
      etag: string | null;
      response: Omit<UpdateResponse, "currentVersion">;
    }
  | null = null;

const parseChannel = (raw: unknown): UpdateChannel => {
  const normalized = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return normalized === "prerelease" ? "prerelease" : "stable";
};

const envOutboundEnabled = (): boolean => config.updateCheck.outbound;

// Images are tagged MAJOR.MINOR (see .forgejo/workflows/docker.yml), so pad a
// missing patch number before comparing. Non-version tags (latest, sha-*) fail to parse.
const parseVersion = (raw: string) =>
  parseSemver(raw.trim().replace(/^v?(\d+)\.(\d+)(?=-|$)/, "$1.$2.0"));

const pickLatestPackage = (
  packages: ForgejoPackage[],
  channel: UpdateChannel
): ForgejoPackage | null => {
  const candidates = packages
    .filter((p) => p && p.name === PACKAGE_NAME)
    .map((r) => {
      const version = typeof r.version === "string" ? r.version : "";
      const parsed = parseVersion(version);
      return { r, parsed };
    })
    .filter((x) => Boolean(x.parsed))
    .filter((x) => channel === "prerelease" || x.parsed!.prerelease.length === 0) as Array<{
    r: ForgejoPackage;
    parsed: NonNullable<ReturnType<typeof parseSemver>>;
  }>;

  if (candidates.length === 0) return null;

  let best = candidates[0];
  for (const candidate of candidates.slice(1)) {
    if (compareSemver(candidate.parsed, best.parsed) > 0) {
      best = candidate;
    }
  }
  return best.r;
};

export const fetchLatest = async (
  channel: UpdateChannel
): Promise<Omit<UpdateResponse, "currentVersion">> => {
  const now = Date.now();
  if (cache && cache.channel === channel && now - cache.fetchedAt < UPDATE_CHECK_TTL_MS) {
    return cache.response;
  }

  if (!envOutboundEnabled()) {
    const response: Omit<UpdateResponse, "currentVersion"> = {
      channel,
      outboundEnabled: false,
      latestVersion: null,
      latestUrl: null,
      publishedAt: null,
      isUpdateAvailable: null,
    };
    cache = { channel, fetchedAt: now, etag: null, response };
    return response;
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "NoteCanvas-UpdateCheck",
  };
  if (cache && cache.channel === channel && cache.etag) {
    headers["If-None-Match"] = cache.etag;
  }

  const resp = await fetch(PACKAGES_URL, { headers });

  if (resp.status === 304 && cache && cache.channel === channel) {
    cache = { ...cache, fetchedAt: now };
    return cache.response;
  }

  if (!resp.ok) {
    const response: Omit<UpdateResponse, "currentVersion"> = {
      channel,
      outboundEnabled: true,
      latestVersion: null,
      latestUrl: null,
      publishedAt: null,
      isUpdateAvailable: null,
      error: `Package registry error: HTTP ${resp.status}`,
    };
    cache = { channel, fetchedAt: now, etag: null, response };
    return response;
  }

  const etag = resp.headers.get("etag");
  const json = (await resp.json()) as unknown;
  const packages = Array.isArray(json) ? (json as ForgejoPackage[]) : [];
  const latest = pickLatestPackage(packages, channel);

  const latestVersion = typeof latest?.version === "string" ? latest.version : null;
  const response: Omit<UpdateResponse, "currentVersion"> = {
    channel,
    outboundEnabled: true,
    latestVersion,
    latestUrl: typeof latest?.html_url === "string" ? latest.html_url : null,
    publishedAt: typeof latest?.created_at === "string" ? latest.created_at : null,
    isUpdateAvailable: null, // computed once we know currentVersion
  };

  cache = { channel, fetchedAt: now, etag, response };
  return response;
};

export const computeIsUpdateAvailable = (
  currentVersion: string | null,
  latestVersion: string | null
): boolean | null => {
  if (!currentVersion || !latestVersion) return null;
  const currentParsed = parseVersion(currentVersion);
  const latestParsed = parseVersion(latestVersion);
  if (!currentParsed || !latestParsed) return null;
  return compareSemver(latestParsed, currentParsed) > 0;
};

export const __resetUpdateCacheForTests = (): void => {
  cache = null;
};

export const __setUpdateTtlForTests = (ttlMs: number): void => {
  UPDATE_CHECK_TTL_MS = ttlMs;
};

export const registerUpdateRoutes = (app: express.Express, deps: SystemRouteDeps) => {
  app.get(
    "/system/update",
    deps.asyncHandler(async (req, res) => {
      const channel = parseChannel(req.query.channel);
      const currentVersion = config.updateCheck.appVersion ?? (deps.getBackendVersion() || null);

      const latest = await fetchLatest(channel);

      const isUpdateAvailable = computeIsUpdateAvailable(currentVersion, latest.latestVersion);

      const payload: UpdateResponse = {
        ...latest,
        currentVersion,
        isUpdateAvailable,
      };

      res.status(200).json(payload);
    })
  );
};
