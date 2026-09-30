/**
 * Combien de temps une trace du journal de la livraison reste utile : sept
 * jours, comme les journaux du fournil et du commerce. Seule la plus récente
 * d'une journée compte (`plan-version-par-journee.md`, D2).
 */
export const DELIVERY_DAY_CHANGE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * **Balayer le journal des journées de la livraison** — le seul geste de code
 * qui y écrive : ses lignes naissent des déclencheurs de la base
 * (`plan-schema-delivery.md`, SD-D3). Le fournil n'y touche jamais.
 */
export abstract class DeliveryDayChangePruner {
  /** Retire les traces écrites avant cet instant ; rend combien. */
  abstract pruneBefore(instant: Date): Promise<number>;
}
