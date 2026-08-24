import { assignableRoleSchema } from "@lfd/contracts";
import { z } from "zod";

/**
 * Schémas de **forme** des charges utiles. Ils n'expriment aucune règle métier :
 * la validité d'un e-mail, d'un téléphone ou d'un SIRET appartient aux value
 * objects, qui la tiennent quel que soit le chemin d'entrée. Ici on ne fait que
 * refuser ce qui n'a pas la bonne structure, avec un message lisible.
 *
 * Les champs facultatifs (`enseigne`, `vatNumber`, `phone`) ont pour défaut la
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

/**
 * Préférence d'affichage du catalogue. Union fermée : le front n'a que ces trois
 * vues, et une valeur hors-liste n'aurait aucun sens à persister.
 */
export const updateNavPrefsPayload = z.object({
  catalogueView: z.enum(["cards", "shelves", "list"]),
});

export type UpdateNavPrefsPayload = z.infer<typeof updateNavPrefsPayload>;

/**
 * Aucun champ n'est exigé **ici** : c'est l'agrégat qui tient le minimum, et il
 * demande l'**enseigne** — le nom d'usage, celui que le client donne au
 * téléphone. La raison sociale, elle, est une donnée de greffe : elle arrive
 * avec le SIRET, pas avant.
 *
 * Ce schéma l'exigeait, et `POST /admin/companies { enseigne }` — l'ouverture au
 * téléphone que le domaine autorise — se faisait refuser par la frontière. Une
 * règle de nom tenue à deux endroits finit toujours par se contredire ; elle
 * n'est plus tenue qu'une fois, et pas ici.
 *
 * Forme juridique et SIRET restent **facultatifs à l'ouverture** — un compte se
 * crée souvent chez le client, qui n'a pas ses papiers sous la main — et se
 * complètent ensuite. L'activation, elle, les exige.
 */
export const createCompanyPayload = z.object({
  raisonSociale: z.string().default(""),
  enseigne: z.string().default(""),
  formeJuridique: z.string().default(""),
  siret: z.string().default(""),
  vatNumber: z.string().default(""),
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
 * Un contact **additionnel** : les mêmes coordonnées, plus ce que la personne
 * fait pour la société.
 *
 * Le rôle est obligatoire ici et absent du contact principal, parce que celui-ci
 * est le **détenteur** — son rôle est `owner` par construction, et l'offrir au
 * choix laisserait croire qu'une société peut en avoir deux, ou zéro.
 */
export const additionalContactPayload = contactPayload.extend({
  role: assignableRoleSchema,
});

export type AdditionalContactPayload = z.infer<typeof additionalContactPayload>;

/**
 * Création d'un compte **depuis l'admin** : l'identité de la société, et son
 * contact principal **s'il est déjà connu** (le staff n'a pas de profil créateur
 * d'où le dériver).
 *
 * Le contact est **facultatif** parce que l'ouverture l'est : le commercial a le
 * client au téléphone, et n'a souvent que l'enseigne. Rattacher le détenteur est
 * un geste à part (`POST :companyId/holder`), qui peut viser quelqu'un ayant
 * déjà un espace chez nous — c'est le serveur qui reconnaît l'adresse, pas le
 * commercial.
 */
export const adminCreateCompanyPayload = createCompanyPayload.extend({
  primaryContact: contactPayload.optional(),
});

export type AdminCreateCompanyPayload = z.infer<typeof adminCreateCompanyPayload>;
