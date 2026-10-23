import type { LegalEntityRecord } from "../domain/ports/legal-entity.reader.js";
import type { CollectionCalendarSettings } from "../domain/services/collection-calendar.js";

/** Les réglages du calendrier de prélèvement d'une entité — des nombres, pas l'agrégat. */
export function collectionSettingsOf(entity: LegalEntityRecord): CollectionCalendarSettings {
  return {
    preNotificationDays: entity.preNotificationDays,
    collectionDaysAfterClosure: entity.collectionDaysAfterClosure,
    autoCollectionDelayHours: entity.autoCollectionDelayHours,
    depositCutoff: entity.depositCutoff,
  };
}
