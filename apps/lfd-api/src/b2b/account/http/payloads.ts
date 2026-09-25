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
 * Borne d'un jeton d'identité. Un JWT signé RS256 avec les claims d'Auth0 tient
 * très largement dedans ; au-delà, on refuse avant de faire vérifier une
 * signature sur un corps que personne n'a pu émettre.
 */
const ID_TOKEN_MAX_LENGTH = 8192;

/**
 * La **preuve** qu'on tient la session du compte à rattacher — un `id_token`
 * émis à la SPA boutique.
 *
 * Ici on ne vérifie que la FORME : qu'il y ait une chaîne, et qu'elle ne soit
 * pas absurde. Ce que le jeton prouve — signature, émetteur, audience de
 * l'application cliente, fraîcheur — est vérifié par le port de preuve, et rien
 * de tout cela ne se revalide au contrôleur.
 */
export const linkLoginMethodPayload = z.object({
  idToken: z.string().trim().min(1).max(ID_TOKEN_MAX_LENGTH),
});

export type LinkLoginMethodPayload = z.infer<typeof linkLoginMethodPayload>;

/** Un identifiant de société est un `cuid()` ; la borne ne refuse que l'absurde. */
const WORKSPACE_MAX_LENGTH = 64;

/**
 * Un **patch** des préférences de navigation : seules les clés présentes
 * changent, et il en faut au moins une.
 *
 * `{ catalogueView }` seul reste valide — c'est ce qu'envoie le front déjà en
 * production. La vue est une union fermée : le front n'a que ces trois vues.
 * `workspace` ne vérifie ici que la FORME ; qu'il désigne « perso » ou une
 * société de la personne est la règle du domaine. `null` efface le choix.
 */
export const updateNavPrefsPayload = z
  .object({
    catalogueView: z.enum(["cards", "shelves", "list"]).optional(),
    workspace: z.string().trim().min(1).max(WORKSPACE_MAX_LENGTH).nullable().optional(),
  })
  .refine((patch) => patch.catalogueView !== undefined || patch.workspace !== undefined, {
    message: "au moins une préférence à changer : catalogueView ou workspace",
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
 * Forme juridique, SIRET et SIREN restent **facultatifs à l'ouverture** — un compte se
 * crée souvent chez le client, qui n'a pas ses papiers sous la main — et se
 * complètent ensuite. L'activation, elle, les exige.
 */
export const createCompanyPayload = z.object({
  raisonSociale: z.string().default(""),
  enseigne: z.string().default(""),
  formeJuridique: z.string().default(""),
  siret: z.string().default(""),
  /** SIREN — vide = repris du SIRET quand son préfixe en est un valide. */
  siren: z.string().default(""),
  vatNumber: z.string().default(""),
});

export type CreateCompanyPayload = z.infer<typeof createCompanyPayload>;

/**
 * `POST /me/establishment` — la déclaration de la porte pro : la personne et
 * l'enseigne, en un geste.
 *
 * **Pas d'e-mail** : il reste celui du compte, et le changer passe par Auth0.
 * Le téléphone a le même défaut que sur le profil ; prénom, nom et enseigne
 * n'en ont pas, et leur vide est refusé par les value objects — pas ici.
 */
export const declareEstablishmentPayload = z.object({
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().default(""),
  enseigne: z.string(),
});

export type DeclareEstablishmentPayload = z.infer<typeof declareEstablishmentPayload>;

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

/**
 * Bloquer le prélèvement d'une société : la raison seule. Sa borne (1–500)
 * appartient au value object `DirectDebitBlock`, pas à ce schéma.
 */
export const blockDirectDebitPayload = z.strictObject({ reason: z.string() });

export type BlockDirectDebitPayload = z.infer<typeof blockDirectDebitPayload>;
