import { z } from "zod";

/**
 * Contrat de fil de la **procédure de livraison** d'une adresse : les étapes
 * qu'un livreur suit pour déposer la marchandise (entrer par la cour, code du
 * portail, deuxième porte à gauche…).
 *
 * Une procédure appartient à UNE adresse de livraison. Ses étapes sont
 * ordonnées ; leur numéro n'est jamais saisi, il se déduit du rang — un numéro
 * saisi à la main se contredirait au premier réordonnancement.
 *
 * Les bornes ci-dessous sont des COPIES que l'écran énonce ; l'agrégat
 * `DeliveryProcedure` et le value object de la photo restent l'autorité.
 */

/** Au plus vingt étapes : au-delà, ce n'est plus une consigne qu'on lit sur le trottoir. */
export const DELIVERY_PROCEDURE_MAX_STEPS = 20;

/** Le titre d'une étape — une ligne lue d'un coup d'œil. */
export const DELIVERY_STEP_TITLE_MAX = 80;

/** Le texte d'une étape, facultatif. */
export const DELIVERY_STEP_BODY_MAX = 1000;

/**
 * **1 Mo** par photo, refusé au-delà par le serveur. L'écran réduit la photo
 * AVANT de l'envoyer ({@link DELIVERY_STEP_PHOTO_LONG_EDGE}), si bien qu'une
 * photo de téléphone arrive autour de 200 à 400 Ko.
 */
export const DELIVERY_STEP_PHOTO_MAX_BYTES = 1024 * 1024;

/** Le grand côté, en pixels, auquel l'écran réduit une photo avant l'envoi. */
export const DELIVERY_STEP_PHOTO_LONG_EDGE = 1600;

/** Une étape, telle qu'on la lit. */
export interface DeliveryProcedureStepView {
  readonly id: string;
  /** Le rang affiché, à partir de 1. */
  readonly number: number;
  readonly title: string;
  /** Chaîne vide quand l'étape n'a pas de texte. */
  readonly body: string;
  /**
   * Change à chaque photo déposée, `null` sans photo. Sert à invalider l'image
   * affichée : la route de la photo ne change pas, son contenu si.
   */
  readonly photoRevision: string | null;
}

/** La procédure d'une adresse de livraison. Sans étape, `steps` est vide. */
export interface DeliveryProcedureView {
  readonly addressId: string;
  readonly steps: readonly DeliveryProcedureStepView[];
}

/**
 * Les champs texte d'une étape, envoyés en **multipart** avec la photo
 * (champ fichier `photo`, facultatif).
 */
export const deliveryStepFieldsSchema = z.object({
  title: z.string().trim().min(1, "titre requis").max(DELIVERY_STEP_TITLE_MAX),
  body: z.string().trim().max(DELIVERY_STEP_BODY_MAX).default(""),
});
export type DeliveryStepFields = z.infer<typeof deliveryStepFieldsSchema>;

/**
 * Les champs d'une étape qu'on refait. `removePhoto: "true"` retire la photo
 * existante ; un fichier `photo` joint la remplace. Les deux ensemble sont
 * refusés : l'intention serait illisible.
 *
 * Chaîne et non booléen : un champ multipart est toujours une chaîne.
 */
export const deliveryStepRevisionFieldsSchema = deliveryStepFieldsSchema.extend({
  removePhoto: z.enum(["true", "false"]).default("false"),
});
export type DeliveryStepRevisionFields = z.infer<typeof deliveryStepRevisionFieldsSchema>;

/**
 * Le nouvel ordre : TOUS les identifiants des étapes, chacun une fois. Une liste
 * qui ne correspond pas exactement aux étapes en base (une étape ajoutée ou
 * supprimée entre-temps par quelqu'un d'autre) est refusée plutôt que devinée.
 */
export const deliveryProcedureOrderPayloadSchema = z.object({
  stepIds: z.array(z.string().min(1)).min(1).max(DELIVERY_PROCEDURE_MAX_STEPS),
});
export type DeliveryProcedureOrderPayload = z.infer<typeof deliveryProcedureOrderPayloadSchema>;

/** Réponse de création d'une étape : son identifiant. */
export interface CreatedDeliveryStepResponse {
  readonly id: string;
}
