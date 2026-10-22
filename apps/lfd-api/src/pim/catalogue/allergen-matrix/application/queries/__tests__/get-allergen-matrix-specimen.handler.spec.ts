import type { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";

import { pdfPages } from "../../../../../../platform/pdf/__tests__/pdf-text.js";
import { BrandLogoSource } from "../../../../../../platform/brand/brand-logo.source.js";
import { FixedClock } from "../../../../../../platform/time/fixed-clock.js";
import { GetAllergenMatrixSpecimenHandler } from "../get-allergen-matrix-specimen.handler.js";

const LOGO = readFileSync(
  new URL("../../../../../../../assets/logo-la-folie-coffee-noir-et-blanc.png", import.meta.url),
);

/** Le logo de la marque, servi par un double du port. */
class FixedBrandLogo extends BrandLogoSource {
  load(): Promise<Buffer> {
    return Promise.resolve(LOGO);
  }
}

describe("GetAllergenMatrixSpecimenHandler", () => {
  it("rend la matrice d'exemple en PDF, chaque produit marqué EXEMPLE", async () => {
    const handler = new GetAllergenMatrixSpecimenHandler(
      new FixedBrandLogo(),
      new FixedClock(new Date()),
    );

    const pdf = await handler.execute();
    const text = pdfPages(pdf.bytes).join(" ").replace(/\s+/gu, " ");

    expect(pdf.bytes.toString("latin1").startsWith("%PDF-")).toBe(true);
    expect(pdf.fileName).toBe("exemple-matrice-allergenes.pdf");
    expect(text).toContain("EXEMPLE");
    expect(text).toContain("Sarrasin (BWD)");
    expect(text).toContain("Non renseigné");
  });
});
