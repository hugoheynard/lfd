import { z } from "zod";

/**
 * Contrat de fil des **notes du commercial** sur un compte client : la photo
 * d'une note papier, son titre et sa description, classées à la main.
 *
 * **Staff seulement.** Aucune route client ne sert ces vues : ce sont les notes
 * internes de la commerciale. La lecture exige `b2b_client_notes:read`, que
 * seuls `admin` et `commercial` reçoivent — pas `comptabilite` ni `support`,
 * qui lisent pourtant la fiche client (Hugo, 2026-09-15).
 *
 * Les bornes ci-dessous sont des COPIES que l'écran énonce ; l'agrégat et le
 * value object de la photo restent l'autorité.
 * Cf. `documentation/b2b/plan-notes-photo-du-commercial.md`.
 */

/** Cinquante notes au plus par client (Hugo, 2026-09-15). */
export const CLIENT_NOTEBOOK_MAX_NOTES = 50;

/** Le titre d'une note — une ligne lue d'un coup d'œil. */
export const CLIENT_NOTE_TITLE_MAX = 80;

/**
 * La description, facultative. Plus longue que le texte d'une étape de
 * livraison : une note papier se résume plus longuement qu'une consigne lue sur
 * le trottoir.
 */
export const CLIENT_NOTE_BODY_MAX = 2000;

/**
 * **2400 px** de grand côté : environ 200 points par pouce sur une A4, de quoi
 * zoomer dans une petite écriture. Les 1600 px des étapes n'en donnent que ~135.
 */
export const CLIENT_NOTE_PHOTO_LONG_EDGE = 2400;

/**
 * **600 Ko** par photo lisible, refusée au-delà. Une page blanche écrite se
 * compresse bien ; la borne se mesure sur de vraies photos de notes (plan,
 * D7 bis) — Hugo : « ça me paraît énorme 2 Mo pour du web, même 1 Mo pour les
 * images en livraison ».
 */
export const CLIENT_NOTE_PHOTO_MAX_BYTES = 600 * 1024;

/** Le grand côté de la vignette, fabriquée par l'écran au même envoi. */
export const CLIENT_NOTE_THUMBNAIL_LONG_EDGE = 320;

/**
 * **60 Ko** par vignette : la liste ne charge qu'elles, et cinquante notes
 * restent sous 3 Mo au pire.
 */
export const CLIENT_NOTE_THUMBNAIL_MAX_BYTES = 60 * 1024;

/** Une note, telle qu'on la lit. */
export interface ClientNoteView {
  readonly id: string;
  /** Le rang affiché, à partir de 1. */
  readonly number: number;
  readonly title: string;
  /** Chaîne vide quand la note n'a pas de description. */
  readonly body: string;
  /**
   * Change à chaque photo déposée, `null` sans photo. La photo lisible et sa
   * vignette partagent la même révision : elles sont rangées ensemble.
   */
  readonly photoRevision: string | null;
  /** ISO. Le dépôt de la note — pas la date de la note papier, qui n'est pas saisie. */
  readonly createdAt: string;
  /** Qui l'a déposée, figé au dépôt. */
  readonly createdByName: string;
}

/** Le carnet d'un client. Sans note, `notes` est vide. */
export interface ClientNotebookView {
  readonly companyId: string;
  readonly notes: readonly ClientNoteView[];
}

/**
 * Les champs texte d'une note, envoyés en **multipart** avec, facultativement,
 * deux fichiers : `photo` (la lisible) et `thumbnail` (sa vignette). L'un ne va
 * pas sans l'autre.
 */
export const clientNoteFieldsSchema = z.object({
  title: z.string().trim().min(1, "titre requis").max(CLIENT_NOTE_TITLE_MAX),
  body: z.string().trim().max(CLIENT_NOTE_BODY_MAX).default(""),
});
export type ClientNoteFields = z.infer<typeof clientNoteFieldsSchema>;

/**
 * Les champs d'une note qu'on refait. `removePhoto: "true"` retire la photo et
 * sa vignette ; une paire de fichiers joints les remplace. Les deux ensemble
 * sont refusés : l'intention serait illisible.
 *
 * Chaîne et non booléen : un champ multipart est toujours une chaîne.
 */
export const clientNoteRevisionFieldsSchema = clientNoteFieldsSchema.extend({
  removePhoto: z.enum(["true", "false"]).default("false"),
});
export type ClientNoteRevisionFields = z.infer<typeof clientNoteRevisionFieldsSchema>;

/**
 * Le nouvel ordre : TOUS les identifiants des notes, chacun une fois. Une liste
 * qui ne correspond pas exactement au carnet en base est refusée plutôt que
 * devinée.
 */
export const clientNotebookOrderPayloadSchema = z.object({
  noteIds: z.array(z.string().min(1)).min(1).max(CLIENT_NOTEBOOK_MAX_NOTES),
});
export type ClientNotebookOrderPayload = z.infer<typeof clientNotebookOrderPayloadSchema>;

/** Réponse de création d'une note : son identifiant. */
export interface CreatedClientNoteResponse {
  readonly id: string;
}
