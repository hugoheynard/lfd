import type { CatalogueAudience } from '@lfd/pim-contracts';
import type { FoldSelectOption } from 'fold-ng';

/**
 * **Les mots de l'audience** au référentiel — fiche et famille (lot 3 de
 * `plan-catalogue-synchronise-par-audience.md`, H1).
 *
 * Partagés par les deux sélecteurs : une famille « Les deux » et une fiche qui
 * en « hérite (Les deux) » doivent dire la même chose avec le même mot.
 */
const AUDIENCE_LABELS: Readonly<Record<CatalogueAudience, string>> = {
  pro: 'Pros',
  public: 'Public',
  both: 'Les deux',
  resupply: 'Réassort des boutiques seulement',
};

export function audienceLabel(audience: CatalogueAudience): string {
  return AUDIENCE_LABELS[audience];
}

/**
 * Les quatre audiences, pour la famille — qui n'hérite de rien. Le réassort
 * seul ne se vend à personne : ni en ligne, ni aux pros.
 */
export const FAMILY_AUDIENCE_OPTIONS: readonly FoldSelectOption<CatalogueAudience>[] = (
  ['pro', 'public', 'both', 'resupply'] as const
).map((value) => ({ value, label: AUDIENCE_LABELS[value] }));

/** La valeur du sélecteur de la fiche : une audience, ou l'héritage. */
export const INHERIT = 'inherit';
export type ProductAudienceChoice = CatalogueAudience | typeof INHERIT;

/**
 * Les choix de la fiche : hériter (en nommant ce dont on hérite), puis les
 * quatre audiences. `familyAudience` `null` = famille pas encore chargée.
 */
export function productAudienceOptions(
  familyAudience: CatalogueAudience | null,
): readonly FoldSelectOption<ProductAudienceChoice>[] {
  const inherited =
    familyAudience === null
      ? 'Hérite de la famille'
      : `Hérite de la famille (${AUDIENCE_LABELS[familyAudience]})`;
  return [{ value: INHERIT, label: inherited }, ...FAMILY_AUDIENCE_OPTIONS];
}

/** La valeur du sélecteur d'une déclinaison qui suit sa fiche (`null` au serveur). */
export const FOLLOW_PRODUCT = 'product';
export type VariantAudienceChoice = CatalogueAudience | typeof FOLLOW_PRODUCT;

/**
 * Les choix d'une déclinaison (`plan-audience-par-declinaison.md`, Q2) : suivre
 * la fiche (en nommant son audience effective), puis les quatre audiences.
 * `productAudience` `null` = l'audience de la fiche n'est pas encore connue.
 */
export function variantAudienceOptions(
  productAudience: CatalogueAudience | null,
): readonly FoldSelectOption<VariantAudienceChoice>[] {
  const follows =
    productAudience === null
      ? 'Comme la fiche'
      : `Comme la fiche (${AUDIENCE_LABELS[productAudience]})`;
  return [{ value: FOLLOW_PRODUCT, label: follows }, ...FAMILY_AUDIENCE_OPTIONS];
}
