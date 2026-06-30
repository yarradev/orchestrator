import { describe, it } from "vitest";

describe.skip("live smoke: board adaptor (P4+P5)", () => {
  it("lists ready cards from a real board", async () => {
    // Token-gated — requires YD_BOARD_TOKEN + YD_BOARD_API + YD_BOARD_NAME env vars.
    // Unskip and set env vars to smoke-test against acme:main.
    // import { BoardClient } from "@yarrasys/board-client";
    // import { BoardAdaptor } from "../src/board-adaptor.js";
    // const client = new BoardClient({
    //   apiBase: process.env.YD_BOARD_API!,
    //   token: process.env.YD_BOARD_TOKEN!,
    //   boardName: process.env.YD_BOARD_NAME ?? "acme:main",
    // });
    // const adaptor = new BoardAdaptor(client);
    // const refs = await adaptor.listReady({ excludeOverlays: ["escalated"] });
    // expect(Array.isArray(refs)).toBe(true);
  });
});
