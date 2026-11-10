import type { Response } from "express";

import {
  cachePublicSettings,
  PUBLIC_SETTINGS_CACHE_CONTROL,
  PUBLIC_SETTINGS_CACHE_TAG,
} from "../public-settings-cache-headers.js";

/** Ce que les quatre routes des réglages publics posent. */
describe("les en-têtes des réglages publics", () => {
  it("public, 30 s, puis 60 s périmé servi pendant la revalidation", () => {
    expect(PUBLIC_SETTINGS_CACHE_CONTROL).toBe("public, max-age=30, stale-while-revalidate=60");
  });

  it("pose le Cache-Control et l'étiquette que la purge nomme", () => {
    const headers = new Map<string, string>();
    const response = {
      setHeader(name: string, value: string): Response {
        headers.set(name, value);
        return response;
      },
    } satisfies Pick<Response, "setHeader"> as Response;

    cachePublicSettings(response);

    expect(Object.fromEntries(headers)).toEqual({
      "Cache-Control": PUBLIC_SETTINGS_CACHE_CONTROL,
      "Cache-Tag": "reglages-publics",
    });
    expect(PUBLIC_SETTINGS_CACHE_TAG).toBe("reglages-publics");
  });
});
