import type { MailCharter } from "./mail-charter.js";
import type { MailDocument, MailTemplateDeclaration } from "./mail-document.js";
import type { MailLocale } from "./mail-locales.js";
import type { MailEditorResources } from "./mail-resources.js";
import type { ModelSectionId } from "./model-sections.js";

/**
 * **Les contrats des routes de l'éditeur d'e-mails** (plan
 * `plan-editeur-par-blocs.md`, lot S4c ; branchées par S5a) — sous
 * `/admin/mail-templates`, derrière le droit `mail_templates`.
 *
 * Des TYPES seulement : ce paquet reste une feuille sans dépendance. La forme
 * des charges est vérifiée côté API (Zod, dans `http/`), les règles du
 * document par {@link validateMailDocument} et
 * {@link validateMailDocumentForPublication}.
 */

/** À qui l'e-mail s'adresse : la liste les range ainsi (§ 6). */
export const MAIL_AUDIENCES = ["customer", "team", "agency"] as const;
export type MailAudience = (typeof MAIL_AUDIENCES)[number];

/** Le moment d'un e-mail — la famille de son dictionnaire. */
export const MAIL_FAMILIES = ["order", "payment", "billing", "account", "team"] as const;
export type MailFamily = (typeof MAIL_FAMILIES)[number];

/** D'où vient le document que l'éditeur ouvre. */
export const MAIL_DOCUMENT_SOURCES = ["draft", "published", "starting"] as const;
export type MailDocumentSource = (typeof MAIL_DOCUMENT_SOURCES)[number];

/** Un geste daté et signé : l'identifiant INTERNE de la fiche staff. */
export interface MailEditorStamp {
  readonly at: string;
  readonly staffId: string;
}

/** Le document publié d'un e-mail : sa version, et qui l'a publié. */
export interface MailEditorPublishedView extends MailEditorStamp {
  readonly version: number;
}

/** Une ligne de la liste (`GET /admin/mail-templates`). */
export interface MailEditorListItem {
  readonly template: string;
  readonly audience: MailAudience;
  readonly family: MailFamily;
  readonly charter: MailCharter;
  readonly locales: readonly MailLocale[];
  /** `null` : l'e-mail part dans son arrangement de départ. */
  readonly published: MailEditorPublishedView | null;
  readonly hasDraft: boolean;
}

/** La liste des e-mails, dans l'ordre du registre, chacun avec son destinataire. */
export interface MailEditorListView {
  readonly mails: readonly MailEditorListItem[];
  /**
   * S5e (§ 21) : combien de phrases, toutes langues, et d'ordres de sections
   * attendent la publication de tous les e-mails
   * (`POST /admin/mail-templates/publications`) — le compte de l'écran des
   * textes. Les brouillons d'arrangement n'y entrent pas.
   */
  readonly copyPendingCount: number;
}

/** Le brouillon d'une phrase n'existe pas, remplace le texte du code, ou y revient. */
export type MailPhraseDraftState = "unchanged" | "set" | "reset";

/** Une phrase du modèle dans une langue. */
export interface MailEditorPhraseLocaleView {
  /** Le texte du code ; `null` s'il n'en a pas dans cette langue. */
  readonly default: string | null;
  readonly draftState: MailPhraseDraftState;
  readonly draftText: string | null;
  /** `null` : le texte du code part. */
  readonly publishedText: string | null;
  /** La révision lue : le verrou de l'écriture du brouillon. */
  readonly revision: number;
  /**
   * S5e (§ 21) : le texte du code a changé depuis que cette phrase a été
   * modifiée — calculé comme pour l'écran des textes. `null` : rien à signaler.
   */
  readonly defaultChangedSince: MailEditorDefaultChangeView | null;
}

/** Le texte du code tel qu'il était quand la phrase affichée a été modifiée. */
export interface MailEditorDefaultChangeView {
  readonly previousDefault: string;
}

/** Les deux cadres hors des blocs (§ 2) : l'objet et l'en-tête. */
export type MailEditorFrame = "subject" | "header";

/**
 * Où une phrase se range (S5e, § 21) : sous un bloc du modèle, ou dans un
 * cadre. Lu dans la carte des sections de l'écran des textes, jamais déduit
 * du chemin.
 */
export type MailEditorPhrasePlace =
  | { readonly kind: "block"; readonly block: ModelSectionId }
  | { readonly kind: "frame"; readonly frame: MailEditorFrame };

/**
 * **Une phrase d'un bloc du modèle**, et ses variantes (`title.paid`…) : une
 * entrée par chemin du dictionnaire. Elle s'écrit par
 * `PUT /admin/mail-templates/:template/phrases/drafts` (S4d).
 */
export interface MailEditorPhraseView {
  readonly path: string;
  readonly variables: readonly string[];
  readonly requiredVariables: readonly string[];
  readonly locales: Readonly<Record<MailLocale, MailEditorPhraseLocaleView>>;
  /** S5e : son bloc ou son cadre ; `null` — hors carte (ou orpheline). */
  readonly place: MailEditorPhrasePlace | null;
  /** S5e : QUAND elle s'affiche plutôt que ses voisines (« Commande payée par carte ») ; `null` sans alternative. */
  readonly variant: string | null;
  /** S5e : les traductions touchées AVANT le dernier geste sur le français. */
  readonly staleTranslations: readonly MailLocale[];
}

/** Un cas que l'aperçu sait rendre : un jeu de données d'exemple. */
export interface MailEditorCaseView {
  readonly id: string;
  readonly label: string;
}

/** Un e-mail ouvert dans l'éditeur (`GET /admin/mail-templates/:template`). */
export interface MailEditorView {
  readonly template: string;
  readonly audience: MailAudience;
  readonly family: MailFamily;
  readonly declaration: MailTemplateDeclaration;
  /** Le brouillon s'il y en a un, sinon le publié, sinon le document de départ. */
  readonly document: MailDocument;
  readonly source: MailDocumentSource;
  /** La révision lue (0 : rien n'a jamais été écrit) — le verrou des écritures. */
  readonly revision: number;
  readonly published: MailEditorPublishedView | null;
  readonly draft: MailEditorStamp | null;
  readonly phrases: readonly MailEditorPhraseView[];
  readonly cases: readonly MailEditorCaseView[];
  /** S5e : les phrases en base que le code ne connaît plus — lues, jamais envoyées. */
  readonly orphans: readonly MailEditorPhraseView[];
  /**
   * R1 (§ 24) : les ressources que l'e-mail fournit, avec leurs fiches.
   * Toujours servi par l'API ; facultatif dans le type le temps que l'écran
   * le lise (R2), pour ne pas casser ses doublures.
   */
  readonly resources?: MailEditorResources | undefined;
}

/** `PUT /admin/mail-templates/:template/draft` — enregistrer le brouillon. */
export interface MailDocumentDraftPayload {
  readonly document: MailDocument;
  readonly expectedRevision: number;
}

/**
 * `POST /admin/mail-templates/:template/publications` — publier l'arrangement
 * ET les phrases en attente de cet e-mail, ensemble.
 */
export interface MailDocumentPublishPayload {
  readonly expectedRevision: number;
}

/** `POST /admin/mail-templates/:template/reverts` — revenir au modèle d'origine. */
export interface MailDocumentRevertPayload {
  readonly expectedRevision: number;
}

/** Ce que rendent « Publier » et « Revenir » : la version de la publication posée. */
export interface MailDocumentPublicationView {
  readonly publicationVersion: number;
}

/** Une version publiée, dans l'historique. */
export interface MailDocumentVersionView extends MailEditorStamp {
  readonly version: number;
  /** Celle qui part aujourd'hui. */
  readonly current: boolean;
}

/** `GET /admin/mail-templates/:template/history` — du plus récent au plus ancien. */
export interface MailDocumentHistoryView {
  readonly template: string;
  readonly versions: readonly MailDocumentVersionView[];
  /** Le dernier retour au modèle d'origine, s'il y en a eu un. */
  readonly retracted: MailEditorStamp | null;
}

/**
 * `POST /admin/mail-templates/:template/previews` — l'aperçu fidèle : le
 * rendu du serveur, à la demande, jamais à chaque frappe. Sans `document`,
 * celui que l'éditeur ouvrirait ; `source` choisit les phrases (brouillons
 * ou publiées). Rien n'est écrit.
 */
export interface MailDocumentPreviewPayload {
  readonly locale: MailLocale;
  readonly source: "draft" | "published";
  readonly document?: MailDocument | undefined;
}

/** Une pièce jointe de l'aperçu : nommée, jamais servie. */
export interface MailDocumentPreviewAttachment {
  readonly filename: string;
  readonly contentType: string | null;
  readonly inline: boolean;
}

/** L'aperçu fidèle : ce qui partirait, images du corps incrustées. */
export interface MailDocumentPreviewView {
  readonly template: string;
  readonly locale: MailLocale;
  readonly subject: string;
  readonly html: string;
  readonly attachments: readonly MailDocumentPreviewAttachment[];
}

/*
 * Lot S4d (plan § 16) — ajouts seuls : les phrases d'un e-mail sous
 * `mail_templates`, et le cas que l'aperçu rend.
 */

/**
 * `POST /admin/mail-templates/:template/previews`, avec le cas à rendre : un
 * des `MailEditorView.cases` (`id`). Sans `caseId`, l'exemple de l'e-mail
 * (`"specimen"`), comme avant S4d.
 */
export interface MailDocumentCasePreviewPayload extends MailDocumentPreviewPayload {
  readonly caseId?: string | undefined;
}

/** `GET /admin/mail-templates/:template/phrases` — les phrases du modèle, relues après une écriture. */
export interface MailEditorPhrasesView {
  readonly template: string;
  readonly phrases: readonly MailEditorPhraseView[];
  /** S5e : les phrases en base que le code ne connaît plus. */
  readonly orphans: readonly MailEditorPhraseView[];
}

/**
 * `PUT /admin/mail-templates/:template/phrases/drafts` — écrire le brouillon
 * d'une phrase, sur la révision lue (`MailEditorPhraseLocaleView.revision`).
 * `204` ; `400` texte refusé (vide, variable obligatoire perdue ou inconnue),
 * `409` quelqu'un l'a écrite entre-temps. Elle part avec « Publier ».
 */
export interface MailPhraseDraftPayload {
  readonly path: string;
  readonly locale: MailLocale;
  readonly text: string;
  readonly expectedRevision: number;
}

/**
 * `POST /admin/mail-templates/:template/phrases/resets` — rétablir le texte du
 * code au prochain « Publier ». `204` ; `409` sur une révision dépassée.
 */
export interface MailPhraseResetPayload {
  readonly path: string;
  readonly locale: MailLocale;
  readonly expectedRevision: number;
}

/**
 * `POST /admin/mail-templates/:template/trials` — « M'envoyer un essai » :
 * l'e-mail rendu avec le document que l'éditeur montre (le brouillon, sinon
 * le publié, sinon celui de départ) et les phrases en brouillon, à la seule
 * adresse de l'appelant. En-tête `Idempotency-Key` obligatoire. Sans
 * `caseId`, l'exemple de l'e-mail. `204` ; `404` e-mail ou cas inconnu.
 */
export interface MailDocumentTrialPayload {
  readonly locale: MailLocale;
  readonly caseId?: string | undefined;
}

/*
 * Lot S5e (plan § 21) — ajouts seuls. La publication de tous les e-mails
 * (`POST /admin/mail-templates/publications`, sans charge) rend
 * `MailDocumentPublicationView` : la version des textes posée. Elle publie
 * les phrases et les ordres de sections en attente de TOUS les e-mails (la
 * publication de l'écran des textes) ; les brouillons d'arrangement ne
 * partent pas, chacun se publie depuis son e-mail.
 */

/**
 * `POST /admin/mail-templates/:template/trials`, avec la source des phrases :
 * `published` envoie les phrases en service. Sans `source`, les brouillons,
 * comme avant S5e. Le document reste celui que l'éditeur montre, comme pour
 * l'aperçu.
 */
export interface MailDocumentSourcedTrialPayload extends MailDocumentTrialPayload {
  readonly source?: "draft" | "published" | undefined;
}

/*
 * Lot S5f (plan § 22) — ajouts seuls : le canevas devient l'e-mail. Le
 * serveur rend chaque bloc ; l'écran n'y recopie aucun style.
 */

/**
 * `POST /admin/mail-templates/:template/block-previews` (`mail_templates:read`)
 * — le document montré, rendu bloc par bloc dans la langue et sur le cas
 * choisis, avec les phrases de la source demandée. Une lecture : un `POST`
 * parce que le document voyage dans le corps. Sans `caseId`, l'exemple de
 * l'e-mail. `400` document refusé ; `404` e-mail ou cas inconnu.
 */
export interface MailDocumentBlockPreviewPayload {
  readonly document: MailDocument;
  readonly locale: MailLocale;
  readonly source: "draft" | "published";
  readonly caseId?: string | undefined;
}

/** Le rendu d'UN bloc du document (`MailBlock.id`) ; `html` vide s'il n'a rien à montrer. */
export interface MailBlockPreviewFragment {
  readonly blockId: string;
  readonly html: string;
}

/**
 * Le document rendu en morceaux, MARQUÉS pour l'éditeur — et lui seul :
 *
 * - une phrase du dictionnaire : `<span data-phrase="<chemin>" data-variant="<variante>">`
 *   autour du texte résolu ; `data-phrase` est un `MailEditorPhraseView.path`
 *   de cet e-mail, `data-variant` sa `MailEditorPhraseView.variant` (absent
 *   quand elle vaut `null`) ;
 * - une variable placée : `<span data-var="<nom>">` autour de sa valeur d'exemple ;
 * - le texte d'un bloc libre : `<span data-free-block="<id>" data-locale="<langue>">`.
 *
 * Toute donnée est échappée par le serveur ; aucun fragment ne porte de
 * script, de gestionnaire d'événement ni de lien `javascript:`. Les images
 * du corps (`cid:`) sont incrustées en `data:`, comme dans l'aperçu fidèle.
 */
export interface MailDocumentBlockPreviewView {
  readonly template: string;
  /** La langue rendue : celle demandée si l'e-mail la parle, sinon la sienne. */
  readonly locale: MailLocale;
  /** L'objet, en HTML échappé (texte marqué). */
  readonly subject: string;
  /** Le bandeau (logo, enseigne, surtitre) dans sa table ; vide sans bandeau. */
  readonly header: string;
  /** Le recours sous son filet, dans sa table ; vide sans recours. */
  readonly footer: string;
  /** Un fragment par bloc du document, dans son ordre. */
  readonly blocks: readonly MailBlockPreviewFragment[];
}
