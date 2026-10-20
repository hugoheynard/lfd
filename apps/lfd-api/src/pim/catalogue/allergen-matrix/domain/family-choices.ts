import { readLocalized, type Locale } from "@lfd/pim-contracts";

import type { MatrixFamilyRecord } from "./ports/allergen-matrix.source.js";

/** Une famille telle que le filtre de la matrice la propose. */
export interface MatrixFamilyChoice {
  readonly id: string;
  readonly label: string;
  readonly parentId: string | null;
  /** 0 pour une racine : l'écran indente par ce rang. */
  readonly depth: number;
}

/**
 * **Les familles que le filtre propose** — décision de Hugo du 2026-10-20 :
 * l'écran de la matrice n'a que le droit `allergen_matrix`, pas `pim_catalog`,
 * et ne peut donc pas lire l'arbre ailleurs.
 *
 * Indépendant du filtre et du périmètre : c'est la LISTE du filtre, pas le
 * contenu — une famille mère sans fiche propre s'y trouve. Les archivées en
 * sortent ; une fille dont la mère n'est plus proposée remonte à la racine
 * plutôt que de disparaître. Parcours en profondeur : chaque mère avant ses
 * filles, frères par rang puis par identifiant.
 */
export function familyChoices(
  families: readonly MatrixFamilyRecord[],
  locale: Locale,
): MatrixFamilyChoice[] {
  const live = families.filter((family) => !family.isArchived);
  const liveIds = new Set(live.map((family) => family.id));
  const childrenOf = new Map<string | null, MatrixFamilyRecord[]>();
  for (const family of live) {
    const parent =
      family.parentId !== null && liveIds.has(family.parentId) ? family.parentId : null;
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), family]);
  }
  const out: MatrixFamilyChoice[] = [];
  const visit = (parentId: string | null, depth: number): void => {
    const siblings = [...(childrenOf.get(parentId) ?? [])].sort(
      (a, b) => a.position - b.position || a.id.localeCompare(b.id),
    );
    for (const family of siblings) {
      out.push({
        id: family.id,
        label: readLocalized(family.name, locale),
        parentId: depth === 0 ? null : family.parentId,
        depth,
      });
      visit(family.id, depth + 1);
    }
  };
  visit(null, 0);
  return out;
}
