/** Une commande du plan arrêté, réduite à ce qui décide du colisable. */
export interface LegacyPackingOrder {
  readonly orderId: string;
  readonly reference: string;
  /** `HH:mm`, ou `null` — même valeur que celle publiée dans la liste à coliser. */
  readonly dueAt: string | null;
  readonly lines: readonly { readonly sku: string; readonly quantity: number }[];
}

/** Ce que l'ANCIEN chemin sait d'une journée : son plan, et ce qui est sorti du four. */
export interface LegacyPackingDay {
  readonly serviceDay: string;
  /** Vide pour une journée jamais arrêtée. */
  readonly orders: readonly LegacyPackingOrder[];
  /** Sorti du four par SKU, coches héritées comprises — les SKU à zéro absents. */
  readonly produced: readonly { readonly sku: string; readonly quantity: number }[];
}

/**
 * **Le colisage tel que le fournil le tient**, pour une journée — lu par la
 * route de contrôle de l'ombre (plan `colisage/plan-domaine-colisage.md`, K1),
 * et par elle seule.
 *
 * Port PUBLIÉ : la production le déclare ET l'implémente, le colisage le lit —
 * la figure de `QualityHoldsReader`. Il n'existe que le temps de la
 * répétition : K2 fera du colisage le seul tenant, et cette lecture n'aura
 * plus rien à comparer.
 *
 * ⚠️ Aucune décision du colisage ne s'appuie dessus. Une ombre qui tirerait le
 * fournil pour décider referait exactement le couplage que le §9 a refusé.
 */
export abstract class LegacyPackingReader {
  abstract dayOf(serviceDay: string): Promise<LegacyPackingDay>;
}
