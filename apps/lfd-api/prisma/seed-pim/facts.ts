import type { OutboxRelay } from "../../src/platform/outbox/outbox-relay.js";

/**
 * **Les faits du catalogue, livrés** — la dernière phase du seed.
 *
 * Le rejeu passe par les vrais handlers, qui émettent les faits du catalogue
 * dans la boîte d'envoi. Le seed ne se ferme qu'une fois la boîte vide : sans
 * ce balayage, le harnais pouvait s'arrêter avant le relais, et la plateforme
 * restait sur l'état d'avant.
 *
 * Il remplace le push (parti en X2, 2026-10-17,
 * `documentation/catalogue/catalogue-synchronise.md` §6), qui écrivait le
 * miroir d'un bloc puis validait l'arrivée. Ce qu'il ne fait pas : la
 * relecture. Un article arrivé par un fait attend la relecture du staff avant
 * d'être servi, en développement comme en production.
 */
export interface FactsReport {
  readonly delivered: number;
  readonly failed: number;
}

export async function deliverCatalogFacts(relay: OutboxRelay): Promise<FactsReport> {
  let delivered = 0;
  for (;;) {
    const report = await relay.sweep();
    delivered += report.delivered;
    if (report.failed > 0 || report.delivered === 0) {
      return { delivered, failed: report.failed };
    }
  }
}
