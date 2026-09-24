import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { OperationRestriction } from "../entities/catalog-operation-override.js";

/**
 * Fait : **la surcharge d'une opération reçue est posée** (D9 du plan des
 * opérations datées, lot 2, 2026-09-24). La charge porte l'état ENTIER après
 * le geste : l'écran l'envoie entier, et la ligne précédente du journal dit
 * ce qu'il valait avant.
 *
 * Le sujet est l'opération, par sa clé — une clé ne se réemploie pas, donc
 * l'historique d'une clé est celui d'une seule opération. `subjectLabel` est
 * son nom français tel que le référentiel l'avait livré.
 */
export class CatalogOperationOverrideSetEvent implements JournaledEvent {
  constructor(
    readonly operation: { readonly key: string; readonly name: string },
    readonly restriction: OperationRestriction,
  ) {}

  journalFact(): JournalFact {
    const { restriction } = this;
    return {
      type: "catalog_operation.override_set",
      subjectType: "catalog_operation",
      subjectId: this.operation.key,
      payload: {
        subjectLabel: this.operation.name,
        isHidden: restriction.isHidden,
        orderUntil: restriction.orderUntil === null ? null : restriction.orderUntil.toISOString(),
        audience: restriction.audience,
        hiddenSkus: [...restriction.hiddenSkus],
      },
    };
  }
}
