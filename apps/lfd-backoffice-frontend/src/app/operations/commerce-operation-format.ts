import type {
  CommerceOperationAudience,
  CommerceOperationShopDisplay,
  CommerceOperationState,
  CommerceOperationView,
  OperationMigrationExplanation,
  OperationMigrationFieldName,
  OperationMigrationOutcome,
} from '@lfd/contracts';
import { httpErrorCode } from '@lfd/endpoints';
import type { FoldBadgeVariant } from 'fold-ng';

/**
 * Ce que l'écran « Opérations » dit d'une opération du commerce et de sa
 * reprise depuis le référentiel. Rien n'est recalculé ici : l'état, ce que
 * verra le client et les avertissements viennent du serveur, à SON horloge.
 */

/** Le refus qui dit « interrupteur fermé » — un état du déploiement, pas une panne. */
export const NOT_AT_COMMERCE = 'operations.not_at_commerce';

/** Le refus est-il celui de l'interrupteur fermé ? */
export function isNotAtCommerce(error: unknown): boolean {
  return httpErrorCode(error) === NOT_AT_COMMERCE;
}

/** `archived` passe avant l'état calculé : une archivée garde ses dates, pas sa vie. */
export type CommerceOperationBadge = CommerceOperationState | 'archived';

const BADGES: Readonly<
  Record<CommerceOperationBadge, { readonly label: string; readonly variant: FoldBadgeVariant }>
> = {
  preparing: { label: 'En préparation', variant: 'neutral' },
  announced: { label: 'Annoncée', variant: 'info' },
  open: { label: 'Commandes ouvertes', variant: 'success' },
  closed: { label: 'Commandes closes', variant: 'warning' },
  ended: { label: 'Terminée', variant: 'neutral' },
  archived: { label: 'Archivée', variant: 'neutral' },
};

export function badgeOf(
  view: Pick<CommerceOperationView, 'state' | 'archivedAt'>,
): CommerceOperationBadge {
  return view.archivedAt === null ? view.state : 'archived';
}

export function badgeLabel(badge: CommerceOperationBadge): string {
  return BADGES[badge].label;
}

export function badgeVariant(badge: CommerceOperationBadge): FoldBadgeVariant {
  return BADGES[badge].variant;
}

const SHOP_DISPLAYS: Readonly<Record<CommerceOperationShopDisplay, string>> = {
  nothing: 'En boutique : rien',
  announcement_only: "En boutique : l'annonce seule, sans produit",
  announcement_and_products: "En boutique : l'annonce, puis les articles",
};

/** Ce que verra le client, maintenant (plan, « Une opération sans article »). */
export function shopDisplayPhrase(display: CommerceOperationShopDisplay): string {
  return SHOP_DISPLAYS[display];
}

const AUDIENCES: Readonly<Record<CommerceOperationAudience, string>> = {
  both: 'Professionnels et particuliers',
  pro: 'Professionnels',
  public: 'Particuliers',
};

export function audienceLabel(audience: CommerceOperationAudience): string {
  return AUDIENCES[audience];
}

/** Les vivantes d'abord, les archivées à part : on ne les confond pas. */
export function splitArchived(views: readonly CommerceOperationView[]): {
  readonly live: readonly CommerceOperationView[];
  readonly archived: readonly CommerceOperationView[];
} {
  return {
    live: views.filter((view) => view.archivedAt === null),
    archived: views.filter((view) => view.archivedAt !== null),
  };
}

const OUTCOMES: Readonly<
  Record<OperationMigrationOutcome, { readonly label: string; readonly variant: FoldBadgeVariant }>
> = {
  create: { label: 'Sera créée', variant: 'info' },
  adopt: { label: 'Sera reprise', variant: 'info' },
  already_at_commerce: { label: 'Déjà au commerce', variant: 'success' },
  archived_unchanged: { label: 'Archivée, inchangée', variant: 'neutral' },
  mirror_only: { label: 'Absente du référentiel', variant: 'warning' },
  blocked: { label: 'Bloquée', variant: 'alert' },
};

export function outcomeLabel(outcome: OperationMigrationOutcome): string {
  return OUTCOMES[outcome].label;
}

export function outcomeVariant(outcome: OperationMigrationOutcome): FoldBadgeVariant {
  return OUTCOMES[outcome].variant;
}

const FIELDS: Readonly<Record<OperationMigrationFieldName, string>> = {
  name: 'Nom',
  lede: 'Chapeau',
  image: 'Image',
  announceFrom: 'Annonce',
  orderFrom: 'Ouverture des commandes',
  orderUntil: 'Clôture des commandes',
  pickupFrom: 'Premier jour de retrait',
  pickupUntil: 'Dernier jour de retrait',
  audience: 'Clientèle',
  skus: 'Sélection',
  hidden: 'Masquée',
  archived: 'Archivée',
};

export function fieldLabel(field: OperationMigrationFieldName): string {
  return FIELDS[field];
}

const EXPLANATIONS: Readonly<Record<OperationMigrationExplanation, string>> = {
  same: 'Identique',
  referential_newer: 'Le référentiel a changé depuis le dernier envoi',
  not_in_mirror: 'Jamais envoyée à la boutique',
  held_at_commerce: 'Non comparé : déjà tenu au commerce',
  unexplained: 'Écart inexpliqué',
};

export function explanationLabel(explanation: OperationMigrationExplanation): string {
  return EXPLANATIONS[explanation];
}
