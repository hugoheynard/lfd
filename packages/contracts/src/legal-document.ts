import { z } from "zod";

import { MAX_LEGAL_DOCUMENT_BODY, MAX_LEGAL_DOCUMENT_PARAGRAPHS } from "./legal-document.bounds.js";
import { legalMentionOrder } from "./platform-content.defaults.js";

/**
 * **Un document de mention légale** — un titre, puis des paragraphes titrés,
 * dans les trois langues de la vitrine.
 *
 * Les CINQ mentions ({@link legalMentionOrder}) ont cette forme-là et pas une
 * autre : mentions légales, CGV, confidentialité, cookies, accessibilité. Ce
 * qui les distingue est leur CLÉ, pas leur structure — d'où un seul schéma,
 * un seul agrégat, un seul écran. Cinq copies auraient divergé au premier
 * correctif.
 *
 * Chacune vit dans le même bloc que le pied de page ({@link footerContentSchema}),
 * sous sa propre clé, et pour la même raison : un article à corriger ne doit
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
 * rend une section manquante inexprimable. Un document légal, lui, a un nombre
 * d'articles qui bouge et un ORDRE qui porte du sens — un article de litige se
 * lit après celui qu'il concerne. Cet ordre est une donnée ; il lui faut une
 * suite, pas un dictionnaire.
 */

// Les BORNES vivent dans le module sans zod, et y sont réexportées : les deux
// fronts en ont besoin pour prévenir avant que le serveur refuse, et tous leurs
// imports de `@lfd/contracts` sont des `import type`. Les laisser ici les rendait
// illisibles sans tirer zod dans un bundle de vitrine.
export { MAX_LEGAL_DOCUMENT_BODY, MAX_LEGAL_DOCUMENT_PARAGRAPHS } from "./legal-document.bounds.js";

/**
 * Le texte d'un paragraphe dans **une** langue : son titre et son corps.
 *
 * Les deux sont exigés non vides. Un article sans titre n'est pas repérable
 * dans un sommaire, et un titre sans corps affiche une promesse creuse au
 * client — deux formes de document incomplet qu'il vaut mieux refuser à la
 * saisie que rendre à l'écran.
 */
export const legalDocumentProseSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(MAX_LEGAL_DOCUMENT_BODY),
});
export type LegalDocumentProse = z.infer<typeof legalDocumentProseSchema>;

/** Un même texte dans les trois langues. C'est la charge utile d'un paragraphe. */
export const legalDocumentParagraphPayloadSchema = z.object({
  fr: legalDocumentProseSchema,
  en: legalDocumentProseSchema,
  it: legalDocumentProseSchema,
});
export type LegalDocumentParagraphPayload = z.infer<typeof legalDocumentParagraphPayloadSchema>;

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
export const legalDocumentParagraphSchema = legalDocumentParagraphPayloadSchema.extend({
  id: z.string().trim().min(1).max(40),
});
export type LegalDocumentParagraph = z.infer<typeof legalDocumentParagraphSchema>;

/**
 * Le **titre du document**, dans les trois langues.
 *
 * Sans corps, à la différence d'un paragraphe : il nomme, il n'énonce pas. Il
 * sert aussi de libellé au lien qui ouvre le document dans la boutique, ce qui
 * fait qu'un document renommé renomme son propre lien.
 */
export const legalDocumentHeadingSchema = z.object({
  fr: z.string().trim().min(1).max(200),
  en: z.string().trim().min(1).max(200),
  it: z.string().trim().min(1).max(200),
});
export type LegalDocumentHeading = z.infer<typeof legalDocumentHeadingSchema>;

/**
 * Le document entier, tel qu'il est stocké dans la colonne JSON.
 *
 * Deux identifiants égaux sont refusés à la relecture comme à l'écriture. La
 * base ne peut pas le tenir — c'est du JSON, il n'y a pas d'index unique
 * là-dedans — donc c'est le schéma qui le tient, au bord, dans les deux sens.
 * Sans ça, une modification viserait deux paragraphes à la fois et n'en
 * changerait qu'un, en silence.
 */
export const legalDocumentSchema = z.object({
  title: legalDocumentHeadingSchema,
  paragraphs: z
    .array(legalDocumentParagraphSchema)
    .max(MAX_LEGAL_DOCUMENT_PARAGRAPHS)
    .refine(
      (list) => new Set(list.map((entry) => entry.id)).size === list.length,
      "deux paragraphes portent le même identifiant",
    ),
});
export type LegalDocument = z.infer<typeof legalDocumentSchema>;

/**
 * Où placer un paragraphe qu'on déplace — un rang, à partir de zéro.
 *
 * La borne haute dépend du document et n'est donc pas dans le schéma : elle est
 * un invariant de l'agrégat, qui seul sait combien d'articles il porte.
 */
export const legalDocumentPositionPayloadSchema = z.object({
  position: z.number().int().min(0),
});
export type LegalDocumentPositionPayload = z.infer<typeof legalDocumentPositionPayloadSchema>;

/**
 * Le document tel qu'il est renvoyé, avec de quoi savoir s'il a bougé.
 *
 * Même forme que {@link FooterContentView}, et délibérément : les deux blocs
 * vivent dans la même table, portent la même révision, et un écran qui sait
 * lire l'un doit savoir lire l'autre.
 */
export interface LegalDocumentView {
  readonly content: LegalDocument;
  readonly revision: number;
  /** ISO 8601. Quand, et par qui — le nom, pas l'identifiant. */
  readonly updatedAt: string;
  readonly updatedBy: string | null;
}

/** Ce que le serveur rend quand un paragraphe vient d'être créé. */
export interface LegalDocumentParagraphCreated {
  readonly id: string;
}

/**
 * La **mention** qu'un chemin désigne — le vocabulaire fermé, en schéma.
 *
 * 🔴 C'est ce qui tient le bord : un segment d'URL libre ouvrirait un bloc de
 * contenu que rien n'affiche, que le pied de page ne peut pas cocher et que
 * personne ne saurait retrouver. Le schéma dérive de {@link legalMentionOrder},
 * il ne le recopie pas — ajouter une mention à la liste suffit.
 *
 * ⚠️ Une mention inconnue se rend en **404** et non en 400 : le segment désigne
 * une ressource, et celle qu'on demande n'existe pas.
 */
export const legalMentionSchema = z.enum(legalMentionOrder);
