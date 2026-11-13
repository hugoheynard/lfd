import { INTERNAL_NO_STORE, withNoStore } from "../no-store.js";

describe("withNoStore", () => {
  it("pose no-store sur un « absent » (404), statut et en-têtes gardés", () => {
    const absent = withNoStore(new Response(null, { status: 404, headers: { "X-Absent": "1" } }));
    expect(absent.status).toBe(404);
    expect(absent.headers.get("X-Absent")).toBe("1");
    expect(absent.headers.get("Cache-Control")).toBe(INTERNAL_NO_STORE);
  });

  it("remplace un Cache-Control présent et garde le corps", async () => {
    const kept = withNoStore(new Response("corps", { headers: { "Cache-Control": "public" } }));
    expect(kept.headers.get("Cache-Control")).toBe("no-store, private");
    expect(await kept.text()).toBe("corps");
  });
});
