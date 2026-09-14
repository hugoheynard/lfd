import type {
  FeatureAccessAuthorView,
  FeatureExemptionAccountState,
  FeatureKey,
  FeatureLevel,
  IgnoredFeatureRowView,
} from '@lfd/contracts';
import type { FoldBadgeVariant } from 'fold-ng';

/**
 * Le libellé de chaque niveau, par clé.
 *
 * Le catalogue du contrat ne porte pas de libellé par niveau, seulement les
 * valeurs (`closed`, `browse`, `order`) — vérifié le 2026-09-14. Le mot montré
 * vit donc ici, et le TYPE le lie au catalogue : un niveau ajouté au contrat
 * sans son libellé ne compile pas.
 *
 * Import de TYPE seulement : la valeur `FEATURE_CATALOGUE` tirerait zod et tous
 * les schémas dans le bundle (cf. `PermissionsStore.can`).
 */
const LEVEL_LABELS: { readonly [Key in FeatureKey]: Readonly<Record<FeatureLevel<Key>, string>> } =
  {
    shop: { closed: 'Fermée', browse: 'Voir', order: 'Commander' },
    orders: { hidden: 'Masquées', visible: 'Visibles' },
    invoices: { hidden: 'Masquées', visible: 'Visibles' },
    desktopMenu: { hidden: 'Masqué', visible: 'Visible' },
    customerMandate: { closed: 'Fermé', open: 'Ouvert' },
  };

/**
 * Vrai si l'écran sait peindre cette clé. Une clé que le serveur renverrait
 * sans que ce front la connaisse (contrat en avance d'un déploiement) est
 * signalée, jamais interprétée.
 */
export function isKnownFeatureKey(key: string): key is FeatureKey {
  return Object.hasOwn(LEVEL_LABELS, key);
}

/** Le mot d'un niveau ; la valeur brute s'il n'en a pas, pour ne jamais montrer un vide. */
export function levelLabel(key: FeatureKey, level: string): string {
  const labels: Readonly<Record<string, string>> = LEVEL_LABELS[key];
  return Object.hasOwn(labels, level) ? (labels[level] ?? level) : level;
}

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

/** Une ligne ignorée, dite en une phrase. */
export function ignoredRowLine(row: IgnoredFeatureRowView): string {
  const what =
    row.table === 'override'
      ? `la dérogation « ${row.key} = ${row.detail} »`
      : `l’exemption de ${row.detail} sur « ${row.key} »`;
  const why =
    row.reason === 'unknown_key'
      ? 'cette clé n’existe pas au catalogue'
      : 'cette valeur n’est pas un niveau de sa clé';
  return `${what} : ${why}`;
}
