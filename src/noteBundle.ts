export interface BundledAttachment {
  path: string;
  dataBase64: string;
}

export interface DecryptedNoteBundle {
  title: string | null;
  content: string;
  attachments: BundledAttachment[];
}

export interface LocalImageTarget {
  source: "wiki" | "markdown";
  target: string;
}

interface SerializedNoteBundle {
  kind: "local-encryptor-note-bundle";
  version: 1;
  title: string;
  content: string;
  attachments: BundledAttachment[];
}

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"]);

function normalizeVaultPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

function dirname(path: string): string {
  const normalized = normalizeVaultPath(path);
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash >= 0 ? normalized.slice(0, lastSlash) : "";
}

function resolveRelativePath(baseDir: string, target: string): string {
  const cleaned = normalizeVaultPath(target);
  if (!cleaned.startsWith(".") && target.startsWith("/")) {
    return cleaned;
  }

  const parts = `${baseDir}/${cleaned}`.split("/");
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      resolved.pop();
      continue;
    }
    resolved.push(part);
  }
  return resolved.join("/");
}

function isLocalTarget(target: string): boolean {
  return !/^(?:https?:|data:|mailto:)/i.test(target);
}

export function isImagePath(path: string): boolean {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(extension);
}

function cleanWikiTarget(raw: string): string {
  return raw.split("|", 1)[0].split("#", 1)[0].trim();
}

function cleanMarkdownTarget(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
    return trimmed.slice(1, -1).trim();
  }

  const titleSeparator = trimmed.match(/\s+"/);
  return titleSeparator ? trimmed.slice(0, titleSeparator.index).trim() : trimmed;
}

export function extractLocalImageTargets(content: string): LocalImageTarget[] {
  const found = new Map<string, LocalImageTarget>();

  for (const match of content.matchAll(/!?\[\[([^\]]+)\]\]/g)) {
    const target = cleanWikiTarget(match[1] ?? "");
    if (!target || !isLocalTarget(target)) {
      continue;
    }

    found.set(`wiki:${target}`, { source: "wiki", target });
  }

  for (const match of content.matchAll(/!\[[^\]]*]\(([^)]+)\)/g)) {
    const target = cleanMarkdownTarget(match[1] ?? "");
    if (!target || !isLocalTarget(target)) {
      continue;
    }

    found.set(`markdown:${target}`, { source: "markdown", target });
  }

  return [...found.values()];
}

export function extractLocalImagePaths(notePath: string, content: string): string[] {
  const found = new Set<string>();
  const noteDir = dirname(notePath);

  for (const reference of extractLocalImageTargets(content)) {
    const resolved = resolveRelativePath(noteDir, reference.target);
    if (isImagePath(resolved)) {
      found.add(resolved);
    }
  }

  return [...found].sort((left, right) => left.localeCompare(right));
}

export function buildAttachmentLookupCandidates(
  notePath: string,
  rawTarget: string,
  metadataResolvedPath?: string | null
): string[] {
  const noteDir = dirname(notePath);
  const candidates = new Set<string>();
  const decoded = safeDecodeTarget(rawTarget);
  const normalized = normalizeVaultPath(decoded.replace(/^\/+/, ""));

  if (metadataResolvedPath) {
    candidates.add(normalizeVaultPath(metadataResolvedPath));
  }

  candidates.add(normalized);
  if (noteDir) {
    candidates.add(resolveRelativePath(noteDir, normalized));
  }

  return [...candidates];
}

export function buildNoteBundle(title: string, content: string, attachments: BundledAttachment[]): string {
  const payload: SerializedNoteBundle = {
    kind: "local-encryptor-note-bundle",
    version: 1,
    title,
    content,
    attachments
  };

  return JSON.stringify(payload);
}

export function sanitizeNoteBasename(title: string): string {
  const sanitized = title.replace(/[\\/:*?"<>|]/g, "_").trim();
  return sanitized || "Untitled";
}

function safeDecodeTarget(target: string): string {
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

export function parseDecryptedNoteBundle(value: string): DecryptedNoteBundle {
  try {
    const parsed = JSON.parse(value) as Partial<SerializedNoteBundle>;
    if (
      parsed.kind === "local-encryptor-note-bundle" &&
      parsed.version === 1 &&
      typeof parsed.title === "string" &&
      typeof parsed.content === "string" &&
      Array.isArray(parsed.attachments)
    ) {
      return {
        title: parsed.title,
        content: parsed.content,
        attachments: parsed.attachments.filter(
          (attachment): attachment is BundledAttachment =>
            typeof attachment?.path === "string" && typeof attachment?.dataBase64 === "string"
        )
      };
    }
  } catch {
    return {
      title: null,
      content: value,
      attachments: []
    };
  }

  return {
    title: null,
    content: value,
    attachments: []
  };
}
