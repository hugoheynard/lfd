/**
 * **Lire la version d'une journée** dans le journal de la livraison
 * (`documentation/livraisons/plan-schema-delivery.md`, SD-D3).
 *
 * Le pendant de `ProductionDayVersionReader`, dans son propre bloc : depuis le
 * 2026-09-30, une tournée n'avance plus la version du fournil. Un port à part
 * du balayage (ISP) : l'écran qui veille ne purge rien.
 */
export abstract class DeliveryDayVersionReader {
  /**
   * Le plus grand identifiant du journal pour cette journée, `0` si aucun.
   * Opaque : il se compare par égalité, il ne compte rien.
   */
  abstract versionOf(serviceDay: string): Promise<number>;
}
