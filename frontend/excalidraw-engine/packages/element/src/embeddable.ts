import {
  FONT_FAMILY,
  VERTICAL_ALIGN,
  escapeDoubleQuotes,
  getFontString,
} from "@excalidraw/common";

import type { ExcalidrawProps } from "@excalidraw/excalidraw/types";
import type { MarkRequired } from "@excalidraw/common/utility-types";

import { newTextElement } from "./newElement";
import { wrapText } from "./textWrapping";
import { isIframeElement } from "./typeChecks";

import type {
  ExcalidrawElement,
  ExcalidrawIframeLikeElement,
  IframeData,
} from "./types";

type IframeDataWithSandbox = MarkRequired<IframeData, "sandbox">;

const embeddedLinkCache = new Map<string, IframeDataWithSandbox>();

const RE_YOUTUBE =
  /^(?:http(?:s)?:\/\/)?(?:www\.)?youtu(?:be\.com|\.be)\/(embed\/|watch\?v=|shorts\/|playlist\?list=|embed\/videoseries\?list=)?([a-zA-Z0-9_-]+)/;

const RE_VIMEO =
  /^(?:http(?:s)?:\/\/)?(?:(?:w){3}\.)?(?:player\.)?vimeo\.com\/(?:video\/)?([^?\s]+)(?:\?.*)?$/;
const RE_FIGMA = /^https:\/\/(?:www\.)?figma\.com/;

const RE_GH_GIST = /^https:\/\/gist\.github\.com\/([\w_-]+)\/([\w_-]+)/;
const RE_GH_GIST_EMBED =
  /^<script[\s\S]*?\ssrc=["'](https:\/\/gist\.github\.com\/.*?)\.js["']/i;

const RE_MSFORMS = /^(?:https?:\/\/)?forms\.microsoft\.com\//;

// not anchored to start to allow <blockquote> twitter embeds
const RE_TWITTER =
  /(?:https?:\/\/)?(?:(?:w){3}\.)?(?:twitter|x)\.com\/[^/]+\/status\/(\d+)/;
const RE_TWITTER_EMBED =
  /^<blockquote[\s\S]*?\shref=["'](https?:\/\/(?:twitter|x)\.com\/[^"']*)/i;

const RE_VALTOWN =
  /^https:\/\/(?:www\.)?val\.town\/(v|embed)\/[a-zA-Z_$][0-9a-zA-Z_$]+\.[a-zA-Z_$][0-9a-zA-Z_$]+/;

const RE_GENERIC_EMBED =
  /^<(?:iframe|blockquote)[\s\S]*?\s(?:src|href)=["']([^"']*)["'][\s\S]*?>$/i;

const RE_GIPHY =
  /giphy.com\/(?:clips|embed|gifs)\/[a-zA-Z0-9]*?-?([a-zA-Z0-9]+)(?:[^a-zA-Z0-9]|$)/;

const RE_REDDIT =
  /^(?:http(?:s)?:\/\/)?(?:www\.)?reddit\.com\/r\/([a-zA-Z0-9_]+)\/comments\/([a-zA-Z0-9_]+)\/([a-zA-Z0-9_]+)\/?(?:\?[^#\s]*)?(?:#[^\s]*)?$/;

const RE_REDDIT_EMBED =
  /^<blockquote[\s\S]*?\shref=["'](https?:\/\/(?:www\.)?reddit\.com\/[^"']*)/i;

// SharePoint/OneDrive sharing links
// Format: https://{tenant}.sharepoint.com/:x:/g/personal/{user}/{id} (OneDrive for Business)
// Format: https://{tenant}.sharepoint.com/:x:/r/sites/{site}/_layouts/15/Doc.aspx (SharePoint sites)
// Format: https://onedrive.live.com/embed?... (personal OneDrive)
// The :x:, :w:, :p:, :o:, :b:, :v:, :i: indicate file types (Excel, Word, PowerPoint, OneNote, PDF, Video, Image)
const RE_SHAREPOINT =
  /^https?:\/\/[a-zA-Z0-9_-]+(?:-my)?\.sharepoint\.com\/:[xwpobvi]:\/[grs]\//i;

const RE_SHAREPOINT_SITES =
  /^https?:\/\/[a-zA-Z0-9_-]+\.sharepoint\.com\/sites\//i;

const RE_ONEDRIVE_LIVE = /^https?:\/\/(?:1drv\.ms|onedrive\.live\.com)\//i;

// Google Docs, Sheets, Slides, and Drive
// Format: https://docs.google.com/document/d/{id}/edit
// Format: https://docs.google.com/spreadsheets/d/{id}/edit
// Format: https://docs.google.com/presentation/d/{id}/edit
// Format: https://drive.google.com/file/d/{id}/view
const RE_GOOGLE_DOCS =
  /^https?:\/\/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/;
const RE_GOOGLE_DRIVE =
  /^https?:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/;

// Power BI
// Format: https://app.powerbi.com/links/{id}?ctid=...
// Format: https://app.powerbi.com/view?r={encodedConfig}
// Format: https://app.powerbi.com/reportEmbed?reportId=...
// Format: https://app.powerbi.com/groups/{groupId}/reports/{reportId}
const RE_POWERBI =
  /^https?:\/\/app\.powerbi\.com\/(links\/[a-zA-Z0-9_-]+|view\?|reportEmbed\?|groups\/[a-zA-Z0-9-]+\/reports\/[a-zA-Z0-9-]+)/i;

const parseYouTubeTimestamp = (url: string): number => {
  let timeParam: string | null | undefined;

  try {
    const urlObj = new URL(url.startsWith("http") ? url : `https://${url}`);
    timeParam =
      urlObj.searchParams.get("t") || urlObj.searchParams.get("start");
  } catch (error) {
    const timeMatch = url.match(/[?&#](?:t|start)=([^&#\s]+)/);
    timeParam = timeMatch?.[1];
  }

  if (!timeParam) {
    return 0;
  }

  if (/^\d+$/.test(timeParam)) {
    return parseInt(timeParam, 10);
  }

  const timeMatch = timeParam.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!timeMatch) {
    return 0;
  }

  const [, hours = "0", minutes = "0", seconds = "0"] = timeMatch;
  return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds);
};

const ALLOWED_DOMAINS = new Set([
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "player.vimeo.com",
  "figma.com",
  "link.excalidraw.com",
  "gist.github.com",
  "twitter.com",
  "x.com",
  "*.simplepdf.eu",
  "stackblitz.com",
  "val.town",
  "giphy.com",
  "reddit.com",
  "forms.microsoft.com",
  "kinescope.io",
  "*.kinescopecdn.net",
  // SharePoint/OneDrive domains
  "*.sharepoint.com",
  "onedrive.live.com",
  "1drv.ms",
  // Google Docs/Sheets/Slides/Drive
  "docs.google.com",
  "drive.google.com",
  // Power BI
  "app.powerbi.com",
]);

const ALLOW_SAME_ORIGIN = new Set([
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "player.vimeo.com",
  "figma.com",
  "twitter.com",
  "x.com",
  "*.simplepdf.eu",
  "stackblitz.com",
  "reddit.com",
  "forms.microsoft.com",
  "kinescope.io",
  "*.kinescopecdn.net",
  // SharePoint/OneDrive require same-origin for authentication
  "*.sharepoint.com",
  "onedrive.live.com",
  "1drv.ms",
  // Google Docs/Sheets/Slides/Drive require same-origin for auth
  "docs.google.com",
  "drive.google.com",
  // Power BI requires same-origin for auth
  "app.powerbi.com",
]);

export const createSrcDoc = (body: string) => {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`;
};

export const getEmbedLink = (
  link: string | null | undefined,
): IframeDataWithSandbox | null => {
  if (!link) {
    return null;
  }

  if (embeddedLinkCache.has(link)) {
    return embeddedLinkCache.get(link)!;
  }

  const originalLink = link;

  const allowSameOrigin = ALLOW_SAME_ORIGIN.has(
    matchHostname(link, ALLOW_SAME_ORIGIN) || "",
  );

  let type: "video" | "generic" = "generic";
  let aspectRatio = { w: 560, h: 840 };
  const ytLink = link.match(RE_YOUTUBE);
  if (ytLink?.[2]) {
    const startTime = parseYouTubeTimestamp(originalLink);
    const time = startTime > 0 ? `&start=${startTime}` : ``;
    const isPortrait = link.includes("shorts");
    type = "video";
    switch (ytLink[1]) {
      case "embed/":
      case "watch?v=":
      case "shorts/":
        link = `https://www.youtube.com/embed/${ytLink[2]}?enablejsapi=1${time}`;
        break;
      case "playlist?list=":
      case "embed/videoseries?list=":
        link = `https://www.youtube.com/embed/videoseries?list=${ytLink[2]}&enablejsapi=1${time}`;
        break;
      default:
        link = `https://www.youtube.com/embed/${ytLink[2]}?enablejsapi=1${time}`;
        break;
    }
    aspectRatio = isPortrait ? { w: 315, h: 560 } : { w: 560, h: 315 };
    embeddedLinkCache.set(originalLink, {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    });
    return {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    };
  }

  const vimeoLink = link.match(RE_VIMEO);
  if (vimeoLink?.[1]) {
    const target = vimeoLink?.[1];
    const error = !/^\d+$/.test(target)
      ? new URIError("Invalid embed link format")
      : undefined;
    type = "video";
    link = `https://player.vimeo.com/video/${target}?api=1`;
    aspectRatio = { w: 560, h: 315 };
    //warning deliberately ommited so it is displayed only once per link
    //same link next time will be served from cache
    embeddedLinkCache.set(originalLink, {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    });
    return {
      link,
      intrinsicSize: aspectRatio,
      type,
      error,
      sandbox: { allowSameOrigin },
    };
  }

  const figmaLink = link.match(RE_FIGMA);
  if (figmaLink) {
    type = "generic";
    link = `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(
      link,
    )}`;
    aspectRatio = { w: 550, h: 550 };
    embeddedLinkCache.set(originalLink, {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    });
    return {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    };
  }

  const valLink = link.match(RE_VALTOWN);
  if (valLink) {
    link =
      valLink[1] === "embed" ? valLink[0] : valLink[0].replace("/v", "/embed");
    embeddedLinkCache.set(originalLink, {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    });
    return {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    };
  }

  if (RE_MSFORMS.test(link) && !link.includes("embed=true")) {
    link += link.includes("?") ? "&embed=true" : "?embed=true";
  }

  if (RE_TWITTER.test(link)) {
    const postId = link.match(RE_TWITTER)![1];
    // the embed srcdoc still supports twitter.com domain only.
    // Note that we don't attempt to parse the username as it can consist of
    // non-latin1 characters, and the username in the url can be set to anything
    // without affecting the embed.
    const safeURL = escapeDoubleQuotes(
      `https://twitter.com/x/status/${postId}`,
    );

    const ret: IframeDataWithSandbox = {
      type: "document",
      srcdoc: (theme: string) =>
        createSrcDoc(
          `<blockquote class="twitter-tweet" data-dnt="true" data-theme="${theme}"><a href="${safeURL}"></a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>`,
        ),
      intrinsicSize: { w: 480, h: 480 },
      sandbox: { allowSameOrigin },
    };
    embeddedLinkCache.set(originalLink, ret);
    return ret;
  }

  if (RE_REDDIT.test(link)) {
    const [, page, postId, title] = link.match(RE_REDDIT)!;
    const safeURL = escapeDoubleQuotes(
      `https://reddit.com/r/${page}/comments/${postId}/${title}`,
    );
    const ret: IframeDataWithSandbox = {
      type: "document",
      srcdoc: (theme: string) =>
        createSrcDoc(
          `<blockquote class="reddit-embed-bq" data-embed-theme="${theme}"><a href="${safeURL}"></a><br></blockquote><script async="" src="https://embed.reddit.com/widgets.js" charset="UTF-8"></script>`,
        ),
      intrinsicSize: { w: 480, h: 480 },
      sandbox: { allowSameOrigin },
    };
    embeddedLinkCache.set(originalLink, ret);
    return ret;
  }

  if (RE_GH_GIST.test(link)) {
    const [, user, gistId] = link.match(RE_GH_GIST)!;
    const safeURL = escapeDoubleQuotes(
      `https://gist.github.com/${user}/${gistId}`,
    );
    const ret: IframeDataWithSandbox = {
      type: "document",
      srcdoc: () =>
        createSrcDoc(`
          <script src="${safeURL}.js"></script>
          <style type="text/css">
            * { margin: 0px; }
            table, .gist { height: 100%; }
            .gist .gist-file { height: calc(100vh - 2px); padding: 0px; display: grid; grid-template-rows: 1fr auto; }
          </style>
        `),
      intrinsicSize: { w: 550, h: 720 },
      sandbox: { allowSameOrigin },
    };
    embeddedLinkCache.set(link, ret);
    return ret;
  }

  // SharePoint/OneDrive handling
  // Supports sharing links like:
  // - https://{tenant}-my.sharepoint.com/:x:/g/personal/{user}/{id}
  // - https://{tenant}.sharepoint.com/:x:/r/sites/{site}/...
  // - https://onedrive.live.com/...
  // - https://1drv.ms/...
  if (
    RE_SHAREPOINT.test(link) ||
    RE_SHAREPOINT_SITES.test(link) ||
    RE_ONEDRIVE_LIVE.test(link)
  ) {
    // Determine aspect ratio based on file type indicator
    // :x: = Excel (wider), :w: = Word (taller), :p: = PowerPoint (16:9), etc.
    const fileTypeMatch = link.match(/\/:([xwpobvi]):\//i);
    const fileType = fileTypeMatch?.[1]?.toLowerCase();

    let embedAspectRatio = { w: 800, h: 600 }; // Default
    if (fileType === "x") {
      // Excel - wider for spreadsheets
      embedAspectRatio = { w: 900, h: 600 };
    } else if (fileType === "w") {
      // Word - document ratio
      embedAspectRatio = { w: 700, h: 900 };
    } else if (fileType === "p") {
      // PowerPoint - 16:9 presentation
      embedAspectRatio = { w: 960, h: 540 };
    } else if (fileType === "v") {
      // Video - 16:9
      embedAspectRatio = { w: 800, h: 450 };
      type = "video";
    }

    // Convert sharing link to embed link by adding action=embedview
    // SharePoint links already work in iframes, we just need to add the embed parameter
    let embedLink = link;
    if (!link.includes("action=")) {
      embedLink += link.includes("?")
        ? "&action=embedview"
        : "?action=embedview";
    }

    // For Excel, enable interactivity
    if (fileType === "x" && !link.includes("wdAllowInteractivity")) {
      embedLink += "&wdAllowInteractivity=True";
    }

    const ret: IframeDataWithSandbox = {
      link: embedLink,
      intrinsicSize: embedAspectRatio,
      type,
      sandbox: { allowSameOrigin: true }, // SharePoint requires same-origin for auth
    };
    embeddedLinkCache.set(originalLink, ret);
    return ret;
  }

  // Google Docs, Sheets, Slides handling
  // Convert edit/view URLs to embed URLs
  const googleDocsMatch = link.match(RE_GOOGLE_DOCS);
  if (googleDocsMatch) {
    const [, docType, docId] = googleDocsMatch;
    let embedLink: string;
    let embedAspectRatio = { w: 800, h: 600 };

    switch (docType) {
      case "document":
        // Google Docs - use preview mode for embedding
        embedLink = `https://docs.google.com/document/d/${docId}/preview`;
        embedAspectRatio = { w: 700, h: 900 }; // Document ratio
        break;
      case "spreadsheets":
        // Google Sheets - use pubhtml or preview
        embedLink = `https://docs.google.com/spreadsheets/d/${docId}/preview`;
        embedAspectRatio = { w: 900, h: 600 }; // Spreadsheet ratio
        break;
      case "presentation":
        // Google Slides - use embed mode
        embedLink = `https://docs.google.com/presentation/d/${docId}/embed?start=false&loop=false&delayms=3000`;
        embedAspectRatio = { w: 960, h: 569 }; // 16:9 presentation
        break;
      default:
        embedLink = link;
    }

    const ret: IframeDataWithSandbox = {
      link: embedLink,
      intrinsicSize: embedAspectRatio,
      type: "generic",
      sandbox: { allowSameOrigin: true },
    };
    embeddedLinkCache.set(originalLink, ret);
    return ret;
  }

  // Google Drive file handling (PDFs, images, etc.)
  const googleDriveMatch = link.match(RE_GOOGLE_DRIVE);
  if (googleDriveMatch) {
    const [, fileId] = googleDriveMatch;
    // Use preview URL for Drive files
    const embedLink = `https://drive.google.com/file/d/${fileId}/preview`;

    const ret: IframeDataWithSandbox = {
      link: embedLink,
      intrinsicSize: { w: 800, h: 600 },
      type: "generic",
      sandbox: { allowSameOrigin: true },
    };
    embeddedLinkCache.set(originalLink, ret);
    return ret;
  }

  // Power BI handling
  // Power BI links work directly in iframes, just need to ensure proper parameters
  if (RE_POWERBI.test(link)) {
    // Power BI dashboards/reports use 16:9 aspect ratio
    const ret: IframeDataWithSandbox = {
      link,
      intrinsicSize: { w: 1140, h: 541 }, // Power BI default embed size (roughly 16:9)
      type: "generic",
      sandbox: { allowSameOrigin: true }, // Required for Power BI auth
    };
    embeddedLinkCache.set(originalLink, ret);
    return ret;
  }

  embeddedLinkCache.set(link, {
    link,
    intrinsicSize: aspectRatio,
    type,
    sandbox: { allowSameOrigin },
  });
  return {
    link,
    intrinsicSize: aspectRatio,
    type,
    sandbox: { allowSameOrigin },
  };
};

export const createPlaceholderEmbeddableLabel = (
  element: ExcalidrawIframeLikeElement,
): ExcalidrawElement => {
  let text: string;
  if (isIframeElement(element)) {
    text = "IFrame element";
  } else {
    text =
      !element.link || element?.link === "" ? "Empty Web-Embed" : element.link;
  }

  const fontSize = Math.max(
    Math.min(element.width / 2, element.width / text.length),
    element.width / 30,
  );
  const fontFamily = FONT_FAMILY.Helvetica;

  const fontString = getFontString({
    fontSize,
    fontFamily,
  });

  return newTextElement({
    x: element.x + element.width / 2,
    y: element.y + element.height / 2,
    strokeColor:
      element.strokeColor !== "transparent" ? element.strokeColor : "black",
    backgroundColor: "transparent",
    fontFamily,
    fontSize,
    text: wrapText(text, fontString, element.width - 20),
    textAlign: "center",
    verticalAlign: VERTICAL_ALIGN.MIDDLE,
    angle: element.angle ?? 0,
  });
};

const matchHostname = (
  url: string,
  /** using a Set assumes it already contains normalized bare domains */
  allowedHostnames: Set<string> | string,
): string | null => {
  try {
    const { hostname } = new URL(url);

    const bareDomain = hostname.replace(/^www\./, "");

    if (allowedHostnames instanceof Set) {
      if (ALLOWED_DOMAINS.has(bareDomain)) {
        return bareDomain;
      }

      const bareDomainWithFirstSubdomainWildcarded = bareDomain.replace(
        /^([^.]+)/,
        "*",
      );
      if (ALLOWED_DOMAINS.has(bareDomainWithFirstSubdomainWildcarded)) {
        return bareDomainWithFirstSubdomainWildcarded;
      }
      return null;
    }

    const bareAllowedHostname = allowedHostnames.replace(/^www\./, "");
    if (bareDomain === bareAllowedHostname) {
      return bareAllowedHostname;
    }
  } catch (error) {
    // ignore
  }
  return null;
};

export const maybeParseEmbedSrc = (str: string): string => {
  const twitterMatch = str.match(RE_TWITTER_EMBED);
  if (twitterMatch && twitterMatch.length === 2) {
    return twitterMatch[1];
  }

  const redditMatch = str.match(RE_REDDIT_EMBED);
  if (redditMatch && redditMatch.length === 2) {
    return redditMatch[1];
  }

  const gistMatch = str.match(RE_GH_GIST_EMBED);
  if (gistMatch && gistMatch.length === 2) {
    return gistMatch[1];
  }

  if (RE_GIPHY.test(str)) {
    return `https://giphy.com/embed/${RE_GIPHY.exec(str)![1]}`;
  }

  const match = str.match(RE_GENERIC_EMBED);
  if (match && match.length === 2) {
    return match[1];
  }

  return str;
};

export const embeddableURLValidator = (
  url: string | null | undefined,
  validateEmbeddable: ExcalidrawProps["validateEmbeddable"],
): boolean => {
  if (!url) {
    return false;
  }
  if (validateEmbeddable != null) {
    if (typeof validateEmbeddable === "function") {
      const ret = validateEmbeddable(url);
      // if return value is undefined, leave validation to default
      if (typeof ret === "boolean") {
        return ret;
      }
    } else if (typeof validateEmbeddable === "boolean") {
      return validateEmbeddable;
    } else if (validateEmbeddable instanceof RegExp) {
      return validateEmbeddable.test(url);
    } else if (Array.isArray(validateEmbeddable)) {
      for (const domain of validateEmbeddable) {
        if (domain instanceof RegExp) {
          if (url.match(domain)) {
            return true;
          }
        } else if (matchHostname(url, domain)) {
          return true;
        }
      }
      return false;
    }
  }

  return !!matchHostname(url, ALLOWED_DOMAINS);
};
