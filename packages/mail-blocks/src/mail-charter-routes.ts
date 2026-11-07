import type { MailCharterSettings } from "./charter-settings.js";
import type { MailEditorStamp } from "./mail-editor-routes.js";
import type { MailLocale } from "./mail-locales.js";
import type { MailSpace } from "./mail-spaces.js";

/**
 * **Les routes de la charte d'un espace** (plan `plan-editeur-par-blocs.md`,
 * § 25, C1) — sous le droit `mail_templates`, comme les e-mails. Types
 * seulement : la forme est vérifiée par Zod dans `http/` côté API.
 */

/** D'où vient la charte que l'écran ouvre. */
export type MailCharterSource = "draft" | "published" | "starting";

/** La charte publiée d'un espace : sa version, et qui l'a publiée. */
export interface MailCharterPublishedView extends MailEditorStamp {
  readonly version: number;
  readonly settings: MailCharterSettings;
}

/** `GET /admin/mail-charters/:space` — rien n'est écrit. */
export interface MailCharterView {
  readonly space: MailSpace;
  /** Les e-mails de l'espace, clés du registre, dans l'ordre du registre. */
  readonly templates: readonly string[];
  /** Les langues de l'espace : celles de ses e-mails — le logo et le pied s'y écrivent. */
  readonly locales: readonly MailLocale[];
  /** Le brouillon s'il y en a un, sinon la publiée, sinon celle de départ. */
  readonly settings: MailCharterSettings;
  readonly source: MailCharterSource;
  /** La charte de départ : celle d'aujourd'hui, tirée des constantes du rendu. */
  readonly starting: MailCharterSettings;
  /** La révision lue (0 : rien n'a jamais été écrit) — le verrou des écritures. */
  readonly revision: number;
  readonly published: MailCharterPublishedView | null;
  readonly draft: MailEditorStamp | null;
}

/** `PUT /admin/mail-charters/:space/draft` — 204 ; 400 refus, 409 révision dépassée. */
export interface MailCharterDraftPayload {
  readonly settings: MailCharterSettings;
  readonly expectedRevision: number;
}

/** `POST /admin/mail-charters/:space/publications` — 201, `MailCharterPublicationView`. */
export interface MailCharterPublishPayload {
  readonly expectedRevision: number;
}

/**
 * Ce que la publication pose : la version de la charte, et celle des textes
 * des e-mails — l'estampille du cache de l'envoi, qui fait voir la charte aux
 * autres instances.
 */
export interface MailCharterPublicationView {
  readonly version: number;
  readonly publicationVersion: number;
}

/** Une version publiée de la charte, dans l'historique. */
export interface MailCharterVersionView extends MailEditorStamp {
  readonly version: number;
  /** Celle qui sert aujourd'hui. */
  readonly current: boolean;
  readonly settings: MailCharterSettings;
}

/** `GET /admin/mail-charters/:space/history` — du plus récent au plus ancien. */
export interface MailCharterHistoryView {
  readonly space: MailSpace;
  readonly versions: readonly MailCharterVersionView[];
}

/**
 * `POST /admin/mail-charters/:space/previews` (200) — un e-mail de l'espace
 * rendu avec la charte donnée (`settings`), sinon celle que l'écran ouvrirait.
 * Sans `template`, le premier e-mail de l'espace. Rien n'est écrit, et le
 * logo n'est pas copié : l'aperçu montre l'adresse d'origine.
 */
export interface MailCharterPreviewPayload {
  readonly template?: string | undefined;
  readonly locale: MailLocale;
  readonly settings?: MailCharterSettings | undefined;
}

/** L'aperçu : l'e-mail tel qu'il partirait sous cette charte. */
export interface MailCharterPreviewView {
  readonly space: MailSpace;
  readonly template: string;
  readonly locale: MailLocale;
  readonly subject: string;
  readonly html: string;
}
