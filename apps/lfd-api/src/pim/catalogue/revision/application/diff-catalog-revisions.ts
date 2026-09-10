import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { CatalogRevisionDiffView } from "@lfd/pim-contracts";

import { PimJournalReader } from "../../../journal/pim-journal-reader.js";
import { GLOBAL_CAUSE_TYPES, causesOf } from "../domain/attribution.js";

import { diffItem, headerDiff, planDiff } from "../domain/diff.js";
import {
  CatalogRevisionRepository,
  type RevisionRecord,
} from "../domain/ports/catalog-revision.repository.js";
import { RevisionNotFoundError } from "../domain/errors/revision-errors.js";
import { attributeItem, causeViews, summaryOf } from "./revision-diff-support.js";

export class DiffCatalogRevisionsQuery {
  constructor(
    readonly fromReference: string,
    readonly toReference: string,
  ) {}
}

/**
 * **Ce qui a changé entre deux ancres.**
 *
 * La lecture est paresseuse par construction, et c'est tout l'intérêt du magasin
 * adressé par contenu : on compare d'abord des couples `(sku, empreinte)`, puis
 * on ne charge QUE les payloads des articles dont l'empreinte diffère. Sur mille
 * articles dont trois ont bougé, six payloads sont lus — trois de chaque côté —
 * et non deux mille.
 */
@QueryHandler(DiffCatalogRevisionsQuery)
export class DiffCatalogRevisionsHandler implements IQueryHandler<
  DiffCatalogRevisionsQuery,
  CatalogRevisionDiffView
> {
  constructor(
    private readonly revisions: CatalogRevisionRepository,
    private readonly journal: PimJournalReader,
  ) {}

  async execute(query: DiffCatalogRevisionsQuery): Promise<CatalogRevisionDiffView> {
    const [from, to] = await Promise.all([
      this.require(query.fromReference),
      this.require(query.toReference),
    ]);
    const [beforeIndex, afterIndex] = await Promise.all([
      this.revisions.indexOf(from.id),
      this.revisions.indexOf(to.id),
    ]);

    const plan = planDiff(beforeIndex, afterIndex);
    // Les causes globales se lisent UNE fois pour tout le diff, pas une fois par
    // article : un taux révisé est un seul fait, et le relire cent fois
    // coûterait cent requêtes pour cent copies de la même ligne.
    const [beforePayloads, afterPayloads, causes] = await Promise.all([
      this.revisions.payloadsOf(from.id, plan.changed),
      this.revisions.payloadsOf(to.id, plan.changed),
      this.journal
        .factsBetween(GLOBAL_CAUSE_TYPES, from.takenAt, to.takenAt)
        .then((facts) => causesOf(facts)),
    ]);

    return {
      from: summaryOf(from),
      to: summaryOf(to),
      header: headerDiff(beforeIndex, afterIndex),
      causes: causeViews(causes),
      added: plan.added,
      removed: plan.removed,
      changed: await Promise.all(
        plan.changed.flatMap((sku) => {
          const before = beforePayloads.get(sku);
          const after = afterPayloads.get(sku);
          // Les deux existent : le plan les a désignés parce que les DEUX index
          // les portent. Un manque signalerait une ligne d'appartenance sans
          // contenu, que la clé étrangère interdit.
          if (before === undefined || after === undefined) {
            return [];
          }
          return [
            attributeItem(
              this.journal,
              diffItem(sku, before, after),
              after,
              from.takenAt,
              to.takenAt,
              causes,
            ),
          ];
        }),
      ),
    };
  }

  private async require(reference: string): Promise<RevisionRecord> {
    const found = await this.revisions.byReference(reference);
    if (found === null) {
      throw new RevisionNotFoundError(reference);
    }
    return found;
  }
}
