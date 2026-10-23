import { z } from "zod";

import { contentLocaleSchema, type ContentLocale } from "./platform-content.js";

/**
 * **Les textes des e-mails** — des remplacements du texte du code, par e-mail,
 * par texte et par langue (`documentation/contenu-ecommerce/plan-textes-des-e-mails.md`,
 * C2 à C8, lot E2).
 *
 * 🔴 Ces schémas ne disent que la FORME. Ce qui fait la validité d'un texte —
 * e-mail et chemin connus, aucune variable obligatoire perdue, aucune
 * inconnue — dépend du dictionnaire que l'API embarque, et c'est le domaine
 * qui le refuse (`400`, avec la liste des variables permises).
 */

/** Une clé du registre des e-mails (`customer.order-placed`), bornée. */
const mailKeySchema = z.string().trim().min(1).max(100);
/** Le chemin d'un texte dans son e-mail (`subject`, `title.paid`), borné. */
const mailPathSchema = z.string().trim().min(1).max(200);
/** La révision du texte que l'écran a lue — 0 pour un texte jamais touché. */
const expectedRevisionSchema = z.number().int().min(0);

/** Écrire le brouillon d'un texte (`PUT /admin/mail-copy/drafts`). */
export const mailCopyDraftPayloadSchema = z.object({
  mail: mailKeySchema,
  path: mailPathSchema,
  locale: contentLocaleSchema,
  text: z.string(),
  expectedRevision: expectedRevisionSchema,
});
export type MailCopyDraftPayload = z.infer<typeof mailCopyDraftPayloadSchema>;

/** Rétablir le texte du code au prochain « Publier » (`POST /admin/mail-copy/resets`). */
export const mailCopyResetPayloadSchema = z.object({
  mail: mailKeySchema,
  path: mailPathSchema,
  locale: contentLocaleSchema,
  expectedRevision: expectedRevisionSchema,
});
export type MailCopyResetPayload = z.infer<typeof mailCopyResetPayloadSchema>;

/** L'identifiant d'une section du corps d'un e-mail (`title`, `summary`…), borné. */
const mailSectionIdSchema = z.string().trim().min(1).max(40);

/**
 * Poser en brouillon l'ordre des sections d'un e-mail
 * (`PUT /admin/mail-copy/section-orders`, plan §3, E4). TOUTES ses sections,
 * une fois chacune, sans l'en-tête ni le recours : c'est le domaine qui le
 * refuse (`400`, avec la liste attendue).
 */
export const mailSectionOrderDraftPayloadSchema = z.object({
  mail: mailKeySchema,
  order: z.array(mailSectionIdSchema).min(1).max(20),
  expectedRevision: expectedRevisionSchema,
});
export type MailSectionOrderDraftPayload = z.infer<typeof mailSectionOrderDraftPayloadSchema>;

/** Rétablir l'ordre du code au prochain « Publier » (`POST /admin/mail-copy/section-order-resets`). */
export const mailSectionOrderResetPayloadSchema = z.object({
  mail: mailKeySchema,
  expectedRevision: expectedRevisionSchema,
});
export type MailSectionOrderResetPayload = z.infer<typeof mailSectionOrderResetPayloadSchema>;

/** Les textes d'un aperçu ou d'un essai : les brouillons, ou ce qui part aujourd'hui. */
export const MAIL_COPY_SOURCES = ["draft", "published"] as const;
export type MailCopySource = (typeof MAIL_COPY_SOURCES)[number];

/** L'aperçu d'un e-mail (`GET /admin/mail-copy/previews?mail=…&locale=…&source=…`). */
export const mailCopyPreviewQuerySchema = z.object({
  mail: mailKeySchema,
  locale: contentLocaleSchema,
  source: z.enum(MAIL_COPY_SOURCES).default("draft"),
});
export type MailCopyPreviewQuery = z.infer<typeof mailCopyPreviewQuerySchema>;

/** « M'envoyer un essai » (`POST /admin/mail-copy/trials`) — à la seule adresse de l'appelant. */
export const mailCopyTrialPayloadSchema = z.object({
  mail: mailKeySchema,
  locale: contentLocaleSchema,
  source: z.enum(MAIL_COPY_SOURCES).default("draft"),
});
export type MailCopyTrialPayload = z.infer<typeof mailCopyTrialPayloadSchema>;

/** Les trois états d'un brouillon. */
export const MAIL_COPY_DRAFT_STATES = ["unchanged", "set", "reset"] as const;
export type MailCopyDraftState = (typeof MAIL_COPY_DRAFT_STATES)[number];

/** À qui un e-mail s'adresse (C8) — le premier rangement de l'écran. */
export type MailAudience = "customer" | "team" | "agency";
/** Le moment d'un e-mail (C8) — le second rangement. */
export type MailFamily = "order" | "payment" | "billing" | "account" | "team";

/** Un texte dans une langue, tel que l'éditeur le voit. */
export interface MailCopyLocaleView {
  /** Le texte du code — `null` pour une orpheline, que le code ne connaît plus. */
  readonly default: string | null;
  readonly draftState: MailCopyDraftState;
  readonly draftText: string | null;
  readonly publishedText: string | null;
  /** 0 tant que personne n'a écrit ce texte : la révision à renvoyer. */
  readonly revision: number;
  readonly draftAt: string | null;
  readonly draftBy: string | null;
  /**
   * Le texte du code a changé depuis que ce texte a été modifié (brouillon qui
   * remplace, sinon publié) : `previousDefault` est le texte du code d'alors,
   * `default` celui d'aujourd'hui. `null` : rien à signaler, ou inconnu.
   * Un avertissement — « Publier » reste permis ; « Rétablir », réécrire le
   * brouillon ou publier le font disparaître.
   */
  readonly defaultChangedSince: MailCopyDefaultChangeView | null;
}

/** Le texte du code tel qu'il était quand le texte affiché a été modifié. */
export interface MailCopyDefaultChangeView {
  readonly previousDefault: string;
}

/** Un texte d'un e-mail et ses trois langues. */
export interface MailCopyTextView {
  readonly mail: string;
  readonly path: string;
  /** Les `{variables}` permises — les seules qu'un texte réécrit peut employer. */
  readonly variables: readonly string[];
  /** Celles qu'aucun texte réécrit ne peut perdre. */
  readonly requiredVariables: readonly string[];
  readonly locales: Readonly<Record<ContentLocale, MailCopyLocaleView>>;
  /** Les traductions touchées AVANT le dernier geste sur le français (C4). */
  readonly staleTranslations: readonly ContentLocale[];
}

/**
 * La nature d'une section (E4, S1) : `text` — ses textes la font ;
 * `system` — les données la produisent (QR, récapitulatif, liens), seuls ses
 * libellés se réécrivent. L'écran pose un badge sur la seconde.
 */
export type MailSectionNature = "text" | "system";

/**
 * Un texte rattaché à une section ou à un cadre. `variant` : QUAND il
 * s'affiche plutôt que ses voisins (« Commande payée par carte », S6) —
 * `null` pour un texte sans alternative. Le libellé est écrit côté serveur, à
 * côté du gabarit qui choisit la variante.
 */
export interface MailSectionTextView {
  readonly path: string;
  readonly variant: string | null;
}

/** Une section d'un e-mail et ses positions (0 = la première sous l'en-tête). */
export interface MailSectionView {
  /** L'identifiant, repris par `data-mail-section` dans l'aperçu. */
  readonly id: string;
  readonly label: string;
  readonly nature: MailSectionNature;
  readonly texts: readonly MailSectionTextView[];
  /** Dans l'ordre du code. */
  readonly defaultPosition: number;
  /** Dans ce qui part aujourd'hui. */
  readonly publishedPosition: number;
  /** Dans ce qui partira après « Publier ». */
  readonly draftPosition: number;
}

/** L'ordre des sections d'un e-mail, tel que l'éditeur le lit et le réécrit. */
export interface MailSectionOrderView {
  readonly draftState: MailCopyDraftState;
  /** 0 tant que personne n'a déplacé ces sections : la révision à renvoyer. */
  readonly revision: number;
  /** L'ordre du code. */
  readonly default: readonly string[];
  /** L'ordre publié — `null` : celui du code. */
  readonly published: readonly string[] | null;
  /** L'ordre en brouillon — `null` hors de l'état `set`. */
  readonly draft: readonly string[] | null;
  readonly draftAt: string | null;
  readonly draftBy: string | null;
}

/** Un e-mail du registre et ses textes. */
export interface MailCopyMailView {
  /** La clé du registre (`customer.order-placed`). */
  readonly mail: string;
  readonly audience: MailAudience;
  readonly family: MailFamily;
  /**
   * Part-il dans la langue du destinataire ? `false` : il part en français,
   * et ses textes anglais et italiens attendent le jour où la langue d'un
   * client existera (`plan-textes-des-e-mails.md`, §3).
   */
  readonly followsLocale: boolean;
  /** Combien de ses textes, toutes langues, et de son ordre attendent « Publier ». */
  readonly pendingCount: number;
  readonly texts: readonly MailCopyTextView[];
  /**
   * Les deux cadres immobiles (E4, S2) : l'objet et l'en-tête. Le recours
   * (l'adresse de l'admin) n'a pas de texte au dictionnaire.
   */
  readonly frames: {
    readonly subject: readonly MailSectionTextView[];
    readonly header: readonly MailSectionTextView[];
  };
  /** Ses sections, dans l'ordre du brouillon — ce qui partira après « Publier ». */
  readonly sections: readonly MailSectionView[];
  readonly sectionOrder: MailSectionOrderView;
}

/** L'écran des textes des e-mails. */
export interface MailCopyAdminView {
  readonly version: number;
  readonly publishedAt: string | null;
  readonly publishedBy: string | null;
  /** Combien de textes, toutes langues, et d'ordres de sections attendent « Publier ». */
  readonly pendingCount: number;
  /** Combien de textes, toutes langues, portent `defaultChangedSince`. */
  readonly defaultChangedCount: number;
  readonly mails: readonly MailCopyMailView[];
  /** Textes en base que le code ne connaît plus : lus, jamais envoyés. */
  readonly orphans: readonly MailCopyTextView[];
}

/** Ce que « Publier » rend : la version posée. */
export interface MailCopyPublishedView {
  readonly version: number;
}

/** Une pièce jointe de l'aperçu : nommée, jamais servie. */
export interface MailCopyPreviewAttachmentView {
  readonly filename: string;
  readonly contentType: string | null;
  /** Une image du corps, déjà incrustée dans `html`. */
  readonly inline: boolean;
}

/**
 * L'aperçu d'un e-mail : son VRAI gabarit, rendu avec des données d'exemple
 * marquées « EXEMPLE » (C6). Rien n'a été écrit ni envoyé pour le produire.
 */
export interface MailCopyPreviewView {
  readonly mail: string;
  readonly locale: ContentLocale;
  readonly source: MailCopySource;
  readonly subject: string;
  /**
   * Le HTML complet, à poser dans un cadre isolé (`<iframe srcdoc>` sandboxé).
   * Repéré (E4, S4) : chaque section rendue est dans un
   * `<div data-mail-section="<id>">`, chaque texte du dictionnaire dans un
   * `<span data-mail-text="<chemin>" data-mail-text-of="<e-mail>">` — un
   * texte emprunté à un autre e-mail le dit par `data-mail-text-of`. Ces
   * repères n'existent QUE dans l'aperçu.
   */
  readonly html: string;
  readonly attachments: readonly MailCopyPreviewAttachmentView[];
}
