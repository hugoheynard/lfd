import { withServerTiming } from "../server-timing.js";

describe("withServerTiming", () => {
  it("ajoute son étape après celles du saut suivant, sans toucher au reste", async () => {
    const inner = new Response("corps", {
      status: 201,
      headers: { "Server-Timing": "app;dur=4.0", "X-A": "1" },
    });
    const timed = withServerTiming(inner, "worker", 12.345);
    expect(timed.status).toBe(201);
    expect(timed.headers.get("X-A")).toBe("1");
    expect(timed.headers.get("Server-Timing")).toBe("app;dur=4.0, worker;dur=12.3");
    expect(await timed.text()).toBe("corps");
  });
});
