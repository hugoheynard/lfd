import type {
  AdminFeatureView,
  FeatureExemptionKind,
  FeatureKey,
  IgnoredFeatureRowView,
} from '@lfd/contracts';
import type { FoldSelectOption } from 'fold-ng';

import { levelLabel } from '../../shared/feature-levels';
import {
  ACCOUNT_STATE_BADGES,
  type AccountStateBadge,
  authoredLine,
} from './feature-access-labels';
import type { CompanyExemptionRow } from './feature-company-exemptions/feature-company-exemptions';

/*
 * Ce que l'écran des accès peint d'une clé, traduit une fois de la vue du
 * serveur : la page n'a plus qu'à le montrer.
 */

/** Une adresse exemptée, telle que la ligne la peint. */
export interface ExemptionRow {
  readonly id: string;
  readonly email: string;
  readonly added: string;
  readonly badge: AccountStateBadge;
}

/** Une carte : un flag du catalogue, déjà traduit en ce que l'écran montre. */
export interface FeatureCard {
  readonly key: FeatureKey;
  readonly label: string;
  readonly description: string;
  readonly options: readonly FoldSelectOption<string>[];
  readonly effectiveLevel: string;
  readonly effectiveLabel: string;
  /** `null` = défaut du code. */
  readonly provenance: string | null;
  readonly defaultLabel: string;
  /** Par quoi la clé s'exempte ; `null` : par rien — pas de formulaire d'ajout. */
  readonly exemptBy: FeatureExemptionKind | null;
  readonly exemptions: readonly ExemptionRow[];
  readonly companyExemptions: readonly CompanyExemptionRow[];
}

/** Une ligne que le catalogue ne sait pas lire, et le geste qui la retire s'il y en a un. */
export interface UnreadableRow {
  readonly line: string;
  readonly removal: IgnoredFeatureRowView | null;
}

export function toCard(key: FeatureKey, feature: AdminFeatureView): FeatureCard {
  return {
    key,
    label: feature.label,
    description: feature.description,
    options: feature.levels.map((level) => ({ value: level, label: levelLabel(key, level) })),
    effectiveLevel: feature.effectiveLevel,
    effectiveLabel: levelLabel(key, feature.effectiveLevel),
    provenance:
      feature.override === null
        ? null
        : authoredLine('Posé', feature.override.updatedBy, feature.override.updatedAt),
    defaultLabel: levelLabel(key, feature.defaultLevel),
    exemptBy: feature.exemptBy,
    exemptions: feature.exemptions.map((exemption) => ({
      id: exemption.id,
      email: exemption.email,
      added: authoredLine('Ajoutée', exemption.createdBy, exemption.createdAt),
      badge: ACCOUNT_STATE_BADGES[exemption.accountState],
    })),
    companyExemptions: feature.companyExemptions.map((exemption) => ({
      companyId: exemption.companyId,
      companyName: exemption.companyName,
      added: authoredLine('Ajoutée', exemption.createdBy, exemption.createdAt),
    })),
  };
}

/** Une exemption ignorée se retire par son geste habituel ; une dérogation, par la clé. */
export function removable(row: IgnoredFeatureRowView): IgnoredFeatureRowView | null {
  return row.table !== 'override' && row.id !== null ? row : null;
}
