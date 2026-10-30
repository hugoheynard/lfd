/**
 * **Un écart du mode ombre** (§ 13.5) : l'ancien chemin a servi un montant,
 * le nouveau en aurait servi un autre. Sans donnée personnelle — SKU, ids de
 * règles ou de promotions, deux montants.
 */
export type PromotionShadowDivergence =
  | {
      readonly point: "line";
      readonly sku: string;
      readonly quantity: number;
      /** Le prix unitaire servi (ancien chemin), en millicentimes. */
      readonly servedMillicents: number;
      /** Celui que les promotions auraient servi. */
      readonly shadowMillicents: number;
      /** La règle ou la promotion de l'étage `promotion`, de chaque côté. */
      readonly servedRuleId: string | null;
      readonly shadowRuleId: string | null;
    }
  | {
      readonly point: "basket";
      readonly pickupId: string;
      /** La remise servie (ancien chemin), en centimes. */
      readonly servedCents: number;
      readonly shadowCents: number;
      /** La promotion panier retenue par le nouveau chemin. */
      readonly shadowPromotionId: string | null;
    }
  | {
      /** Le nouveau chemin a échoué là où l'ancien a servi : le prix servi tient. */
      readonly point: "failure";
      readonly code: string;
      readonly message: string;
    };

/**
 * **Le journal du mode ombre.** Un port, pour que la règle « tout écart est
 * consigné » s'éprouve sans lire de log ; l'adaptateur écrit un log
 * structuré nommé `promotions.shadow_divergence`.
 */
export abstract class PromotionShadowJournal {
  abstract divergence(entry: PromotionShadowDivergence): void;
}
