import { z } from "zod";

import { InvalidPayloadError, ZodParam } from "../zod-body.pipe.js";

const ULID_ONLY = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/u, "ULID attendu");

/**
 * Régression : un `.parse` de paramètre de chemin écrit dans la route levait un
 * `ZodError` nu, rendu en 500 `internal.unexpected` (fix 2026-10-22).
 */
describe("ZodParam", () => {
  it("rend la valeur validée", () => {
    const pipe = new ZodParam(ULID_ONLY, "batchId");

    expect(pipe.transform("01K6A0000000000000000000A1")).toBe("01K6A0000000000000000000A1");
  });

  it("refuse en erreur de domaine (400) qui nomme le paramètre, jamais un ZodError", () => {
    const pipe = new ZodParam(ULID_ONLY, "batchId");

    expect(() => pipe.transform("pas-un-ulid")).toThrow(InvalidPayloadError);
    expect(() => pipe.transform("pas-un-ulid")).toThrow("batchId : ULID attendu");
  });
});
