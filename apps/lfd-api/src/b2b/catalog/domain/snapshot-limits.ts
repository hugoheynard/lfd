import {
  categoryPathOf,
  resolveOrderTimeLimit,
  type StoredCatalogSnapshot,
  type SyncOrderTimeLimit,
} from "@lfd/catalog-sync";

/**
 * La version du fil à partir de laquelle **l'ÉCHELLE traverse** — avant, c'était
 * sa résolution, recopiée sur chaque déclinaison.
 *
 * 🔴 **Un nombre, et surtout pas `CATALOG_SNAPSHOT_VERSION`.** Ce test-là était
 * écrit « version courante », et il a menti dès le bump suivant : la v8 ajoute
 * l'éditorial, ne change rien aux limites, et une arrivée v7 mise en file s'est
 * mise à répondre « aucune limite » — sur la seule règle qui refuse une commande
 * en retard. Une borne de compatibilité désigne la version qui A CHANGÉ la
 * forme ; l'accrocher à la courante la fait glisser à chaque bump.
 */
const ORDER_TIME_LIMIT_RULES_SINCE = 7;

/** Un produit et une déclinaison du snapshot, réduits à ce que la résolution lit. */
type SnapshotProduct = StoredCatalogSnapshot["products"][number];
type SnapshotVariant = SnapshotProduct["variants"][number];

/**
 * **Où lire la limite de commande d'un article** — et ça dépend de la version.
 *
 * Depuis la **v7**, le fil porte l'ÉCHELLE et non sa résolution : quelques
 * règles pour tout le catalogue, là où la v6 recopiait une valeur par
 * déclinaison. La plateforme descend donc l'échelle elle-même, avec la même
 * implémentation que le référentiel (`@lfd/catalog-sync`) — une par rive aurait
 * fini par diverger, et l'écart n'aurait sauté aux yeux de personne : l'écran du
 * référentiel et la garde de commande ne se lisent pas au même endroit.
 *
 * 🔴 **C'est la VERSION qui décide, jamais la présence du champ.** Un snapshot
 * v7 sans aucune règle et un snapshot v6 rendent tous deux un tableau vide, et
 * ils ne veulent pas dire la même chose : le premier dit « personne n'a posé de
 * limite », le second « la limite voyage ailleurs ». Se fier au tableau
 * effacerait toutes les limites d'une arrivée v6 restée en file pendant le
 * déploiement — silencieusement, et sur la seule règle qui refuse une commande
 * en retard.
 *
 * ⚠️ Et la borne est {@link ORDER_TIME_LIMIT_RULES_SINCE}, pas la version
 * courante : lire « courante » faisait glisser la compatibilité d'un cran à
 * chaque bump du fil, quel qu'en soit le sujet.
 *
 * Écrite ici plutôt que chez ses deux appelants — l'ingestion et la comparaison
 * d'arrivée — parce qu'une seconde descente aurait fini par lire l'ancien champ
 * d'un seul côté : l'écran de validation aurait alors montré autre chose que ce
 * que la validation applique.
 *
 * La lignée de familles est mise en cache : un catalogue de quatre-vingt-dix
 * produits la remonterait autrement quatre-vingt-dix fois pour une poignée
 * d'arbres distincts.
 */
export function snapshotLimitReader(
  snapshot: StoredCatalogSnapshot,
): (product: SnapshotProduct, variant: SnapshotVariant) => SyncOrderTimeLimit | null {
  if (snapshot.version < ORDER_TIME_LIMIT_RULES_SINCE) {
    return (_product, variant) => variant.orderTimeLimit ?? null;
  }
  const rules = snapshot.orderTimeLimits ?? [];
  if (rules.length === 0) {
    return () => null;
  }
  const pathByCategory = new Map<string, readonly string[]>();
  return (product, variant) => {
    const cached = pathByCategory.get(product.categoryId);
    const categoryPath = cached ?? categoryPathOf(snapshot.categories, product.categoryId);
    pathByCategory.set(product.categoryId, categoryPath);
    return resolveOrderTimeLimit(rules, {
      // Absent d'un snapshot d'avant la v7 : un rang « déclinaison » ne vise
      // alors rien, ce qui est exact — ces règles ne traversaient pas.
      variantId: variant.id ?? null,
      productId: product.id,
      categoryPath,
    });
  };
}
