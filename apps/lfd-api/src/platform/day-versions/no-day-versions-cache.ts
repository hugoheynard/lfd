import { type DayVersionsCard, DayVersionsCache } from "./day-versions-cache.js";

/**
 * **Sans objet des journées** : toujours un raté, rien de gardé. Relié quand
 * la configuration ne nomme aucun objet (`AppConfig.dayVersionsCacheUrl`) —
 * le dev local hors wrangler et les e2e, qui lisent donc chaque fois la base.
 */
export class NoDayVersionsCache extends DayVersionsCache {
  read(_serviceDay: string): Promise<DayVersionsCard | null> {
    return Promise.resolve(null);
  }

  store(_serviceDay: string, _card: DayVersionsCard): Promise<void> {
    return Promise.resolve();
  }
}
