import type { Verdict } from "./types.js";

const STATUSES = new Set(["advance", "reject", "submitted", "question", "error", "veto", "hold", "advice", "clean"]);

// Extract the LAST fenced ```json block (tolerant of agent preamble/postamble + multiple blocks).
function extractJsonBlock(text: string): string | null {
  const re = /```json\s*([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  let last: string | null = null;
  while ((m = re.exec(text)) !== null) last = m[1]!.trim();
  return last;
}

const err = (reason: string): Verdict => ({ status: "error", reason });

export function parseVerdict(text: string): Verdict {
  const block = extractJsonBlock(text);
  if (!block) return err("no fenced ```json verdict block found");
  let raw: unknown;
  try { raw = JSON.parse(block); } catch (e) { return err(`verdict JSON parse failed: ${(e as Error).message}`); }
  if (raw == null || typeof raw !== "object") return err("verdict is not an object");
  const o = raw as Record<string, unknown>;
  const status = o.status;
  if (typeof status !== "string" || !STATUSES.has(status)) return err(`unknown verdict status: ${String(status)}`);
  const reason = typeof o.reason === "string" ? { reason: o.reason } : {};
  switch (status) {
    case "advance":
    case "reject":
      return { status, ...(typeof o.to === "string" ? { to: o.to } : {}), ...reason };
    case "submitted": {
      const ev = o.evidence as Record<string, unknown> | undefined;
      if (!ev || typeof ev.repo !== "string" || typeof ev.head !== "string" || typeof ev.pr_number !== "number")
        return err("submitted verdict missing evidence{repo,pr_number,head}");
      return { status, evidence: { repo: ev.repo, prNumber: ev.pr_number, head: ev.head }, ...reason };
    }
    case "question":
      if (typeof o.category !== "string") return err("question verdict missing category");
      return { status, category: o.category, ...reason };
    case "error":
      return { status, ...reason };
    case "veto":
    case "hold":
    case "advice":
    case "clean":
      if (typeof o.role !== "string" || typeof o.head !== "string") return err(`${status} verdict missing role/head`);
      return { status, role: o.role, head: o.head, ...reason };
    default:
      return err("unreachable");
  }
}
