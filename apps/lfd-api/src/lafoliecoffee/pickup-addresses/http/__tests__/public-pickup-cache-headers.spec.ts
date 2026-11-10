import type { Response } from "express";

import {
  cachePublicPickups,
  PUBLIC_PICKUPS_CACHE_CONTROL,
} from "../public-pickup-cache-headers.js";

/** Ce que `GET /pickup-addresses` pose (2026-11-05). */
describe("les en-têtes de la liste publique des points", () => {
  it("public, 30 s, SANS stale-while-revalidate (Hugo : une remise à horaires finie s'efface en 30 s)", () => {
    expect(PUBLIC_PICKUPS_CACHE_CONTROL).toBe("public, max-age=30");
  });

  it("pose le Cache-Control et l'étiquette que la purge des réglages publics nomme", () => {
    const headers = new Map<string, string>();
    const response = {
      setHeader(name: string, value: string): Response {
        headers.set(name, value);
        return response;
      },
    } satisfies Pick<Response, "setHeader"> as Response;

    cachePublicPickups(response);

    expect(Object.fromEntries(headers)).toEqual({
      "Cache-Control": "public, max-age=30",
      "Cache-Tag": "reglages-publics",
    });
  });
});
