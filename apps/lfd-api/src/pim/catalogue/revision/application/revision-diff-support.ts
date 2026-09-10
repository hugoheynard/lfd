import type {
  AttributedFieldDiffView,
  CatalogRevisionCauseView,
  CatalogRevisionItemDiffView,
  CatalogRevisionSummaryView,
} from "@lfd/pim-contracts";

import type { PimJournalReader } from "../../../journal/pim-journal-reader.js";
import { attributeFields, coveredBy, type GlobalCause } from "../domain/attribution.js";
import type { ItemDiff } from "../domain/diff.js";
import type { RevisionRecord } from "../domain/ports/catalog-revision.repository.js";

/**
 * **Ce que les deux diffs partagent** — celui entre deux ancres, et celui entre
 * la dernière ancre et le catalogue vivant.
 *
 * Ils ne diffèrent que par un côté : l'un lit deux photographies, l'autre en
 * lit une et construit l'autre en mémoire. Tout ce qui vient APRÈS le plan —
 * l'attribution d'un champ à son auteur, la cause globale qui couvre ce que
 * personne ne revendique, le résumé d'une ancre — est le même travail.
 *
 * Colocalisé dans un `*-support.ts` comme le PIM le fait partout : la logique
 * commune à plusieurs cas y vit, jamais dupliquée. La dupliquer ici aurait été
 * la meilleure façon de faire diverger deux écrans qui doivent dire la même
 * chose du même changement.
 */

/**
 * L'auteur de chaque ligne, lu dans le journal du produit sur l'INTERVALLE
 * donné.
 *
 * Par produit et non par article : le journal traite le produit, une révision
 * l'article. Le `productId` vient du payload de l'état qu'on REGARDE — celui
 * d'arrivée ; s'il manque, on n'attribue rien plutôt que de deviner.
 */
export async function attributeItem(
  journal: PimJournalReader,
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
  const facts = await journal.factsAbout("product", productId, since, until);
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
            // Un fait direct l'emporte : la cause globale n'explique que ce que
            // personne ne revendique.
            cause: null,
          };
    }),
  };
}

/**
 * Une ligne dont personne ne revendique le changement.
 *
 * `attributed: false` n'est pas `by: null` : le second dit « le système l'a
 * fait », le premier dit « on ne sait pas ». Les confondre ferait passer un
 * changement venu d'un script pour une décision de la machine.
 */
export function unattributed(
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

/** Les causes globales, telles qu'un écran les lit. */
export function causeViews(causes: readonly GlobalCause[]): readonly CatalogRevisionCauseView[] {
  return causes.map((cause) => ({
    type: cause.type,
    label: cause.label,
    by: cause.by,
    at: cause.at.toISOString(),
    explains: cause.explains,
    blast: cause.blast,
  }));
}

export function summaryOf(record: RevisionRecord): CatalogRevisionSummaryView {
  return {
    id: record.id,
    reference: record.reference,
    label: record.label,
    hash: record.hash,
    takenAt: record.takenAt.toISOString(),
    takenBy: record.takenBy,
    articles: record.articles,
  };
}
