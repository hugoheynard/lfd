import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { CatalogRevisionDiffView, CatalogRevisionSummaryView } from "@lfd/pim-contracts";

import { diffItem, headerDiff, planDiff } from "../domain/diff.js";
import {
  CatalogRevisionRepository,
  type RevisionRecord,
} from "../domain/ports/catalog-revision.repository.js";
import { RevisionNotFoundError } from "../domain/errors/revision-errors.js";

export class DiffCatalogRevisionsQuery {
  constructor(
    readonly fromVersion: number,
    readonly toVersion: number,
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
  constructor(private readonly revisions: CatalogRevisionRepository) {}

  async execute(query: DiffCatalogRevisionsQuery): Promise<CatalogRevisionDiffView> {
    const [from, to] = await Promise.all([
      this.require(query.fromVersion),
      this.require(query.toVersion),
    ]);
    const [beforeIndex, afterIndex] = await Promise.all([
      this.revisions.indexOf(from.id),
      this.revisions.indexOf(to.id),
    ]);

    const plan = planDiff(beforeIndex, afterIndex);
    const [beforePayloads, afterPayloads] = await Promise.all([
      this.revisions.payloadsOf(from.id, plan.changed),
      this.revisions.payloadsOf(to.id, plan.changed),
    ]);

    return {
      from: summaryOf(from),
      to: summaryOf(to),
      header: headerDiff(beforeIndex, afterIndex),
      added: plan.added,
      removed: plan.removed,
      changed: plan.changed.flatMap((sku) => {
        const before = beforePayloads.get(sku);
        const after = afterPayloads.get(sku);
        // Les deux existent : le plan les a désignés parce que les DEUX index
        // les portent. Un manque signalerait une ligne d'appartenance sans
        // contenu, que la clé étrangère interdit.
        return before === undefined || after === undefined ? [] : [diffItem(sku, before, after)];
      }),
    };
  }

  private async require(version: number): Promise<RevisionRecord> {
    const found = await this.revisions.byVersion(version);
    if (found === null) {
      throw new RevisionNotFoundError(version);
    }
    return found;
  }
}

export function summaryOf(record: RevisionRecord): CatalogRevisionSummaryView {
  return {
    id: record.id,
    version: record.version,
    label: record.label,
    hash: record.hash,
    takenAt: record.takenAt.toISOString(),
    takenBy: record.takenBy,
    articles: record.articles,
  };
}
