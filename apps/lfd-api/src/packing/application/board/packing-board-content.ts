import type { PackingBoardContent } from "../../domain/services/packing-board.js";

/** Le nom de l'écran dans l'objet des journées — le poste et la colonne de la Supervision. */
export const PACKING_SCREEN = "packing";

/**
 * Un contenu du poste se range toujours : aucune de ses lectures n'a de
 * repli dégradé (vérifié le 2026-11-13 — une panne d'un canal remonte en
 * erreur au lieu d'être rendue vide). Un repli ajouté un jour se signale
 * ici, par un champ du contenu, et rend ce prédicat faux pour lui.
 */
export function isStorablePackingBoard(_content: PackingBoardContent): boolean {
  return true;
}

/**
 * Reconnaît une charge relue de l'objet. Contrôle de FORME seulement : la
 * révision du code est dans la clé, la charge a donc été rangée par ce même
 * code ; une forme inattendue est relue en base.
 */
export function isPackingBoardContent(raw: unknown): raw is PackingBoardContent {
  if (typeof raw !== "object" || raw === null) {
    return false;
  }
  const closedAt: unknown = Reflect.get(raw, "closedAt");
  return (
    typeof Reflect.get(raw, "date") === "string" &&
    (closedAt === null || typeof closedAt === "string") &&
    Array.isArray(Reflect.get(raw, "sheets")) &&
    Array.isArray(Reflect.get(raw, "withdrawnSheets")) &&
    Array.isArray(Reflect.get(raw, "resources")) &&
    typeof Reflect.get(raw, "orderCount") === "number" &&
    !Reflect.has(raw, "relativeDay")
  );
}
