import type { ProductionWorksheetView } from "@lfd/contracts";

import { relativeDayOf } from "../../domain/services/relative-day.js";

/** Le nom de l'écran dans l'objet des journées — la fiche datée et la Préparation. */
export const WORKSHEET_SCREEN = "worksheet";

/**
 * **Ce que l'objet garde de la fiche d'une journée** : la vue sans ce qui
 * dépend de l'heure, et si elle est complète. Une fiche incomplète (rayons,
 * paliers ou attente du four en panne) est servie, jamais rangée — sans quoi
 * la panne d'un instant resterait servie jusqu'au prochain numéro.
 */
export interface WorksheetContent {
  readonly sheet: Omit<ProductionWorksheetView, "relativeDay">;
  readonly complete: boolean;
}

/** Un contenu se range s'il est complet. */
export function isStorableWorksheet(content: WorksheetContent): boolean {
  return content.complete;
}

/**
 * Reconnaît une charge relue de l'objet. Contrôle de FORME seulement : la
 * révision du code est dans la clé, la charge a donc été rangée par
 * {@link WorksheetContent} lui-même ; une forme inattendue est relue en base.
 */
export function isWorksheetContent(raw: unknown): raw is WorksheetContent {
  if (typeof raw !== "object" || raw === null) {
    return false;
  }
  const sheet: unknown = Reflect.get(raw, "sheet");
  return (
    typeof Reflect.get(raw, "complete") === "boolean" &&
    typeof sheet === "object" &&
    sheet !== null &&
    typeof Reflect.get(sheet, "date") === "string" &&
    Array.isArray(Reflect.get(sheet, "lines")) &&
    Array.isArray(Reflect.get(sheet, "groups")) &&
    typeof Reflect.get(sheet, "shelvesKnown") === "boolean"
  );
}

/** La fiche servie : le contenu, plus ce qui se recalcule à chaque réponse. */
export function servedWorksheet(content: WorksheetContent, now: Date): ProductionWorksheetView {
  return { ...content.sheet, relativeDay: relativeDayOf(content.sheet.date, now) };
}
