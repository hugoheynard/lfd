import { PIM_EVENTS } from "../../../journal/pim-journal.js";
import type { PimJournalFact } from "../../../journal/pim-journal-reader.js";
import { readObject } from "./payload-reading.js";

/**
 * **Qui a changé ce champ, et quand.**
 *
 * Une révision sait QUI l'a posée ; elle ne sait pas qui a écrit chacune de ses
 * lignes. Cette réponse-là vit dans le journal, un fait à la fois. Ce module
 * fait le pont entre les deux vocabulaires — et ce pont est la pièce fragile du
 * dispositif, parce qu'il est une TROISIÈME déclaration du même ensemble de
 * champs, après le payload d'une révision et celui d'un fait.
 *
 * Il est donc tenu par un test qui parcourt `PIM_EVENTS` : un fait de produit
 * ajouté sans entrée ici ne compile pas la suite. Sans ça, un événement neuf
 * n'attribuerait plus rien, en silence — et le silence, ici, ressemble
 * exactement à « personne n'a touché à ce champ ».
 */

/** L'attribution d'une ligne. `by` à `null` = le système, pas une personne. */
export interface FieldAuthor {
  readonly by: string | null;
  readonly at: Date;
}

/**
 * Ce qu'un fait touche, dans le vocabulaire d'une RÉVISION.
 *
 * `null` = ce fait ne parle d'aucun champ d'article. `"*"` = il les touche tous
 * (la fiche vient d'apparaître). Sinon, la liste des champs — et pour les faits
 * de section, elle se lit dans le payload lui-même plutôt que d'être écrite
 * ici : `product.identity_saved` dit déjà quels champs il a changés.
 */
const TOUCHES: Readonly<Record<string, readonly string[] | "changes" | "*">> = {
  // Ces quatre-là portent un diff `{ changes: { champ: { from, to } } }` dont
  // les clés SONT déjà des champs de révision. Les recopier ici ferait une
  // quatrième déclaration à tenir d'accord.
  [PIM_EVENTS.productIdentitySaved]: "changes",
  [PIM_EVENTS.productPricingSaved]: "changes",
  [PIM_EVENTS.productDeclarationSaved]: ["allergens"],
  [PIM_EVENTS.productEditorialSaved]: ["editorial"],
  [PIM_EVENTS.productMediaSaved]: ["media"],
  // Le payload d'un changement de taux est indexé par CONTEXTE (`{ eatIn: … }`),
  // pas par champ : ses clés ne sont donc pas lisibles comme des champs, et la
  // correspondance s'écrit.
  [PIM_EVENTS.productVatChanged]: ["vatByContext"],
  [PIM_EVENTS.productChannelsChanged]: ["soldContexts"],
  // La famille, et elle seule : `vatByContext` et `soldContexts` d'une révision
  // sont EFFECTIFS, et un reclassement a pu les changer — ou non, si les deux
  // familles règlent pareil, ou pour une autre cause dans le même intervalle.
  // Il n'a donc que PU en être l'auteur, et ce module n'attribue pas un
  // possible (cf. les causes globales, plus bas).
  [PIM_EVENTS.productReclassified]: ["categoryId", "categoryName"],
  [PIM_EVENTS.productPublished]: ["status"],
  [PIM_EVENTS.productUnpublished]: ["status"],
  [PIM_EVENTS.productArchived]: ["status"],
  [PIM_EVENTS.productRestored]: ["status"],
  [PIM_EVENTS.productCreated]: "*",
  // Une signature ne modifie RIEN de la fiche : elle affirme quelque chose sur
  // elle. L'attribuer à un champ ferait dire à l'écran que quelqu'un a changé
  // un prix alors qu'il a seulement déclaré la fiche juste.
  [PIM_EVENTS.productDeclaredReady]: [],
  // La PROVENANCE ne figure dans aucune ancre — pour l'instant, et c'est une
  // constatation, pas un oubli. Une révision fige ce qui est PUBLIÉ, et rien ne
  // pousse encore les ingrédients vers un canal. Le jour où le B2B les affichera
  // (c'est la raison qui a fait versionner le catalogue entier), ils entreront
  // dans `RevisionItemInput` et cette ligne citera leur champ.
  [PIM_EVENTS.productIngredientsSaved]: [],
};

/** Les champs de révision qu'un fait touche. Vide = il n'en touche aucun. */
export function fieldsTouchedBy(fact: PimJournalFact): readonly string[] | "*" {
  const rule = TOUCHES[fact.type];
  if (rule === undefined) {
    return [];
  }
  if (rule !== "changes") {
    return rule;
  }
  const changes = readChanges(fact.payload);
  return changes === null ? [] : Object.keys(changes);
}

/**
 * Le dernier auteur de chaque champ, parmi les faits donnés.
 *
 * Les faits arrivent du plus RÉCENT au plus ancien : le premier qui touche un
 * champ est donc celui qui l'a fait, et les suivants ne le réécrivent pas.
 * L'ordre est une précondition — le port qui les rend le garantit, et l'inverser
 * attribuerait la première modification au lieu de la dernière sans que rien ne
 * le signale.
 *
 * Un champ absent de la carte n'a **pas d'auteur connu**, et c'est un résultat :
 * il vient d'un seed, d'un script, ou d'un verbe qui ne trace pas encore. Lui
 * coller l'auteur de la révision serait accuser quelqu'un qui a seulement
 * appuyé sur « poser ».
 */
export function attributeFields(
  fields: readonly string[],
  facts: readonly PimJournalFact[],
): ReadonlyMap<string, FieldAuthor> {
  const authors = new Map<string, FieldAuthor>();
  for (const fact of facts) {
    const touched = fieldsTouchedBy(fact);
    for (const field of fields) {
      if (authors.has(field)) {
        continue;
      }
      if (touched === "*" || touched.includes(field)) {
        authors.set(field, { by: fact.actorName, at: fact.occurredAt });
      }
    }
  }
  return authors;
}

/** Le bloc `changes` d'un payload, ou `null` s'il n'en porte pas. */
function readChanges(payload: unknown): Record<string, unknown> | null {
  return readObject(payload, "changes");
}

/** Les faits de PRODUIT — ceux que ce module doit savoir interpréter. */
export const PRODUCT_FACT_TYPES: readonly string[] = Object.values(PIM_EVENTS).filter((type) =>
  type.startsWith("product."),
);

/** Ce que la table couvre — lu par le test qui la tient à jour. */
export const ATTRIBUTED_FACT_TYPES: readonly string[] = Object.keys(TOUCHES);
