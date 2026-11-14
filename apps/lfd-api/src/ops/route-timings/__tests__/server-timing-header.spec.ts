import { parseServerTiming } from "../server-timing-header.js";

describe("parseServerTiming", () => {
  it("rend une liste vide sans en-tête", () => {
    expect(parseServerTiming(null)).toEqual([]);
    expect(parseServerTiming("")).toEqual([]);
  });

  it("lit les marques, leurs durées et leurs descriptions, dans l'ordre", () => {
    expect(parseServerTiming('app;dur=12.5, worker;dur=3;desc="hit", gateway;desc=edge')).toEqual([
      { name: "app", durationMs: 12.5, description: null },
      { name: "worker", durationMs: 3, description: "hit" },
      { name: "gateway", durationMs: null, description: "edge" },
    ]);
  });

  it("garde une virgule ou un point-virgule entre guillemets dans la description", () => {
    expect(parseServerTiming('db;desc="a, b; c";dur=1')).toEqual([
      { name: "db", durationMs: 1, description: "a, b; c" },
    ]);
  });

  it("ignore une marque sans nom valide et une durée illisible, sans lever", () => {
    expect(parseServerTiming('  , "x";dur=1, app;dur=abc, ok;dur=')).toEqual([
      { name: "app", durationMs: null, description: null },
      { name: "ok", durationMs: null, description: null },
    ]);
  });

  it("ne lit que la première durée quand une marque en porte deux", () => {
    expect(parseServerTiming("app;dur=4;dur=9;flag")).toEqual([
      { name: "app", durationMs: 4, description: null },
    ]);
  });
});
