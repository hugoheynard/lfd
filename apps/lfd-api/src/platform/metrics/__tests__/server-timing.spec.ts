import {
  formatServerTiming,
  recordServerTiming,
  serverTiming,
  type TimedRequest,
} from "../server-timing.js";

describe("serverTiming", () => {
  it("pose les étapes du guard puis le temps de Nest au moment d'écrire l'en-tête", () => {
    const headers = new Map<string, string>();
    const written: unknown[][] = [];
    const response = {
      setHeader: (name: string, value: string) => headers.set(name, value),
      writeHead: (...args: never[]) => written.push(args),
    };
    const request: TimedRequest = {};
    let nextCalled = false;
    serverTiming(request, response, () => {
      nextCalled = true;
    });
    recordServerTiming(request, "principal", performance.now());
    (response.writeHead as (...args: unknown[]) => unknown)(200);

    expect(nextCalled).toBe(true);
    expect(written).toEqual([[200]]);
    expect(headers.get("Server-Timing")).toMatch(/^principal;dur=\d+\.\d, app;dur=\d+\.\d$/);
  });

  it("n'ajoute rien à une requête qui n'est pas chronométrée", () => {
    const request: TimedRequest = {};
    recordServerTiming(request, "auth", 0);
    expect(request.serverTiming).toBeUndefined();
  });

  it("écrit chaque durée avec une décimale", () => {
    expect(formatServerTiming([{ name: "auth", durationMs: 3.14159 }])).toBe("auth;dur=3.1");
  });
});
