import type {
  FeatureAccessAuthorView,
  FeatureExemptionAccountState,
  IgnoredFeatureRowView,
} from '@lfd/contracts';
import type { FoldBadgeVariant } from 'fold-ng';

/*
 * Le mot de chaque niveau vit dans `shared/feature-levels.ts` : le journal le
 * lit aussi, et `shared/` ne dépend pas d'`admin/`.
 */

/** « 14 septembre 2026 à 10:32 ». */
export function formatInstant(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** Le nom figé au geste, ou ce qu'on en sait quand l'annuaire ne le connaissait pas. */
export function authorName(author: FeatureAccessAuthorView): string {
  return author.name.trim() === '' ? 'un membre de l’équipe hors annuaire' : author.name;
}

/** « Posé par Hugo Heynard le 14 septembre 2026 à 10:32 ». */
export function authoredLine(verb: string, author: FeatureAccessAuthorView, at: string): string {
  return `${verb} par ${authorName(author)} le ${formatInstant(at)}`;
}

/** La pastille d'état du compte qui porte une adresse exemptée. */
export interface AccountStateBadge {
  readonly label: string;
  readonly variant: FoldBadgeVariant;
}

/**
 * Seule `verified` fait jouer l'exemption (plan §2.2) : c'est la seule en vert.
 * « Aucun compte » n'est pas une faute — l'adresse d'un testeur peut précéder
 * son inscription — d'où le neutre plutôt que l'ambre.
 */
export const ACCOUNT_STATE_BADGES: Readonly<
  Record<FeatureExemptionAccountState, AccountStateBadge>
> = {
  verified: { label: 'vérifiée', variant: 'success' },
  unverified: { label: 'non vérifiée', variant: 'warning' },
  none: { label: 'aucun compte', variant: 'neutral' },
};

const IGNORED_REASONS: Readonly<Record<IgnoredFeatureRowView['reason'], string>> = {
  unknown_key: 'cette clé n’existe pas au catalogue',
  unknown_level: 'cette valeur n’est pas un niveau de sa clé',
  exemption_kind_retired: 'ignorée, sorte retirée : cette clé ne s’exempte plus de cette façon',
};

/** Une ligne ignorée, dite en une phrase. */
export function ignoredRowLine(row: IgnoredFeatureRowView): string {
  const what =
    row.table === 'override'
      ? `la dérogation « ${row.key} = ${row.detail} »`
      : row.table === 'company_exemption'
        ? `l’exemption de la société ${row.detail} sur « ${row.key} »`
        : `l’exemption de ${row.detail} sur « ${row.key} »`;
  return `${what} : ${IGNORED_REASONS[row.reason]}`;
}
