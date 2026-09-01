import { PIM_EVENTS } from "../../../journal/pim-journal.js";

/**
 * **Quels faits changent le CONTENU d'une fiche** — et périment donc une
 * signature « publiable ».
 *
 * La question paraît anodine et elle ne l'est pas : elle était répondue par un
 * horodatage de ligne (`product.updated_at`), et cette ligne porte `status`. Un
 * `@updatedAt` Prisma ne distingue pas les colonnes, si bien que **mettre en
 * vente périmait la signature qui justifiait la mise en vente**. L'écran
 * affichait « la fiche a été modifiée depuis » sur une fiche dont pas un
 * caractère n'avait bougé.
 *
 * La même mesure ratait l'inverse : les taux et les canaux vivent dans des
 * tables satellites qui n'entraient pas dans le calcul, donc changer le taux
 * d'un produit ne périmait rien du tout.
 *
 * D'où cette table. Elle ne mesure pas des lignes, elle lit des **faits** : le
 * journal dit déjà précisément ce qui a changé et quand, dans la même
 * transaction que l'écriture. Un fait est la seule source qui ne confond pas
 * deux colonnes voisines.
 *
 * ## Le critère
 *
 * Un fait est « de contenu » si un relecteur qui a signé la fiche AVANT
 * voudrait la revoir APRÈS. Ce n'est pas « le fait touche la ligne produit »,
 * ni « le fait entre dans une révision » — c'est ce que la signature engage :
 * les prix, les allergènes, les textes, les visuels, les taux, les canaux, la
 * composition.
 *
 * Les quatre transitions de statut n'y sont pas, et la signature non plus. Un
 * statut dit ce que le catalogue FAIT de la fiche ; il n'affirme rien sur son
 * contenu, donc il ne peut rien démentir.
 *
 * ⚠️ **La table est exhaustive, et un test le tient** : tout fait `product.*`
 * doit y figurer. Sans cette garde, un fait ajouté demain serait muet ici — et
 * le silence, à cet endroit, se lit exactement comme « rien n'a changé ».
 */
const CONTENT_FACTS: Readonly<Record<string, boolean>> = {
  // ── Ce qui change ce que la signature engage ────────────────────────────
  // La naissance compte : une signature ne peut pas précéder la fiche, et un
  // produit dont c'est le seul fait a bien une date de contenu.
  [PIM_EVENTS.productCreated]: true,
  [PIM_EVENTS.productIdentitySaved]: true,
  [PIM_EVENTS.productPricingSaved]: true,
  [PIM_EVENTS.productDeclarationSaved]: true,
  [PIM_EVENTS.productEditorialSaved]: true,
  [PIM_EVENTS.productMediaSaved]: true,
  // Taux et canaux : invisibles de l'ancienne mesure, parce qu'ils vivent dans
  // `ProductContextVat` et `ProductChannelOverride`. Ils changent le prix servi
  // et les contextes de vente — exactement ce qu'on relit avant de signer.
  [PIM_EVENTS.productVatChanged]: true,
  [PIM_EVENTS.productChannelsChanged]: true,
  // La composition CONTREDIT une déclaration d'allergènes sans jamais la
  // remplacer (cf. `ProductIngredientAllergensView`). Depuis que la section
  // réglementaire montre ce que la composition mentionne, en changer la liste
  // peut rendre fausse une déclaration signée. Elle est donc du contenu.
  [PIM_EVENTS.productIngredientsSaved]: true,

  // ── Ce qui ne dit rien du contenu ───────────────────────────────────────
  // Les quatre transitions de statut. Elles décident de ce que le catalogue
  // fait de la fiche, pas de ce qu'elle dit.
  [PIM_EVENTS.productPublished]: false,
  [PIM_EVENTS.productUnpublished]: false,
  [PIM_EVENTS.productArchived]: false,
  [PIM_EVENTS.productRestored]: false,
  // La signature elle-même. Se compter comme une modification la périmerait à
  // l'instant où elle est posée.
  [PIM_EVENTS.productDeclaredReady]: false,
};

/**
 * Ce fait change-t-il le contenu de la fiche ?
 *
 * Un type inconnu rend `false` : mieux vaut ne pas périmer une signature sur un
 * fait qu'on ne sait pas lire que de la périmer à tort. Le cas ne doit pas
 * exister — le test d'exhaustivité est là pour ça — et s'il survenait, il
 * échouerait du côté silencieux plutôt que du côté bruyant.
 */
export function isContentFact(type: string): boolean {
  return CONTENT_FACTS[type] === true;
}

/** Ce que la table couvre — lu par le test qui la tient à jour. */
export const CLASSIFIED_PRODUCT_FACTS: readonly string[] = Object.keys(CONTENT_FACTS);
