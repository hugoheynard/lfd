/**
 * **« Souvent pris avec »** (lot R2 de
 * `documentation/recommandation-produit/plan-recommandation-de-produits.md`) —
 * le calcul pur, sans horloge ni base.
 *
 * Une paire (article du panier, autre article) vaut le nombre de **clients
 * distincts** qui les ont commandés dans la MÊME commande. Le client est la
 * société pour un pro, la personne sinon ; il ne sort jamais de la requête
 * (`CoPurchaseReader`), seul son compte en sort.
 */

/** La fenêtre glissante, en jours métier, aujourd'hui compris : un trimestre. */
export const BOUGHT_WITH_WINDOW_DAYS = 90;

/**
 * **Le seuil d'anonymat** : une paire faite par moins de clients distincts
 * n'est jamais proposée — sans lui, « souvent pris avec » trahirait le
 * panier d'une seule personne (`historique-du-particulier.md` §1 bis). Même
 * valeur que le tableau des audiences (`AUDIENCE_MIN_CLIENTS`, lot A1),
 * tenue à part : les deux contextes ne se lisent pas, la règle est la même.
 */
export const BOUGHT_WITH_MIN_CLIENTS = 5;

/**
 * **Combien d'articles calculés le panier montre** : une place, APRÈS celle
 * du staff (`STAFF_CART_PLACES`). Le décidé garde la sienne ; le calculé ne la
 * prend pas quand aucune règle ne s'applique, il a la sienne — un panier
 * montre donc au plus deux cartes.
 */
export const BOUGHT_WITH_CART_PLACES = 1;

/**
 * Combien de paires la base rend au plus : le filtre de la boutique en
 * écarte (pas servi, pas commandable ce jour-là), il faut de quoi remplir la
 * place après lui. Bien au-delà d'un panier réel.
 */
export const BOUGHT_WITH_CANDIDATES = 20;

/**
 * Les commandes qui disent ce que les clients prennent ensemble — même
 * périmètre que le tableau des audiences (A1, `audiences/domain/audience-scope.ts`,
 * relu le 2026-10-18) :
 *
 * - exclues : le brouillon (personne n'a commandé), l'annulée et la carte
 *   non encaissée (rien n'a été pris) ;
 * - GARDÉES : les commandes saisies par le staff. Les chiffres des
 *   suggestions (RS6) les écartent parce qu'elles n'ont vu aucune
 *   suggestion ; ici on lit ce que le client prend, et une commande prise au
 *   téléphone est son panier ;
 * - exclues : les commandes nées d'un abonnement — leur panier a été composé
 *   une fois, peut-être bien avant la fenêtre, et le planificateur le répète.
 */
export const BOUGHT_WITH_EXCLUDED_ORDER_STATUSES = ["draft", "cancelled"] as const;

/** Les règlements d'une commande prise : au compte, gratuit, ou encaissé. */
export const BOUGHT_WITH_COUNTED_PAYMENT_STATUSES = ["not_required", "paid"] as const;

/** Une paire, telle que la base la rend. */
export interface CoPurchasePair {
  /** L'article du panier. */
  readonly anchorSku: string;
  /** L'article commandé avec lui. */
  readonly withSku: string;
  /** Combien de clients distincts ont fait la paire — jamais exposé. */
  readonly clients: number;
}

/** Un article calculé, et l'article du panier qui le fait proposer. */
export interface BoughtWithCandidate {
  readonly sku: string;
  readonly withSku: string;
}

/** Ce qu'on ne propose pas : le panier, et ce que le staff montre déjà. */
export interface BoughtWithExclusions {
  readonly inCart: readonly string[];
  readonly taken: readonly string[];
}

/**
 * **Les candidats, classés** : chaque article proposé une seule fois, au
 * score de sa MEILLEURE paire — additionner les paires de deux articles du
 * panier compterait deux fois un même client. Le score est le nombre de
 * clients distincts (le soutien), pas la part conditionnelle : sur de petits
 * volumes, une part de 5 sur 6 dirait plus fort ce qui est le plus fragile.
 *
 * Ordre stable : le soutien décroissant, puis le SKU proposé, puis l'article
 * du panier. Une paire sous le seuil est écartée ici aussi, même si la base
 * l'a déjà fait : le seuil est une règle, pas un filtre de requête.
 */
export function rankBoughtWith(
  pairs: readonly CoPurchasePair[],
  exclusions: BoughtWithExclusions,
): readonly BoughtWithCandidate[] {
  const excluded = new Set([...exclusions.inCart, ...exclusions.taken]);
  const anchors = new Set(exclusions.inCart);
  const best = new Map<string, CoPurchasePair>();
  for (const pair of pairs) {
    if (
      pair.clients < BOUGHT_WITH_MIN_CLIENTS ||
      !anchors.has(pair.anchorSku) ||
      excluded.has(pair.withSku)
    ) {
      continue;
    }
    const current = best.get(pair.withSku);
    if (current === undefined || before(pair, current)) {
      best.set(pair.withSku, pair);
    }
  }
  return [...best.values()]
    .sort((a, b) => (before(a, b) ? -1 : 1))
    .map((pair) => ({ sku: pair.withSku, withSku: pair.anchorSku }));
}

/** `a` passe-t-il avant `b` ? Soutien, puis SKU proposé, puis article du panier. */
function before(a: CoPurchasePair, b: CoPurchasePair): boolean {
  if (a.clients !== b.clients) {
    return a.clients > b.clients;
  }
  if (a.withSku !== b.withSku) {
    return a.withSku < b.withSku;
  }
  return a.anchorSku < b.anchorSku;
}
