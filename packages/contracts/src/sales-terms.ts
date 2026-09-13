import { z } from "zod";

import { MAX_SALES_TERMS_BODY, MAX_SALES_TERMS_PARAGRAPHS } from "./sales-terms.bounds.js";

/**
 * **Les conditions générales de vente** — un titre, puis des paragraphes
 * titrés, dans les trois langues de la vitrine.
 *
 * Elles vivent dans le même bloc que le pied de page ({@link footerContentSchema}),
 * sous une autre clé, et pour la même raison : un article à corriger ne doit
 * demander ni développeur, ni revue, ni déploiement.
 *
 * **Trois langues, sans exception** — la règle du contenu de plateforme
 * s'applique telle quelle. Un paragraphe porte ses trois versions ou n'existe
 * pas, et c'est la forme de l'objet qui le garantit plutôt qu'une vérification :
 * on ne peut pas en enregistrer deux fois une et en oublier une autre.
 *
 * ⚠️ Ce que ça coûte, et c'est assumé : **ajouter un paragraphe demande les
 * trois langues d'un coup.** Un rédacteur qui n'a que le français ne peut pas
 * poser l'article et le traduire demain. L'alternative — des langues
 * optionnelles avec repli sur le français — rendait indistinguables « pas
 * encore traduit » et « volontairement identique », et c'est cette
 * indistinction qui fait vieillir une traduction sans que personne le voie.
 *
 * ## Pourquoi un tableau, alors que le pied de page est un objet indexé
 *
 * Le pied de page a des sections CONNUES d'avance, donc un objet : c'est ce qui
 * rend une section manquante inexprimable. Les CGV, elles, ont un nombre
 * d'articles qui bouge et un ORDRE qui porte du sens — un article de litige se
 * lit après celui qu'il concerne. Cet ordre est une donnée ; il lui faut une
 * suite, pas un dictionnaire.
 */

// Les BORNES vivent dans le module sans zod, et y sont réexportées : les deux
// fronts en ont besoin pour prévenir avant que le serveur refuse, et tous leurs
// imports de `@lfd/contracts` sont des `import type`. Les laisser ici les rendait
// illisibles sans tirer zod dans un bundle de vitrine.
export { MAX_SALES_TERMS_BODY, MAX_SALES_TERMS_PARAGRAPHS } from "./sales-terms.bounds.js";

/**
 * Le texte d'un paragraphe dans **une** langue : son titre et son corps.
 *
 * Les deux sont exigés non vides. Un article sans titre n'est pas repérable
 * dans un sommaire, et un titre sans corps affiche une promesse creuse au
 * client — deux formes de document incomplet qu'il vaut mieux refuser à la
 * saisie que rendre à l'écran.
 */
export const salesTermsProseSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(MAX_SALES_TERMS_BODY),
});
export type SalesTermsProse = z.infer<typeof salesTermsProseSchema>;

/** Un même texte dans les trois langues. C'est la charge utile d'un paragraphe. */
export const salesTermsParagraphPayloadSchema = z.object({
  fr: salesTermsProseSchema,
  en: salesTermsProseSchema,
  it: salesTermsProseSchema,
});
export type SalesTermsParagraphPayload = z.infer<typeof salesTermsParagraphPayloadSchema>;

/**
 * Un **paragraphe** enregistré : sa charge utile, plus l'identifiant que le
 * serveur lui a donné.
 *
 * L'identifiant est **opaque et assigné par le serveur** (un ULID, via le port
 * `IdGenerator`), pas dérivé du titre : un article renommé garderait alors une
 * clé qui ment, et deux articles homonymes se marcheraient dessus. Il est ce
 * que les routes de modification et de suppression désignent — donc il doit
 * survivre à toute réécriture du texte.
 */
export const salesTermsParagraphSchema = salesTermsParagraphPayloadSchema.extend({
  id: z.string().trim().min(1).max(40),
});
export type SalesTermsParagraph = z.infer<typeof salesTermsParagraphSchema>;

/**
 * Le **titre du document**, dans les trois langues.
 *
 * Sans corps, à la différence d'un paragraphe : il nomme, il n'énonce pas. Il
 * sert aussi de libellé au bouton qui ouvre les CGV dans la boutique, ce qui
 * fait qu'un document renommé renomme son propre lien.
 */
export const salesTermsHeadingSchema = z.object({
  fr: z.string().trim().min(1).max(200),
  en: z.string().trim().min(1).max(200),
  it: z.string().trim().min(1).max(200),
});
export type SalesTermsHeading = z.infer<typeof salesTermsHeadingSchema>;

/**
 * Le document entier, tel qu'il est stocké dans la colonne JSON.
 *
 * Deux identifiants égaux sont refusés à la relecture comme à l'écriture. La
 * base ne peut pas le tenir — c'est du JSON, il n'y a pas d'index unique
 * là-dedans — donc c'est le schéma qui le tient, au bord, dans les deux sens.
 * Sans ça, une modification viserait deux paragraphes à la fois et n'en
 * changerait qu'un, en silence.
 */
export const salesTermsSchema = z.object({
  title: salesTermsHeadingSchema,
  paragraphs: z
    .array(salesTermsParagraphSchema)
    .max(MAX_SALES_TERMS_PARAGRAPHS)
    .refine(
      (list) => new Set(list.map((entry) => entry.id)).size === list.length,
      "deux paragraphes portent le même identifiant",
    ),
});
export type SalesTerms = z.infer<typeof salesTermsSchema>;

/**
 * Où placer un paragraphe qu'on déplace — un rang, à partir de zéro.
 *
 * La borne haute dépend du document et n'est donc pas dans le schéma : elle est
 * un invariant de l'agrégat, qui seul sait combien d'articles il porte.
 */
export const salesTermsPositionPayloadSchema = z.object({
  position: z.number().int().min(0),
});
export type SalesTermsPositionPayload = z.infer<typeof salesTermsPositionPayloadSchema>;

/**
 * Les CGV telles qu'elles sont renvoyées, avec de quoi savoir si elles ont bougé.
 *
 * Même forme que {@link FooterContentView}, et délibérément : les deux blocs
 * vivent dans la même table, portent la même révision, et un écran qui sait
 * lire l'un doit savoir lire l'autre.
 */
export interface SalesTermsView {
  readonly content: SalesTerms;
  readonly revision: number;
  /** ISO 8601. Quand, et par qui — le nom, pas l'identifiant. */
  readonly updatedAt: string;
  readonly updatedBy: string | null;
}

/** Ce que le serveur rend quand un paragraphe vient d'être créé. */
export interface SalesTermsParagraphCreated {
  readonly id: string;
}
