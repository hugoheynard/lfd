import type { OperationAudience } from '@lfd/pim-contracts';
import type { FoldSelectOption } from 'fold-ng';

/**
 * **Les mots de l'audience** au référentiel — fiche et famille (lot 3 de
 * `plan-catalogue-synchronise-par-audience.md`, H1).
 *
 * Partagés par les deux sélecteurs : une famille « Les deux » et une fiche qui
 * en « hérite (Les deux) » doivent dire la même chose avec le même mot.
 */
const AUDIENCE_LABELS: Readonly<Record<OperationAudience, string>> = {
  pro: 'Pros',
  public: 'Public',
  both: 'Les deux',
};

export function audienceLabel(audience: OperationAudience): string {
  return AUDIENCE_LABELS[audience];
}

/** Les trois audiences, pour la famille — qui n'hérite de rien. */
export const FAMILY_AUDIENCE_OPTIONS: readonly FoldSelectOption<OperationAudience>[] = (
  ['pro', 'public', 'both'] as const
).map((value) => ({ value, label: AUDIENCE_LABELS[value] }));

/** La valeur du sélecteur de la fiche : une audience, ou l'héritage. */
export const INHERIT = 'inherit';
export type ProductAudienceChoice = OperationAudience | typeof INHERIT;

/**
 * Les choix de la fiche : hériter (en nommant ce dont on hérite), puis les
 * trois audiences. `familyAudience` `null` = famille pas encore chargée.
 */
export function productAudienceOptions(
  familyAudience: OperationAudience | null,
): readonly FoldSelectOption<ProductAudienceChoice>[] {
  const inherited =
    familyAudience === null
      ? 'Hérite de la famille'
      : `Hérite de la famille (${AUDIENCE_LABELS[familyAudience]})`;
  return [{ value: INHERIT, label: inherited }, ...FAMILY_AUDIENCE_OPTIONS];
}
