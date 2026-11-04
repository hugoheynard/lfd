import type { OrderOrigin } from "@lfd/contracts";

import type { OrderEntryOrigin, OrderEntryShortcut } from "../value-objects/order-supply.js";

/** Les deux colonnes qui suffisent à dire d'où vient une commande. */
export interface OrderProvenance {
  /** Le membre de l'équipe qui l'a saisie, ou `null`. */
  readonly placedByStaffId: string | null;
  /** L'abonnement qui l'a produite, ou `null`. */
  readonly fromSubscriptionId: string | null;
}

/**
 * Par quelle **porte** une commande est entrée.
 *
 * Une dérivation et non une colonne : stocker `origin` en base en ferait un
 * troisième endroit où l'information vit, donc un troisième endroit où elle peut
 * se désaccorder des deux autres. La règle est ici, pure et testée, et les vues
 * de lecture l'appellent.
 *
 * **La saisie humaine l'emporte** quand les deux marques coexistent : si un
 * commercial a repris la main sur une échéance récurrente, ce qui compte pour
 * qui lit la ligne est qu'une personne est intervenue. Le cas n'existe pas
 * encore — le planificateur d'abonnements ne passe pas par le back-office —
 * mais l'ordre doit être décidé avant de l'être par accident.
 */
export function orderOriginOf(provenance: OrderProvenance): OrderOrigin {
  if (provenance.placedByStaffId !== null) {
    return "back_office";
  }
  if (provenance.fromSubscriptionId !== null) {
    return "recurring";
  }
  return "self_service";
}

/** Les deux marques d'entrée qui suffisent à dire d'où vient une saisie. */
export interface OrderEntryMarks {
  readonly entryOrigin: OrderEntryOrigin | null;
  readonly entryShortcut: OrderEntryShortcut | null;
}

/**
 * **D'où vient une saisie de l'équipe**, telle que le back-office la lit
 * (Hugo, 2026-11-04). L'origine gardée d'abord ; à défaut, un « Retrait
 * immédiat » se lit `counter` — le raccourci n'existe qu'au comptoir, et les
 * commandes d'avant la colonne ne sont pas réécrites. Sinon `null` : on ne
 * sait pas, et l'écran garde ce qu'il disait.
 */
export function orderEntryOriginOf(marks: OrderEntryMarks): OrderEntryOrigin | null {
  if (marks.entryOrigin !== null) {
    return marks.entryOrigin;
  }
  return marks.entryShortcut === "immediate_pickup" ? "counter" : null;
}
