import { uncachedInternalCall } from "../uncached-internal-call.js";

describe("uncachedInternalCall", () => {
  it("ajoute Cache-Control: no-store et garde méthode et en-têtes", () => {
    const init = uncachedInternalCall({
      method: "PUT",
      headers: { "content-type": "application/json" },
    });
    const headers = new Headers(init.headers);
    expect(init.method).toBe("PUT");
    expect(headers.get("cache-control")).toBe("no-store");
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("remplace un Cache-Control déjà présent", () => {
    const init = uncachedInternalCall({ headers: { "Cache-Control": "max-age=60" } });
    expect(new Headers(init.headers).get("cache-control")).toBe("no-store");
  });
});
