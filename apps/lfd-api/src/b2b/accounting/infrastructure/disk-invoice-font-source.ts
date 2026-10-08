import type { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Injectable } from "@nestjs/common";

import { InvoiceFontsUnavailableError } from "../domain/errors/invoice-document-errors.js";
import { InvoiceFontSource, type InvoicePdfFonts } from "../domain/ports/invoice-font-source.js";

/**
 * Le dossier `apps/lfd-api/fonts/`, relu depuis CE fichier : quatre niveaux
 * au-dessus de `src/b2b/accounting/infrastructure/` en test, comme de
 * `dist/b2b/accounting/infrastructure/` une fois compilé (`dist/` reflète
 * `src/`, vérifié le 2026-10-08).
 *
 * 🔴 Le dossier n'est PAS dans `dist/` (`nest build` ne copie rien) : il est
 * à côté, dans le dossier de l'app que `pnpm deploy` emporte EN ENTIER
 * (aucun champ `files`, tenu par `lint:deployed-app-files`) et que
 * `.dockerignore` n'exclut pas. Le jour où l'un des deux change, le rendu
 * échoue (`InvoiceFontsUnavailableError`) et le journal le dit.
 */
const FONTS_DIRECTORY = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "fonts",
);

const REGULAR_FILE = "SourceSans3-Regular.ttf";
const BOLD_FILE = "SourceSans3-Bold.ttf";

/**
 * Source Sans 3 (Adobe, licence SIL OFL 1.1 — `fonts/OFL-LICENSE.md`), lue
 * une fois puis gardée en mémoire : deux fichiers d'environ 430 ko.
 */
@Injectable()
export class DiskInvoiceFontSource extends InvoiceFontSource {
  private loaded: Promise<InvoicePdfFonts> | null = null;

  load(): Promise<InvoicePdfFonts> {
    this.loaded ??= Promise.all([read(REGULAR_FILE), read(BOLD_FILE)]).then(([regular, bold]) => ({
      regular,
      bold,
    }));
    // Un échec n'est pas gardé : le prochain rendu relit le disque.
    void this.loaded.catch(() => {
      this.loaded = null;
    });
    return this.loaded;
  }
}

async function read(file: string): Promise<Buffer> {
  const path = join(FONTS_DIRECTORY, file);
  try {
    return await readFile(path);
  } catch (cause: unknown) {
    throw new InvoiceFontsUnavailableError(`fonts/${file}`, cause);
  }
}
