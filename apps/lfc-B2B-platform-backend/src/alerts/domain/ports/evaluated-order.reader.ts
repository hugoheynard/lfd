import type { EvaluatedLine } from "../detectors/context.js";

/** La commande à évaluer, réduite à ce que les alertes regardent. */
export interface EvaluatedOrder {
  readonly id: string;
  readonly orderNumber: string;
  /** `null` pour une commande zéro friction — elle ne produit aucune alerte. */
  readonly companyId: string | null;
  /** Raison sociale, lue avec la commande : la cloche et l'e-mail la nomment. */
  readonly companyName: string;
  /**
   * La société est-elle **active** ? Lu ici plutôt que déduit ailleurs : un
   * dossier en attente, suspendu ou résilié n'a pas d'habitudes à comparer, et
   * personne pour agir sur l'alerte.
   */
  readonly companyActive: boolean;
  readonly lines: readonly EvaluatedLine[];
}

/** La commande évaluée. `null` si elle a disparu entre l'événement et la lecture. */
export abstract class EvaluatedOrderReader {
  abstract read(orderId: string): Promise<EvaluatedOrder | null>;
}
