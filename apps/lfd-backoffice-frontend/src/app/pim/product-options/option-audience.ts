import type { OperationAudience } from '@lfd/pim-contracts';
import type { FoldSelectOption } from 'fold-ng';

const OPTION_AUDIENCE_LABELS: Readonly<Record<OperationAudience, string>> = {
  pro: 'Pros',
  public: 'Particuliers',
  both: 'Les deux',
};

/** À qui un choix se propose, dit comme l'écran le dit. */
export function optionAudienceLabel(audience: OperationAudience): string {
  return OPTION_AUDIENCE_LABELS[audience];
}

/** Les trois clientèles d'un choix — celles d'une commande, sans le réassort. */
export const OPTION_AUDIENCE_OPTIONS: readonly FoldSelectOption<OperationAudience>[] = (
  ['both', 'pro', 'public'] as const
).map((value) => ({ value, label: OPTION_AUDIENCE_LABELS[value] }));
