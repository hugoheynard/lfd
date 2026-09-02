import type { CatalogSnapshot, SyncProduct } from "@lfd/catalog-sync";

import { fingerprint } from "../../../catalogue/revision/domain/fingerprint.js";

/**
 * **Ce qu'on hache d'une projection** — le snapshot débarrassé de ce qui bouge
 * sans que rien n'ait changé.
 *
 * La garantie que tout ce chantier achète tient en une phrase : *un push refuse
 * de partir si ce qu'il enverrait diffère de ce qui a été relu*. Elle repose
 * entièrement sur une empreinte **déterministe** — et une projection ne l'est
 * pas.
 *
 * Deux raisons, toutes deux vérifiées avant d'écrire cette fonction :
 *
 * 1. **`generatedAt` est DANS le snapshot** (`@lfd/catalog-sync`), posé par
 *    l'instant d'émission. Deux projections d'un catalogue identique à une
 *    milliseconde d'écart donnent deux empreintes — le push refuserait
 *    **toujours**, et la garantie deviendrait un blocage permanent.
 * 2. **L'ordre des collections n'est pas total.** `position` est un
 *    `Int @default(0)` sans unicité : Postgres départage par l'ordre physique,
 *    qui change après un `UPDATE`. Et {@link fingerprint} **conserve
 *    délibérément l'ordre des tableaux** — le trier serait effacer une
 *    information, dit son JSDoc, et il a raison pour les visuels.
 *
 * Le dépôt avait déjà appris la seconde leçon et l'avait écrite :
 * `revision.ts` trie les articles par SKU, « sans ce tri, deux captures d'un
 * catalogue identique donneraient deux empreintes de révision ».
 *
 * ## 🔴 Pourquoi trier ne perd RIEN ici
 *
 * L'objection est réelle et mérite sa réponse : si l'empreinte ignore l'ordre
 * du tableau, elle devient aveugle à un réordonnancement que le canal reçoit
 * pourtant.
 *
 * Elle tombe parce que **l'ordre est redondant dans ce payload** : `position`
 * est un champ de `SyncCategory` et de `SyncVariant`. Déplacer une déclinaison
 * change sa `position`, donc change le contenu, donc change l'empreinte —
 * qu'on ait trié le tableau ou non. Le tri neutralise l'ordre **physique**,
 * celui qui n'est l'information de personne, et laisse intact l'ordre
 * **métier**, celui que quelqu'un a décidé.
 *
 * ⚠️ Ce raisonnement vaut tant que `position` reste dans le contrat de fil.
 * L'en retirer rendrait ce tri destructeur, en silence.
 */
export type CanonicalProjection = Omit<CatalogSnapshot, "generatedAt">;

/**
 * Compare deux clés **sans l'ICU**.
 *
 * `localeCompare` dépend de la table de collation du runtime : deux versions de
 * Node, ou un conteneur sans ICU complet, trient différemment — et l'empreinte
 * change sans qu'aucune donnée n'ait bougé. C'est exactement la panne que cette
 * fonction existe pour empêcher.
 *
 * Le dépôt porte déjà les deux écoles : `fingerprint.ts` compare par `<`,
 * `shopify/products/projection.ts` par `localeCompare`. Ici c'est la première,
 * et c'est un choix, pas une reprise.
 */
function byKey(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

/** Les déclinaisons triées par SKU — leur ordre métier vit dans `position`. */
function canonicalProduct(product: SyncProduct): SyncProduct {
  return {
    ...product,
    variants: [...product.variants].sort((left, right) => byKey(left.sku, right.sku)),
  };
}

/**
 * La forme canonique d'un snapshot : sans `generatedAt`, collections triées par
 * clé stable.
 *
 * **Pure** — aucune base, aucune horloge, aucun Nest. C'est ce qui permet de
 * l'éprouver par énumération, et c'est la pièce dont dépend tout le reste du
 * chantier : sans elle, le push refuse toujours.
 *
 * On trie par **identifiant**, jamais par nom : un nom se corrige, et une
 * empreinte qui bouge parce qu'on a réparé une faute de frappe ferait refuser
 * un push qui n'envoie rien d'autre.
 */
export function canonicalProjection(snapshot: CatalogSnapshot): CanonicalProjection {
  return {
    version: snapshot.version,
    categories: [...snapshot.categories].sort((left, right) => byKey(left.id, right.id)),
    products: [...snapshot.products]
      .sort((left, right) => byKey(left.sku, right.sku))
      .map(canonicalProduct),
  };
}

/**
 * L'empreinte d'une projection — ce que l'aperçu rend et que le push exige.
 *
 * Elle répond à « ce que je pousse est-il ce que j'ai relu ? », et à rien
 * d'autre. Elle n'est **pas** l'ancre : celle-ci archive ce que le catalogue
 * était, permanente, dans le vocabulaire du référentiel ; celle-là ne vit que
 * le temps d'un aller-retour, dans le vocabulaire d'un canal.
 */
export function projectionFingerprint(snapshot: CatalogSnapshot): string {
  return fingerprint(canonicalProjection(snapshot));
}
