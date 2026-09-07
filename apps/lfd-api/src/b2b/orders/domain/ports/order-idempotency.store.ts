/**
 * L'issue d'une tentative de **réclamer** une clé de passation.
 *
 * Quatre, et pas trois : le plan d'origine en comptait trois et la contradiction
 * a montré ce qui manquait — une clé rejouée avec un panier **différent**. Sans
 * ce cas, elle rendait l'ancienne commande, le front vidait le panier corrigé,
 * et l'écran affichait les lignes du nouveau panier sur la commande de l'ancien.
 * Une divergence sans erreur levée.
 */
export type IdempotencyClaim =
  /** La clé est à nous : personne ne l'avait, ou son bail avait expiré. */
  | { readonly kind: "claimed" }
  /** Déjà servie, et le même panier : c'est un rejeu, on rend la même commande. */
  | { readonly kind: "replayed"; readonly orderId: string }
  /** Déjà servie, mais pour AUTRE CHOSE. Ce n'est pas une répétition. */
  | { readonly kind: "mismatch" }
  /** Réclamée à l'instant par un autre appel, encore en vol. */
  | { readonly kind: "in_flight" };

/**
 * **Le registre des clés de passation.**
 *
 * Il répond à une seule question — « cette commande-là a-t-elle déjà été
 * passée ? » — et c'est la BASE qui y répond, pas le code : deux requêtes
 * simultanées qui liraient avant d'écrire trouveraient toutes deux le registre
 * vide et passeraient toutes deux la commande. L'index unique
 * `(user_id, key)` est l'arbitre, exactement comme `handed_over_at IS NULL`
 * arbitre deux scans du même QR.
 *
 * ## `resolve` n'est jamais appelée seule
 *
 * Elle part dans la **même unité de travail** que l'écriture de la commande —
 * c'est le handler qui les enveloppe, et `transactionalPrisma` fait que les deux
 * dépôts rejoignent la transaction sans qu'aucune signature ne le dise.
 *
 * Ce n'est pas un arrangement de commodité, c'est l'invariant du dispositif : il
 * ne doit pas exister d'instant où la commande existe et la clé n'est pas
 * résolue. Un crash dans cet intervalle — déploiement, `SIGTERM`, timeout —
 * laisserait une clé qu'on ne peut ni rendre (la commande existe) ni reprendre
 * (on en passerait une seconde). Les deux écritures ensemble, et l'intervalle
 * n'existe plus.
 *
 * @see `documentation/order/plan-idempotence-de-passation.md` §6.2
 */
export abstract class OrderIdempotencyStore {
  /**
   * Réclame la clé pour cette personne et ce panier.
   *
   * Une clé réclamée mais non résolue depuis plus que le **bail** est réputée
   * abandonnée, et cet appel la reprend. C'est sûr parce qu'aucune commande n'a
   * pu être écrite sous une clé non résolue — cf. la transaction ci-dessus.
   *
   * @param fingerprint empreinte du panier demandé, pour distinguer un rejeu
   * d'une réutilisation de clé sur un contenu corrigé.
   */
  abstract claim(
    userId: string,
    key: string,
    fingerprint: string,
    now: Date,
  ): Promise<IdempotencyClaim>;

  /**
   * **Rend** la clé — et seulement quand rien n'a été écrit.
   *
   * L'appelant ne s'en sert que pour les échecs levés **avant** la persistance :
   * heure limite dépassée, SKU inconnu, zone non desservie, mur de membre. Le
   * client doit pouvoir corriger et renvoyer, et une clé qui resterait prise le
   * bloquerait par le mécanisme censé le protéger.
   *
   * Le critère n'est PAS la nature de l'erreur — `DuplicateResourceError` est
   * une erreur *métier* levée par la persistance, donc de l'autre côté du point
   * de non-retour. C'est sa **position** dans le handler.
   */
  abstract release(userId: string, key: string): Promise<void>;

  /**
   * **Résout** la clé : voilà la commande qui en est sortie.
   *
   * À n'appeler que dans l'unité de travail qui écrit la commande. Appelée
   * seule, elle rouvrirait exactement la fenêtre que tout ce dispositif ferme.
   */
  abstract resolve(userId: string, key: string, orderId: string): Promise<void>;
}

/**
 * **Le bail d'une clé réclamée**, en millisecondes.
 *
 * Deux minutes : franchement plus long que la passation la plus lente — quatre
 * lectures, une résolution de prix par ligne, puis Stripe — et franchement plus
 * court que la patience de quelqu'un qui vient de voir son navigateur planter.
 *
 * Aucune tâche périodique ne le fait respecter, et c'est voulu : l'API n'a pas
 * de planificateur, et ce lot n'en invente pas un. La reprise se fait à la
 * lecture, par la tentative suivante — c'est-à-dire par celui que ça intéresse.
 */
export const IDEMPOTENCY_LEASE_MS = 2 * 60 * 1_000;
