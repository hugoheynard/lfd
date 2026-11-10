import { createHmac } from "node:crypto";

import {
  VITRINE_SIGNATURE_TOLERANCE_SECONDS,
  signVitrineBody,
  verifyVitrineSignature,
} from "../vitrine-signature.js";

const SECRET = "vtrsec_TEST";
const BODY = '{"subscriber":"s","sequence":1}';
const NOW = 1_000_000;

describe("la signature d'une notification", () => {
  it("est le HMAC-SHA256 de « t.corps », à la manière de Stripe", () => {
    const expected = createHmac("sha256", SECRET)
      .update(`${String(NOW)}.${BODY}`)
      .digest("hex");
    expect(signVitrineBody(SECRET, BODY, NOW)).toBe(`t=${String(NOW)},v1=${expected}`);
  });

  it("se vérifie avec le bon secret, sur le corps exact", () => {
    const header = signVitrineBody(SECRET, BODY, NOW);
    expect(verifyVitrineSignature({ secret: SECRET, header, body: BODY, nowSeconds: NOW })).toBe(
      "ok",
    );
    expect(verifyVitrineSignature({ secret: "autre", header, body: BODY, nowSeconds: NOW })).toBe(
      "invalid",
    );
    expect(
      verifyVitrineSignature({ secret: SECRET, header, body: `${BODY} `, nowSeconds: NOW }),
    ).toBe("invalid");
  });

  it("un rejeu hors de la fenêtre est refusé, et l'horodatage ne se falsifie pas", () => {
    const header = signVitrineBody(SECRET, BODY, NOW);
    const later = NOW + VITRINE_SIGNATURE_TOLERANCE_SECONDS + 1;
    expect(verifyVitrineSignature({ secret: SECRET, header, body: BODY, nowSeconds: later })).toBe(
      "stale",
    );
    const forged = header.replace(`t=${String(NOW)}`, `t=${String(later)}`);
    expect(
      verifyVitrineSignature({ secret: SECRET, header: forged, body: BODY, nowSeconds: later }),
    ).toBe("invalid");
  });

  it("un en-tête absent ou mal formé est « missing »", () => {
    for (const header of [undefined, "", "v1=abc", "t=12"]) {
      expect(verifyVitrineSignature({ secret: SECRET, header, body: BODY, nowSeconds: NOW })).toBe(
        "missing",
      );
    }
  });
});
