import type { CustomerAudience } from "./customer-audience.js";

/**
 * **Les demandes clients** — motifs, demandes, carte de contact et numéros,
 * sans zod (`documentation/contenu-ecommerce/demandes-clients.md`).
 *
 * Séparé de `contact.ts` pour la raison de poids de `order-opening.values.ts` :
 * la boutique lit la carte et les motifs au démarrage, et le baril
 * embarquerait zod dans son bundle initial. Un front les importe par
 * `@lfd/contracts/shop-values`.
 */

/** À qui un motif ou un numéro est proposé : les pros, les particuliers, ou les deux. */
export type ContactAudience = CustomerAudience | "both";

export const CONTACT_AUDIENCES: readonly ContactAudience[] = ["b2b", "b2c", "both"];

/**
 * **Le type d'une demande** — le formulaire d'où elle vient
 * (`demandes-clients.md`, 2026-10-09). Un type à venir (rendez-vous,
 * devis) est une valeur de plus, un onglet de motifs de plus, et une variante
 * de plus de {@link CustomerRequestDetailsView}.
 */
export type RequestKind = "contact" | "order_problem";

export const REQUEST_KINDS: readonly RequestKind[] = ["contact", "order_problem"];

/**
 * **La priorité d'un motif**, à usage interne (Hugo, 2026-10-09) : elle trie
 * les demandes « à traiter » et n'est JAMAIS servie à la boutique. Une
 * demande fige celle de son motif à la réception.
 */
export type RequestPriority = "low" | "medium" | "urgent";

export const REQUEST_PRIORITIES: readonly RequestPriority[] = ["low", "medium", "urgent"];

/** Un texte en trois langues. `fr` est la langue de repli ; `en` / `it` vides retombent dessus. */
export interface ContactLocalizedText {
  readonly fr: string;
  readonly en: string;
  readonly it: string;
}

/** Bornes de saisie — les mêmes au contrat (forme) et au domaine (règle). */
export const CONTACT_BOUNDS = {
  reasonLabel: 80,
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

/**
 * **Les photos d'un signalement de problème** (Hugo, 2026-10-09) : trois au
 * plus, JPEG, PNG ou WebP, 5 Mo chacune. Le domaine les refuse au-delà ;
 * le front s'en sert pour prévenir avant l'envoi.
 */
export const REQUEST_PHOTO_BOUNDS = {
  maxCount: 3,
  maxBytes: 5 * 1024 * 1024,
  contentTypes: ["image/jpeg", "image/png", "image/webp"],
} as const;

/** Le motif tel que le back-office le règle (`GET /admin/request-reasons?kind=`). */
export interface RequestReasonView {
  readonly id: string;
  readonly kind: RequestKind;
  readonly label: ContactLocalizedText;
  readonly recipientEmail: string;
  readonly position: number;
  readonly active: boolean;
  readonly audience: ContactAudience;
  readonly priority: RequestPriority;
}

/**
 * Le motif tel que la boutique le propose (`GET /request-reasons?kind=&audience=`) :
 * un motif ACTIF de ce formulaire, visible pour ce public, sans son adresse
 * de destination ni sa priorité — elles ne regardent que l'équipe.
 */
export interface PublicRequestReasonView {
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
  readonly audience: ContactAudience;
  readonly position: number;
  readonly active: boolean;
}

/** Un numéro tel que la boutique l'affiche : actif, non archivé, déjà dans l'ordre. */
export interface PublicContactPhoneView {
  readonly label: ContactLocalizedText;
  /** Tel que saisi ; la boutique en fait un `tel:` en ne gardant que `+` et les chiffres. */
  readonly number: string;
  /** La boutique ne montre que `both` et le public de l'espace courant. */
  readonly audience: ContactAudience;
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

/** L'état d'une demande au back-office. */
export type CustomerRequestStatus = "pending" | "handled";

/** Une photo d'un signalement, servie par `GET /admin/customer-requests/:id/photos/:photoId`. */
export interface CustomerRequestPhotoView {
  readonly id: string;
  readonly position: number;
}

/** Les détails d'une demande « Nous écrire » : aucun au-delà de l'enveloppe. */
export interface ContactRequestDetailsView {
  readonly kind: "contact";
}

/**
 * Les détails d'un signalement de problème : la commande et ses photos.
 * Anonymisé : `orderId` et `orderNumber` à `null`, `photos` vide.
 */
export interface OrderProblemDetailsView {
  readonly kind: "order_problem";
  readonly orderId: string | null;
  /** Le numéro figé à la réception (`CMD-…`). */
  readonly orderNumber: string | null;
  readonly photos: readonly CustomerRequestPhotoView[];
}

/** Les détails PROPRES au type, discriminés par `kind`. Un type neuf = une variante de plus. */
export type CustomerRequestDetailsView = ContactRequestDetailsView | OrderProblemDetailsView;

/**
 * Une demande reçue, au back-office (`GET /admin/customer-requests?status=&kind=`) :
 * l'ENVELOPPE commune à tous les types, et ses `details`.
 *
 * Anonymisée (`anonymizedAt` posé) : nom, e-mail, téléphone, texte et
 * rattachements sont vides ; le motif et les dates restent.
 */
export interface CustomerRequestView {
  readonly id: string;
  readonly kind: RequestKind;
  readonly reasonId: string;
  /** Le libellé français du motif, figé à la réception. */
  readonly reasonLabel: string;
  /** La priorité du motif, figée à la réception. */
  readonly priority: RequestPriority;
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
  /** Nom figé de qui l'a traitée ; `null` si non traitée ou inconnu de l'annuaire. */
  readonly handledBy: string | null;
  readonly anonymizedAt: string | null;
  readonly details: CustomerRequestDetailsView;
}

/** Un texte de carte de repli : titre et phrase, sans surtitre. */
export interface ContactCardFallback {
  readonly title: ContactLocalizedText;
  readonly body: ContactLocalizedText;
}

/**
 * **Les replis de la carte de contact, à UN endroit** (Hugo, 2026-10-09) : ce
 * que la boutique affiche quand le back-office laisse un champ vide. Recopiés
 * des dictionnaires de la boutique (`accueil-public.copy.ts`, §contact, le
 * 2026-10-09) pour que les deux fronts lisent la même source.
 *
 * 🔴 **Pas de surtitre** : « si pas de surtitre en admin, pas de fallback en
 * front » (Hugo). Un surtitre vide ne s'affiche pas.
 */
export const CONTACT_CARD_DEFAULTS: {
  readonly phone: string;
  readonly cards: { readonly b2b: ContactCardFallback; readonly b2c: ContactCardFallback };
} = {
  phone: "+33 4 79 06 12 40",
  cards: {
    b2b: {
      title: { fr: "Nous contacter", en: "Contact us", it: "Contattaci" },
      body: {
        fr: "Nos équipes commerciales sont à votre écoute",
        en: "Our sales team is here for you",
        it: "Il nostro team commerciale è a vostra disposizione",
      },
    },
    b2c: {
      title: { fr: "Nous contacter", en: "Contact us", it: "Contattaci" },
      body: {
        fr: "On répond au plus vite",
        en: "We reply as soon as we can",
        it: "Rispondiamo il prima possibile",
      },
    },
  },
};
