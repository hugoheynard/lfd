import { FetchRouteTimingTransport } from "../fetch-route-timing.transport.js";

describe("FetchRouteTimingTransport", () => {
  it("rend le statut et les deux en-têtes de mesure, et passe les en-têtes donnés", async () => {
    const seen: { url: string; header: string | null }[] = [];
    const transport = new FetchRouteTimingTransport((url, init) => {
      seen.push({ url, header: new Headers(init?.headers).get("x-lfd-diagnostic") });
      return Promise.resolve(
        new Response("corps", {
          status: 200,
          headers: { "server-timing": "app;dur=3", "x-shelf-cache": "miss" },
        }),
      );
    });

    const outcome = await transport.get("https://g.test/health", { "x-lfd-diagnostic": "s" }, 100);

    expect(outcome).toEqual({
      kind: "response",
      status: 200,
      serverTiming: "app;dur=3",
      shelfCache: "miss",
    });
    expect(seen).toEqual([{ url: "https://g.test/health", header: "s" }]);
  });

  it("dit `timeout` quand le délai est dépassé", async () => {
    const transport = new FetchRouteTimingTransport(() =>
      Promise.reject(new DOMException("trop long", "TimeoutError")),
    );

    expect(await transport.get("https://g.test/health", {}, 1)).toEqual({ kind: "timeout" });
  });

  it("dit `unreachable` sur toute autre panne, sans lever", async () => {
    const transport = new FetchRouteTimingTransport(() =>
      Promise.reject(new TypeError("fetch failed")),
    );

    expect(await transport.get("https://g.test/health", {}, 1)).toEqual({ kind: "unreachable" });
  });
});
