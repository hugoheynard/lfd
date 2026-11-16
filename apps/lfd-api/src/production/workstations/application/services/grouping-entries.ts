import type { ProductionGroupingEntryView, ProductionGroupingSectionView } from "@lfd/contracts";

import {
  groupingOf,
  sectionOrdered,
  type GroupingSource,
  type ProductionGroup,
} from "../../../shared/print/index.js";

/**
 * **Où chaque SKU se range** (plan `fournil/plan-postes-du-fournil.md`,
 * § 3.7) — une fonction pure, la traduction de `groupingOf` pour les écrans
 * qui rangeaient eux-mêmes (prévisionnel, récapitulatif, réassorts du fournil).
 *
 * Le rangement est celui de la fiche et du dossier, au mot près : même
 * fonction, mêmes titres, même ordre des groupes. Chaque SKU ressort une fois,
 * dans l'ordre du rangement : les groupes dans leur ordre, et dans un groupe
 * l'ordre reçu — section par section quand le réglage affiche les intertitres.
 * Le groupe sans rayon n'a jamais d'intertitre, comme sur la fiche.
 */
export function groupingEntriesOf(
  skus: readonly string[],
  source: GroupingSource,
  showSubcategories: boolean,
): readonly ProductionGroupingEntryView[] {
  return groupingOf(skus, (sku) => sku, source).flatMap((group, order) =>
    entriesOf(group, order, showSubcategories),
  );
}

function entriesOf(
  group: ProductionGroup<string>,
  order: number,
  showSubcategories: boolean,
): readonly ProductionGroupingEntryView[] {
  const head = { key: group.key, title: group.title, kind: group.kind, order };
  if (!showSubcategories || group.kind === "off_catalog") {
    return group.lines.map((sku) => ({ sku, ...head, section: null }));
  }
  const sectionOf = new Map<string, ProductionGroupingSectionView>();
  group.sections.forEach((section, index) => {
    const view = {
      key: section.family?.id ?? null,
      label: section.family?.name ?? null,
      order: index,
    };
    for (const sku of section.items) {
      sectionOf.set(sku, view);
    }
  });
  // L'ordre reçu, section par section : un comparateur nul garde l'ordre (tri stable).
  return sectionOrdered(group.sections, () => 0).map((sku) => ({
    sku,
    ...head,
    section: sectionOf.get(sku) ?? null,
  }));
}
