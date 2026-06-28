import type { Lease, Overlay } from "@yarradev/core";

export const stageLabel = (stage: string): string => `stage:${stage}`;
export const parseStage = (labels: string[]): string | null => {
  const l = labels.find((x) => x.startsWith("stage:"));
  return l ? l.slice("stage:".length) : null;
};

export const typeLabel = (type: "story" | "epic"): string => `type:${type}`;
export const parseType = (labels: string[]): "story" | "epic" =>
  labels.includes("type:epic") ? "epic" : "story";

export const OVERLAY_LABELS: Record<Overlay, string> = {
  "agent-running": "yd:agent-running",
  blocked: "yd:blocked",
  "veto-held": "yd:veto-held",
  "hold-open": "yd:hold-open",
  escalated: "yd:escalated",
};
const LABEL_TO_OVERLAY = new Map(Object.entries(OVERLAY_LABELS).map(([o, l]) => [l, o as Overlay]));
export const parseOverlays = (labels: string[]): Overlay[] =>
  labels.flatMap((l) => (LABEL_TO_OVERLAY.has(l) ? [LABEL_TO_OVERLAY.get(l)!] : []));

export const idMarker = (id: string): string => `<!--yd:id=${id}-->`;
const ID_RE = /<!--yd:id=([^>]+)-->/;
export const parseId = (body: string): string | null => body.match(ID_RE)?.[1] ?? null;

const LEASE_RE = /\n?<!--yd:lease=[^>]*-->/g;
const LEASE_ONE = /<!--yd:lease=([^>]*)-->/;
export const parseLease = (body: string): Lease | null => {
  const m = body.match(LEASE_ONE);
  if (!m || !m[1]) return null;
  try { return JSON.parse(decodeURIComponent(m[1])) as Lease; } catch { return null; }
};
export const setLease = (body: string, lease: Lease | null): string => {
  const stripped = body.replace(LEASE_RE, "");
  if (!lease) return stripped;
  return `${stripped}\n<!--yd:lease=${encodeURIComponent(JSON.stringify(lease))}-->`;
};

export const noteMarker = (key: string): string => `<!--yd:note=${key}-->`;
export const hasNote = (commentBodies: string[], key: string): boolean =>
  commentBodies.some((b) => b.includes(noteMarker(key)));
