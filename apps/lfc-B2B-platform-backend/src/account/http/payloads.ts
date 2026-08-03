import { z } from "zod";

/**
 * Schémas de **forme** des charges utiles. Ils n'expriment aucune règle métier :
 * la validité d'un e-mail, d'un téléphone ou d'un SIRET appartient aux value
 * objects, qui la tiennent quel que soit le chemin d'entrée. Ici on ne fait que
 * refuser ce qui n'a pas la bonne structure, avec un message lisible.
 *
 * Les champs facultatifs (`enseigne`, `tvaIntracom`, `phone`) ont pour défaut la
 * chaîne vide et non `undefined` : l'absence se représente d'un seul et même
 * façon dans tout le système, du formulaire à la colonne Postgres.
 */
export const updateProfilePayload = z.object({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  phone: z.string().default(""),
});

export type UpdateProfilePayload = z.infer<typeof updateProfilePayload>;

export const createCompanyPayload = z.object({
  raisonSociale: z.string(),
  enseigne: z.string().default(""),
  formeJuridique: z.string(),
  siret: z.string(),
  tvaIntracom: z.string().default(""),
});

export type CreateCompanyPayload = z.infer<typeof createCompanyPayload>;

/**
 * Coordonnées d'un contact — même forme pour le contact principal et les
 * additionnels (cf. le value object `ContactDetails`, qui en tient les vraies
 * règles ; ici on ne valide que la structure).
 */
export const contactPayload = z.object({
  firstName: z.string(),
  lastName: z.string(),
  fonction: z.string().default(""),
  email: z.string(),
  phone: z.string().default(""),
});

export type ContactPayload = z.infer<typeof contactPayload>;

/**
 * Création d'un compte **depuis l'admin** : l'identité de la société **et** son
 * contact principal (le staff n'a pas de profil créateur d'où le dériver).
 */
export const adminCreateCompanyPayload = createCompanyPayload.extend({
  primaryContact: contactPayload,
});

export type AdminCreateCompanyPayload = z.infer<typeof adminCreateCompanyPayload>;
