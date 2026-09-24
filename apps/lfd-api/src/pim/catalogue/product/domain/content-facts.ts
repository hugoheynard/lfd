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
 * les prix, les allergènes, les textes, les taux, les canaux, la composition.
 *
 * Les quatre transitions de statut n'y sont pas, et la signature non plus. Un
 * statut dit ce que le catalogue FAIT de la fiche ; il n'affirme rien sur son
 * contenu, donc il ne peut rien démentir.
 *
 * ## Amendement du 2026-09-23 — les visuels sortent du critère
 *
 * Le critère ci-dessus citait « les textes, les visuels ». Il ne cite plus les
 * visuels, et c'est une **décision**, pas une omission — Hugo, 2026-09-23 :
 * « changement visuel et contenu ne créent pas de révision ».
 *
 * **Ce qu'on accepte, et il faut le lire en face :** une photo remplacée, un
 * visuel promu en `hero`, deux images permutées après signature ne redemandent
 * plus de relecture. Quelqu'un peut donc changer l'image d'un produit signé
 * sans que l'écran le signale — la fiche reste « publiable » avec un visuel que
 * le signataire n'a jamais vu.
 *
 * **Ce qui garde la trace :** le journal. `product.media_saved` continue d'être
 * écrit, daté et attribué à une personne, à chaque enregistrement qui change
 * quelque chose. Rien ne devient invisible ; seul l'avertissement de péremption
 * se tait. Et depuis le même jour, le diff des visuels porte enfin le RÔLE —
 * promouvoir une image en `hero` ne produisait aucun fait du tout, ce qui
 * aurait fait de cette sortie un silence complet plutôt qu'une trace non
 * bloquante.
 *
 * **Les TEXTES, eux, restent du contenu — pour l'instant, et c'est une décision
 * EN ATTENTE, pas un oubli.** Hugo, le même jour : « pour l'instant on se
 * concentre sur les médias, on ira sur contenu après ». Ne pas combler
 * l'asymétrie d'un côté ni de l'autre avant que ce soit tranché. Elle se
 * défend d'ailleurs telle quelle : permuter deux visuels du même produit
 * n'appelle aucune relecture, là où une description réécrite peut engager
 * autrement.
 *
 * `product.media_saved` reste **classé** ici, à `false` : la table est
 * exhaustive, et le retirer le rendrait muet pour une autre raison que
 * celle-ci.
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
  // Les deux moitiés de la fiche réglementaire, et leur ancêtre. Celui-ci reste
  // à `true` bien que plus rien ne l'écrive : les lignes déjà posées doivent
  // continuer de périmer les signatures qu'elles ont périmées.
  [PIM_EVENTS.productAllergensSaved]: true,
  [PIM_EVENTS.productNutritionSaved]: true,
  [PIM_EVENTS.productDeclarationSaved]: true,
  [PIM_EVENTS.productEditorialSaved]: true,
  // Taux et canaux : invisibles de l'ancienne mesure, parce qu'ils vivent dans
  // `ProductContextVat` et `ProductChannelOverride`. Ils changent le prix servi
  // et les contextes de vente — exactement ce qu'on relit avant de signer.
  [PIM_EVENTS.productVatChanged]: true,
  [PIM_EVENTS.productChannelsChanged]: true,
  // Réserver la fiche aux opérations change QUAND elle se vend, comme les
  // canaux changent OÙ : un signataire qui l'a relue courante voudrait la
  // revoir exclusive (lot 2 du plan des opérations datées, 2026-09-24).
  [PIM_EVENTS.productOperationOnlyChanged]: true,
  // Changer de famille change les taux et les canaux hérités. Le même geste
  // écrit aussi `identity_saved`, déjà compté : ce fait-ci ne périme donc
  // rien de plus, mais la table est exhaustive et il y a sa place.
  [PIM_EVENTS.productReclassified]: true,
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
  // Les visuels, sortis du contenu le 2026-09-23 (voir l'amendement en tête de
  // fichier). Ils restent journalisés, datés et attribués : c'est la relecture
  // qu'on ne redemande plus, pas la trace. Les TEXTES, eux, sont restés
  // au-dessus — décision en attente, pas asymétrie fortuite.
  [PIM_EVENTS.productMediaSaved]: false,
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
