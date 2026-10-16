import type {
  CommerceOperationAudience,
  CommerceOperationShopDisplay,
  CommerceOperationState,
  CommerceOperationView,
  OperationMigrationExplanation,
  OperationMigrationFieldName,
  OperationMigrationOutcome,
} from '@lfd/contracts';
import { httpErrorCode, httpErrorMessage } from '@lfd/endpoints';
import type { FoldBadgeVariant, FoldSelectOption } from 'fold-ng';

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

/** Les trois clientèles, pour `fold-listbox`. */
export const AUDIENCE_OPTIONS: readonly FoldSelectOption<CommerceOperationAudience>[] = (
  ['both', 'pro', 'public'] as const
).map((value) => ({ value, label: AUDIENCES[value] }));

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

/**
 * Un refus du serveur, TEL QUEL : les erreurs des opérations du commerce
 * nomment déjà le cas et le geste de sortie, en français
 * (`b2b/operations/domain/errors/operation-errors.ts`, lu le 2026-10-16) —
 * y compris l'interrupteur fermé (`operations.writing_closed`). Le repli ne
 * sert qu'à une panne sans enveloppe.
 */
export function refusalOf(error: unknown, fallback: string): string {
  return httpErrorMessage(error, fallback);
}

/** Un texte d'annonce, tel que le contrat le porte. */
export interface OperationText {
  readonly fr: string;
  readonly en?: string | undefined;
  readonly it?: string | undefined;
}

/** Un texte en trois langues, tel qu'on le saisit. */
export interface LocalizedDraft {
  readonly fr: string;
  readonly en: string;
  readonly it: string;
}

export const EMPTY_LOCALIZED: LocalizedDraft = { fr: '', en: '', it: '' };

export function localizedDraftOf(text: OperationText | null): LocalizedDraft {
  return { fr: text?.fr ?? '', en: text?.en ?? '', it: text?.it ?? '' };
}

/**
 * Le texte à envoyer, ou `null` sans français. Une langue vide est OMISE :
 * une traduction absente retombe sur le français côté lecteur.
 */
export function localizedOf(draft: LocalizedDraft): OperationText | null {
  const fr = draft.fr.trim();
  if (fr === '') {
    return null;
  }
  const en = draft.en.trim();
  const it = draft.it.trim();
  return { fr, ...(en === '' ? {} : { en }), ...(it === '' ? {} : { it }) };
}

/** Deux textes disent-ils la même chose, langue par langue ? */
export function sameLocalized(a: OperationText | null, b: OperationText | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.fr === b.fr && a.en === b.en && a.it === b.it;
}
