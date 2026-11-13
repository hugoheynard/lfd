import type { PackedContent } from "./content-compression.js";
import { VersionedContentCache } from "./versioned-content-cache.js";

/**
 * **Sans objet des journées** : toujours un raté, rien de gardé — le dev local
 * hors wrangler et les e2e lisent donc chaque fois la base.
 */
export class NoVersionedContentCache extends VersionedContentCache {
  read(_key: string, _version: number): Promise<Uint8Array | null> {
    return Promise.resolve(null);
  }

  store(_key: string, _version: number, _content: PackedContent): Promise<void> {
    return Promise.resolve();
  }
}
