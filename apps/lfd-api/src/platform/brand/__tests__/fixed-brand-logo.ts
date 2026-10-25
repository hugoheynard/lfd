import { readFileSync } from "node:fs";
import type { Buffer } from "node:buffer";

import { BrandLogoSource } from "../brand-logo.source.js";

/** Le vrai logo imprimable du dépôt, lu sans passer par l'adaptateur disque. */
export const BRAND_LOGO: Buffer = readFileSync(
  new URL("../../../../assets/logo-la-folie-coffee-noir-et-blanc.png", import.meta.url),
);

/**
 * `BrandLogoSource` doublé, pour tout bloc qui imprime (2026-10-25) : le
 * fournil garde le sien (`paper-doubles.ts`), les étiquettes du colisage et
 * de la livraison ne peuvent pas l'importer.
 */
export class FixedBrandLogo extends BrandLogoSource {
  load(): Promise<Buffer> {
    return Promise.resolve(BRAND_LOGO);
  }
}
