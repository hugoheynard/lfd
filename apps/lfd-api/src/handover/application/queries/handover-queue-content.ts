import type { HandoverQueueView } from "@lfd/contracts";

import type { HandoverQueueScope } from "./get-handover-queue.query.js";

/**
 * Le nom de l'écran dans l'objet des journées, un par périmètre : la file du
 * comptoir et celle de la Supervision ne rendent pas les mêmes octets (le
 * comptoir n'a ni livraison ni tournée).
 */
export const HANDOVER_QUEUE_SCREENS: Readonly<Record<HandoverQueueScope, string>> = {
  counter: "handover-counter",
  whole_day: "handover-day",
};

/**
 * Une file se range toujours : aucune de ses lectures n'a de repli dégradé
 * (vérifié le 2026-11-13 — file, attestations, retenues, transferts et
 * tournées remontent une panne en erreur au lieu de la rendre vide). Un
 * repli ajouté un jour se signale par un champ de la vue, et rend ce
 * prédicat faux pour lui.
 */
export function isStorableHandoverQueue(_content: HandoverQueueView): boolean {
  return true;
}

/**
 * Reconnaît une charge relue de l'objet. Contrôle de FORME seulement : la
 * révision du code est dans la clé, la charge a donc été rangée par ce même
 * code ; une forme inattendue est relue en base.
 */
export function isHandoverQueueContent(raw: unknown): raw is HandoverQueueView {
  if (typeof raw !== "object" || raw === null) {
    return false;
  }
  const resupply: unknown = Reflect.get(raw, "resupplyTransfers");
  return (
    typeof Reflect.get(raw, "day") === "string" &&
    Array.isArray(Reflect.get(raw, "entries")) &&
    (resupply === undefined || Array.isArray(resupply))
  );
}
