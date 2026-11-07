import type { MailCharter } from "./mail-charter.js";
import type { MailDocument, MailTemplateDeclaration } from "./mail-document.js";
import type { MailLocale } from "./mail-locales.js";

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
}

/**
 * **Une phrase d'un bloc du modèle**, et ses variantes (`title.paid`…) : une
 * entrée par chemin du dictionnaire. Elle s'écrit aujourd'hui par
 * `PUT /admin/mail-copy/drafts` (voir le plan, S4c).
 */
export interface MailEditorPhraseView {
  readonly path: string;
  readonly variables: readonly string[];
  readonly requiredVariables: readonly string[];
  readonly locales: Readonly<Record<MailLocale, MailEditorPhraseLocaleView>>;
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
