import { Injectable } from "@nestjs/common";
import { zipSync, type Zippable } from "fflate";

import { StoredZipWriter, type ZipEntry } from "../domain/ports/stored-zip-writer.js";

/** `level: 0` : fflate range alors l'entrée en méthode 0 (STORE), sans compression. */
const STORE = 0;

/**
 * Le zip par `fflate` (pur JavaScript, sans dépendance native ; déjà tiré
 * par pdfkit). L'heure de chaque entrée est le jour de la pièce : le même
 * zip ressort octet pour octet d'un téléchargement à l'autre.
 */
@Injectable()
export class FflateStoredZipWriter extends StoredZipWriter {
  write(entries: readonly ZipEntry[]): Uint8Array {
    const files: Zippable = {};
    for (const entry of entries) {
      files[entry.name] = [entry.bytes, { level: STORE, mtime: `${entry.modifiedOn}T12:00:00Z` }];
    }
    return zipSync(files);
  }
}
