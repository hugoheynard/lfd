import type { CustomerAudience } from "./customer-audience.js";

/**
 * **« Nous écrire »** — les objets de contact, la carte de contact et les
 * messages, sans zod (`documentation/contenu-ecommerce/nous-contacter.md`).
 *
 * Séparé de `contact.ts` pour la raison de poids de `order-opening.values.ts` :
 * la boutique lit la carte et les objets au démarrage, et le baril
 * embarquerait zod dans son bundle initial. Un front les importe par
 * `@lfd/contracts/shop-values`.
 */

/** À qui un objet est proposé : les pros, les particuliers, ou les deux. */
export type ContactSubjectAudience = CustomerAudience | "both";

export const CONTACT_SUBJECT_AUDIENCES: readonly ContactSubjectAudience[] = ["b2b", "b2c", "both"];

/**
 * **La priorité d'un objet**, à usage interne (Hugo, 2026-10-09) : elle trie
 * les messages « à traiter » et n'est JAMAIS servie à la boutique. Un message
 * fige celle de son objet à la réception.
 */
export type ContactPriority = "low" | "medium" | "urgent";

export const CONTACT_PRIORITIES: readonly ContactPriority[] = ["low", "medium", "urgent"];

/** Un texte en trois langues. `fr` est la langue de repli ; `en` / `it` vides retombent dessus. */
export interface ContactLocalizedText {
  readonly fr: string;
  readonly en: string;
  readonly it: string;
}

/** Bornes de saisie — les mêmes au contrat (forme) et au domaine (règle). */
export const CONTACT_BOUNDS = {
  subjectLabel: 80,
  recipientEmail: 254,
  authorName: 120,
  authorEmail: 254,
  authorPhone: 30,
  message: 4000,
  settingsPhone: 30,
  cardKicker: 60,
  cardTitle: 120,
  cardBody: 400,
  phoneLabel: 80,
} as const;

/** L'objet tel que le back-office le règle (`GET /admin/contact/subjects`). */
export interface ContactSubjectView {
  readonly id: string;
  readonly label: ContactLocalizedText;
  readonly recipientEmail: string;
  readonly position: number;
  readonly active: boolean;
  readonly audience: ContactSubjectAudience;
  readonly priority: ContactPriority;
}

/**
 * L'objet tel que la boutique le propose (`GET /contact-subjects?audience=`) :
 * un objet ACTIF, visible pour ce public, sans son adresse de destination —
 * elle ne regarde que l'équipe.
 */
export interface PublicContactSubjectView {
  readonly id: string;
  readonly label: ContactLocalizedText;
}

/** Le texte d'une carte de contact. Vide = le texte du dictionnaire de la boutique. */
export interface ContactCardText {
  /** Le surtitre (« On répond » à la boutique). Vide = le texte de la boutique. */
  readonly kicker: ContactLocalizedText;
  readonly title: ContactLocalizedText;
  readonly body: ContactLocalizedText;
}

/**
 * Un **numéro de contact** au back-office (`GET /admin/contact/phones`) :
 * ce qu'on lit à côté (« Boutique de Val d'Isère », « Service commercial »),
 * le numéro tel que saisi, son public, son rang (Hugo, 2026-10-09).
 */
export interface ContactPhoneView {
  readonly id: string;
  readonly label: ContactLocalizedText;
  readonly number: string;
  readonly audience: ContactSubjectAudience;
  readonly position: number;
  readonly active: boolean;
}

/** Un numéro tel que la boutique l'affiche : actif, non archivé, déjà dans l'ordre. */
export interface PublicContactPhoneView {
  readonly label: ContactLocalizedText;
  /** Tel que saisi ; la boutique en fait un `tel:` en ne gardant que `+` et les chiffres. */
  readonly number: string;
  /** La boutique ne montre que `both` et le public de l'espace courant. */
  readonly audience: ContactSubjectAudience;
}

/** La carte de contact de la boutique, telle que la route publique la sert (`GET /contact-settings`). */
export interface PublicContactSettingsView {
  /** Les numéros actifs, par rang. Vide = le numéro du dictionnaire. */
  readonly phones: readonly PublicContactPhoneView[];
  readonly cards: { readonly b2b: ContactCardText; readonly b2c: ContactCardText };
}

/**
 * La même, pour le back-office : les textes des cartes, avec l'instant et
 * l'auteur du dernier geste. Les numéros se règlent à part
 * (`/admin/contact/phones`).
 */
export interface ContactSettingsView {
  readonly cards: PublicContactSettingsView["cards"];
  /** `null` tant que personne n'a rien réglé. */
  readonly updatedAt: string | null;
  readonly updatedBy: string | null;
}

const EMPTY_TEXT: ContactLocalizedText = { fr: "", en: "", it: "" };
const EMPTY_CARD: ContactCardText = { kicker: EMPTY_TEXT, title: EMPTY_TEXT, body: EMPTY_TEXT };

/** Le réglage tant que personne ne l'a posé : tout vide, la boutique garde ses textes. */
export const DEFAULT_CONTACT_SETTINGS: ContactSettingsView = {
  cards: { b2b: EMPTY_CARD, b2c: EMPTY_CARD },
  updatedAt: null,
  updatedBy: null,
};

/** L'état d'un message au back-office. */
export type ContactMessageStatus = "pending" | "handled";

/**
 * Un message reçu, au back-office (`GET /admin/contact/messages?status=`).
 *
 * Anonymisé (`anonymizedAt` posé) : nom, e-mail, téléphone et texte sont vides ;
 * l'objet et les dates restent.
 */
export interface ContactMessageView {
  readonly id: string;
  readonly subjectId: string;
  /** Le libellé français de l'objet, figé à la réception. */
  readonly subjectLabel: string;
  /** La priorité de l'objet, figée à la réception. */
  readonly priority: ContactPriority;
  readonly audience: CustomerAudience;
  readonly authorName: string;
  readonly authorEmail: string;
  /** Vide quand l'auteur ne l'a pas donné. */
  readonly authorPhone: string;
  readonly message: string;
  /** Le client connecté qui a écrit, `null` pour un visiteur. */
  readonly userId: string | null;
  /** La société au nom de laquelle il agissait, `null` sinon. */
  readonly companyId: string | null;
  readonly receivedAt: string;
  readonly handledAt: string | null;
  /** Nom figé de qui l'a traité ; `null` s'il n'est pas traité ou si l'annuaire ne le connaissait pas. */
  readonly handledBy: string | null;
  readonly anonymizedAt: string | null;
}
