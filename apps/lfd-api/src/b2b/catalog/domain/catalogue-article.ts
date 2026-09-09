/**
 * **Un article dont le prix d'entrée vient du CATALOGUE**, et pas de l'appelant.
 *
 * ## Ce que ce type protège
 *
 * Le port du catalogue porte la doctrine du checkout : « ne jamais faire
 * confiance au prix envoyé par le client ». Elle tenait jusqu'ici par la
 * **discipline** — chaque appelant résolvait le catalogue avant de tarifer, et
 * personne ne vérifiait qu'il l'avait fait. Six sites construisaient l'article à
 * tarifer à la main ; il aurait suffi qu'un seul recopie un prix reçu.
 *
 * Le `canonicalMillicents` est le nombre sur lequel s'appliquent la mercuriale,
 * les paliers, les promotions et le plancher. Le fabriquer, c'est fabriquer la
 * facture.
 *
 * ## Comment il le protège, et ce qu'il ne protège PAS
 *
 * La clé de marque est un `unique symbol` **non exporté** : hors de ce fichier,
 * personne ne peut la nommer, donc personne ne peut construire l'objet.
 *
 * ⚠️ **Ça bloque l'accident, pas la fraude** — vérifié le 2026-09-09 :
 * `{ … } as CatalogArticle` **compile**, et `lint:no-type-escapes` ne refuse
 * que `as unknown as`. Le second cran est donc une porte CI,
 * `lint:catalogue-authority` : {@link catalogueArticle} ne s'appelle que sous
 * `b2b/catalog/`.
 *
 * Inexprimable pour ce qui se fait par mégarde, refusé par une porte pour ce
 * qui se ferait exprès. Prétendre que le type seul suffit serait se raconter
 * une histoire.
 *
 * ## Pourquoi `catalog/` tout entier, et pas le seul port
 *
 * La vitrine lit `CatalogReader.listSellable()` — un **autre** port du même
 * contexte — parce qu'elle a besoin de `productSku`, `categoryId`, `note` et
 * `image`, que `CatalogItem` ne porte pas. Restreindre la frappe au seul
 * `ProductCatalogReader` laisserait hors garantie le consommateur le plus
 * exposé : celui qui sert la route anonyme.
 *
 * La marque atteste donc une provenance de **contexte**. Les deux ports y vivent
 * depuis que le catalogue est rentré chez lui (2026-09-09).
 */
declare const FROM_CATALOGUE: unique symbol;

/**
 * Ce qu'il faut savoir d'un article pour le tarifer — **et d'où ça vient**.
 *
 * Les quatre champs sont ceux de `PricedItem`, structurellement : un
 * `CatalogArticle` est donc accepté partout où le moteur attend un article à
 * tarifer, sans conversion. C'est l'inverse qui est refusé, et c'est tout
 * l'objet du type.
 */
export interface CatalogArticle {
  readonly sku: string;
  readonly name: string;
  /** Sa famille — ce que vise une règle de portée `category`. */
  readonly category: string;
  /** Le tarif de liste, en millicentimes. **Lu du catalogue, jamais reçu.** */
  readonly canonicalMillicents: number;
  readonly [FROM_CATALOGUE]: true;
}

/**
 * Ce qu'un lecteur du catalogue a sous la main quand il frappe.
 *
 * Il parle le vocabulaire du **catalogue** — `unitPriceMillicents`, le prix
 * unitaire d'un article en vente. La frappe le traduit en celui du **moteur** —
 * `canonicalMillicents`, l'entrée du pipeline, avant le moindre étage.
 *
 * 🔴 Cette traduction était recopiée sur **six sites** au 2026-09-09. Les deux
 * noms sont justes, chacun dans sa langue ; c'est de les traduire six fois qui
 * ne l'était pas — il aurait suffi qu'un site se trompe de champ pour tarifer
 * sur autre chose que le tarif.
 */
interface Unsealed {
  readonly sku: string;
  readonly name: string;
  readonly category: string;
  readonly unitPriceMillicents: number;
}

/**
 * **La frappe** — le seul geste qui fabrique un article scellé.
 *
 * 🔴 Ne l'appeler que depuis un adaptateur ou un service de `b2b/catalog/`,
 * c'est-à-dire à un endroit qui vient de **lire** le catalogue.
 * `lint:catalogue-authority` le tient : l'appeler ailleurs fait échouer la CI,
 * et le refus nomme la raison plutôt que la règle.
 *
 * ⚠️ **Les suites font exception**, et elle est étroite : une suite déclare son
 * catalogue, elle ne facture personne. Leur interdire la frappe les forcerait à
 * traverser un double asynchrone pour éprouver une fonction pure — un test moins
 * lisible, pour une production pas plus sûre.
 *
 * L'assertion est ici, une fois, sous ce commentaire — plutôt que dispersée sur
 * six sites qui n'auraient rien eu à asserter parce qu'ils n'auraient rien eu à
 * prouver.
 */
export function catalogueArticle(item: Unsealed): CatalogArticle {
  return {
    sku: item.sku,
    name: item.name,
    category: item.category,
    canonicalMillicents: item.unitPriceMillicents,
  } as CatalogArticle;
}

/**
 * **Le même article, au tarif qu'il avait à une date** — sceau **refrappé**.
 *
 * La lecture datée du tableau de tarification rejoue le canonique d'alors :
 * elle réécrivait `unitPriceMillicents` par un spread, ce qui laissait le sceau
 * porter le prix d'**aujourd'hui**. Deux vérités dans un objet, et c'est la plus
 * ancienne qui décidait du prix affiché.
 *
 * 🔴 **La marque l'a fait rougir le jour même**, et c'est exactement ce qu'on lui
 * demande : un article dont le prix change ne peut pas garder son sceau. Le
 * geste porte donc un nom, et il vit dans `catalog/` — **changer le tarif d'un
 * article est un geste du catalogue**, pas une retouche d'objet chez le lecteur
 * qui l'affiche.
 */
export function atCanonicalPrice<T extends { readonly sku: string; readonly name: string }>(
  item: T & { readonly category: string; readonly unitPriceMillicents: number },
  unitPriceMillicents: number,
): T & { readonly unitPriceMillicents: number; readonly article: CatalogArticle } {
  return {
    ...item,
    unitPriceMillicents,
    article: catalogueArticle({
      sku: item.sku,
      name: item.name,
      category: item.category,
      unitPriceMillicents,
    }),
  };
}
