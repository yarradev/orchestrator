import type { BoardBackend } from "@yarradev/core";
import { decide, reduceVerdict } from "@yarradev/core";
import { selectBackend } from "./backend-factory.js";
import { loadConfigs, type Configs } from "./config-io.js";

export interface Io { out: (s: string) => void; err: (s: string) => void; }
export interface CliDeps {
  mkBackend?: (env: Record<string, string | undefined>) => BoardBackend;
  loadConfigs?: (env: Record<string, string | undefined>) => Configs;
}

const cardType = (t: string | undefined): "story" | "epic" => (t === "epic" ? "epic" : "story");
const json = (v: unknown) => JSON.stringify(v, null, 2);

export async function run(argv: string[], env: Record<string, string | undefined>, io: Io, deps: CliDeps = {}): Promise<number> {
  const mkBackend = deps.mkBackend ?? selectBackend;
  const getConfigs = deps.loadConfigs ?? loadConfigs;
  const [cmd, ...rest] = argv;
  try {
    switch (cmd) {
      case "list-ready": {
        const refs = await mkBackend(env).listReady({ excludeOverlays: ["escalated"] });
        io.out(json(refs));
        return 0;
      }
      case "read-card": {
        const [id, stage, type] = rest;
        if (!id || !stage) { io.err("usage: yarradev read-card <id> <stage> [story|epic]"); return 2; }
        io.out(json(await mkBackend(env).readCard({ id, stage, type: cardType(type) })));
        return 0;
      }
      case "decide": {
        const [id, stage, type] = rest;
        if (!id || !stage) { io.err("usage: yarradev decide <id> <stage> [story|epic]"); return 2; }
        const { lc, policy } = getConfigs(env);
        const card = await mkBackend(env).readCard({ id, stage, type: cardType(type) });
        io.out(json(decide(card, lc, Date.now(), policy)));
        return 0;
      }
      case "reduce": {
        const [id, stage, verdictJson, type] = rest;
        if (!id || !stage || !verdictJson) { io.err("usage: yarradev reduce <id> <stage> <verdictJson> [story|epic]"); return 2; }
        const { lc } = getConfigs(env);
        const card = await mkBackend(env).readCard({ id, stage, type: cardType(type) });
        io.out(json(reduceVerdict(card, JSON.parse(verdictJson), lc)));
        return 0;
      }
      default:
        io.err("usage: yarradev <list-ready|read-card|decide|reduce|run-pass> [args]");
        return 2;
    }
  } catch (e) {
    io.err(`error: ${(e as Error).message}`);
    return 1;
  }
}
