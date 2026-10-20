import type { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Injectable } from "@nestjs/common";

import { BrandLogoUnavailableError } from "./brand-logo-unavailable.error.js";
import { BrandLogoSource } from "./brand-logo.source.js";

/** Le fichier, relatif au dossier de l'app. */
const LOGO_FILE = "assets/logo-la-folie-coffee-noir-et-blanc.png";

/**
 * Le dossier `apps/lfd-api/`, relu depuis CE fichier : trois niveaux
 * au-dessus de `src/platform/brand/` en test, comme de `dist/platform/brand/`
 * une fois compilé.
 *
 * 🔴 `assets/` n'est PAS dans `dist/` (`nest build` ne copie rien) : il est à
 * côté, dans le dossier de l'app que `pnpm deploy` emporte EN ENTIER (aucun
 * champ `files`, tenu par `lint:deployed-app-files`) et que `.dockerignore`
 * n'exclut pas (vérifié le 2026-10-09 pour l'ancien lecteur du bon de
 * commande, dont celui-ci reprend le calcul). Le jour où l'un des deux change,
 * le rendu échoue (`BrandLogoUnavailableError`) et le journal le dit.
 */
const APP_DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Lu une fois puis gardé en mémoire : environ 16 ko. */
@Injectable()
export class DiskBrandLogoSource extends BrandLogoSource {
  private loaded: Promise<Buffer> | null = null;

  load(): Promise<Buffer> {
    this.loaded ??= readLogo();
    // Un échec n'est pas gardé : le prochain rendu relit le disque.
    void this.loaded.catch(() => {
      this.loaded = null;
    });
    return this.loaded;
  }
}

async function readLogo(): Promise<Buffer> {
  try {
    return await readFile(join(APP_DIRECTORY, LOGO_FILE));
  } catch (cause: unknown) {
    throw new BrandLogoUnavailableError(LOGO_FILE, cause);
  }
}
