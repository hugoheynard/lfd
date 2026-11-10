import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { InvoicePdfFonts } from "../../ports/invoice-font-source.js";

/** Les vraies polices de la facture (`apps/lfd-api/fonts/`), lues une fois pour les specs. */
const FONTS_DIRECTORY = join(
  dirname(fileURLToPath(import.meta.url)),
  ...Array.from({ length: 6 }, () => ".."),
  "fonts",
);

export const TEST_FONTS: InvoicePdfFonts = {
  regular: readFileSync(join(FONTS_DIRECTORY, "SourceSans3-Regular.ttf")),
  bold: readFileSync(join(FONTS_DIRECTORY, "SourceSans3-Bold.ttf")),
};
