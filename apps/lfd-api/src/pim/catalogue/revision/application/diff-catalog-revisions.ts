import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type {
  AttributedFieldDiffView,
  CatalogRevisionDiffView,
  CatalogRevisionItemDiffView,
  CatalogRevisionSummaryView,
} from "@lfd/pim-contracts";

import { PimJournalReader } from "../../../journal/pim-journal-reader.js";
import {
  GLOBAL_CAUSE_TYPES,
  attributeFields,
  causesOf,
  coveredBy,
  type GlobalCause,
} from "../domain/attribution.js";

import { diffItem, headerDiff, planDiff, type ItemDiff } from "../domain/diff.js";
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
  constructor(
    private readonly revisions: CatalogRevisionRepository,
    private readonly journal: PimJournalReader,
  ) {}

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
      causes: causes.map((cause) => ({
        type: cause.type,
        label: cause.label,
        by: cause.by,
        at: cause.at.toISOString(),
        explains: cause.explains,
        blast: cause.blast,
      })),
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
            this.attribute(diffItem(sku, before, after), after, from.takenAt, to.takenAt, causes),
          ];
        }),
      ),
    };
  }

  /**
   * L'auteur de chaque ligne, lu dans le journal du produit sur l'INTERVALLE
   * des deux ancres.
   *
   * Par produit et non par article : le journal traite le produit, une révision
   * l'article. Le `productId` vient du payload figé — celui de l'ancre
   * d'arrivée, parce que c'est l'état qu'on regarde ; s'il manque, on n'attribue
   * rien plutôt que de deviner.
   */
  private async attribute(
    item: ItemDiff,
    payload: Readonly<Record<string, unknown>>,
    since: Date,
    until: Date,
    causes: readonly GlobalCause[],
  ): Promise<CatalogRevisionItemDiffView> {
    const productId = payload["productId"];
    if (typeof productId !== "string") {
      return { ...item, fields: item.fields.map((field) => unattributed(field, causes)) };
    }
    const facts = await this.journal.factsAbout("product", productId, since, until);
    const authors = attributeFields(
      item.fields.map((field) => field.field),
      facts,
    );
    return {
      ...item,
      fields: item.fields.map((field) => {
        const author = authors.get(field.field);
        return author === undefined
          ? unattributed(field, causes)
          : {
              ...field,
              attributed: true,
              by: author.by,
              at: author.at.toISOString(),
              // Un fait direct l'emporte : la cause globale n'explique que ce
              // que personne ne revendique.
              cause: null,
            };
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

/**
 * Une ligne dont personne ne revendique le changement.
 *
 * `attributed: false` n'est pas `by: null` : le second dit « le système l'a
 * fait », le premier dit « on ne sait pas ». Les confondre ferait passer un
 * changement venu d'un script pour une décision de la machine.
 */
function unattributed(
  field: { field: string; before: string; after: string },
  causes: readonly GlobalCause[],
): AttributedFieldDiffView {
  const cause = coveredBy(field.field, causes);
  return {
    ...field,
    attributed: false,
    by: null,
    at: null,
    // La cause n'est PAS une attribution : elle dit ce qui a pu produire cette
    // ligne, pas qui l'a produite. `attributed` reste donc faux — c'est au
    // lecteur de faire le lien, avec de quoi le faire.
    cause: cause === null ? null : cause.label,
  };
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
