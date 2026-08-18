import type { OrderOrigin } from "@lfd/contracts";

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
