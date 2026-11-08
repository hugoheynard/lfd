/**
 * **Le retour du fournisseur** sur un e-mail accepté (plan
 * `documentation/mail/le-suivi-des-e-mails.md`, décisions 1 et 3) : le
 * second axe d'une demande, à côté de son `status`. `null` côté demande =
 * rien reçu.
 *
 * Ordonné du moins grave au plus grave : les webhooks n'ont aucun ordre
 * garanti, et un « remis » arrivé après un « rebondi » effacerait la seule
 * information qui demande une action. `complained` et `bounced` priment sur
 * `delivered` exprès : une plainte suit toujours la remise.
 */
export const MAIL_DELIVERIES = ["delayed", "delivered", "complained", "bounced"] as const;

export type MailDelivery = (typeof MAIL_DELIVERIES)[number];

/** Vrai si `next` doit remplacer `current` (`null` : rien reçu). */
export function deliveryOutranks(next: MailDelivery, current: MailDelivery | null): boolean {
  return current === null || MAIL_DELIVERIES.indexOf(next) > MAIL_DELIVERIES.indexOf(current);
}

/** Une valeur relue (base, réseau) : le retour connu, ou `null`. */
export function mailDeliveryOf(raw: string): MailDelivery | null {
  return MAIL_DELIVERIES.find((known) => known === raw) ?? null;
}

/** La longueur d'un genre de retour (colonne `delivery_kind`). */
export const DELIVERY_KIND_MAX = 64;

/** Un mot du fournisseur : des lettres, rien d'autre — ni espace, ni `@`. */
const KIND_WORD = /^[A-Za-z]{1,30}$/;

/**
 * **Le genre d'un retour**, et seulement lui (décision 4) : `Permanent`,
 * `Permanent/Suppressed`… Le texte du fournisseur (`bounce.message`) n'est
 * JAMAIS rangé — il cite souvent l'adresse. Un mot qui n'est pas fait que de
 * lettres est écarté plutôt que gardé : ce qu'on ne sait pas lire pourrait
 * porter une donnée personnelle. La contrainte `delivery_kind_check` en base
 * dit la même forme.
 */
export function deliveryKindOf(type: string | null, subType: string | null): string | null {
  if (type === null || !KIND_WORD.test(type)) {
    return null;
  }
  return subType !== null && KIND_WORD.test(subType) ? `${type}/${subType}` : type;
}

/** Un retour, tel qu'une demande l'applique. */
export interface MailDeliveryReport {
  readonly delivery: MailDelivery;
  /** Le genre (rebond) ; `null` quand le fournisseur n'en dit pas. */
  readonly kind: string | null;
  /** L'instant du retour chez le fournisseur. */
  readonly at: Date;
}
