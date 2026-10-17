/**
 * **Émettre les règles globales du catalogue vers la plateforme** — dans la
 * transaction du geste qui les change (lot 2b de
 * `documentation/catalogue/plan-catalogue-synchronise-par-audience.md`, C3).
 *
 * Les limites de commande voyagent comme RÈGLES, pas recopiées par fiche : un
 * réglage global réémettrait sinon tout le catalogue. Ce contexte DÉCLARE le
 * port ; le canal de la plateforme l'implémente — il ne connaît pas ses
 * canaux.
 *
 * ## Le contrat
 *
 * - Appelé en **dernière instruction** du `uow.run` du geste : les règles sont
 *   relues en base sous verrou, après l'écriture — jamais prises en mémoire.
 */
export abstract class CatalogRulesEmitter {
  /** Émet l'ensemble des règles en vigueur, sous un numéro d'ordre. */
  abstract emitRules(): Promise<void>;
}
