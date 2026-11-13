import type { PackedContent } from "./content-compression.js";
import { type DayContentAddress, DayContentsCache } from "./day-contents-cache.js";

/**
 * **Sans objet des journées** : toujours un raté, rien de gardé — le dev local
 * hors wrangler et les e2e lisent donc chaque fois la base.
 */
export class NoDayContentsCache extends DayContentsCache {
  read(_address: DayContentAddress): Promise<Uint8Array | null> {
    return Promise.resolve(null);
  }

  store(_address: DayContentAddress, _content: PackedContent): Promise<void> {
    return Promise.resolve();
  }
}
