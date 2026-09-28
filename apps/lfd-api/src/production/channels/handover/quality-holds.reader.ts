/**
 * **Ce que la production répond au retrait** : lesquelles de ces commandes
 * sont retenues par un contrôle qualité (`plan-controle-qualite.md`, D4, D6).
 *
 * 🔴 **Le sens est l'INVERSE de `AttestedHandoversReader`**, rangé dans le même
 * dossier. Ici, la production PUBLIE et implémente ; le retrait lit. C'est la
 * figure de `pim/channels/b2b-platform/` : le contrôle est un fait de la
 * production (D1), et `production → handover` est interdit — c'est donc au
 * retrait de venir poser la question, par ce seul chemin.
 *
 * ## Par lot, jamais une commande à la fois
 *
 * La file du comptoir porte N commandes : une question unitaire y ferait N
 * allers-retours pour peindre un écran. Le geste et l'écran avant le geste en
 * posent une seule, avec une liste d'un élément.
 *
 * ## Ce que la réponse ne sait pas
 *
 * Ce qui est déjà parti. La production ne lit pas `order_handover`, et une
 * commande retirée peut figurer dans le résultat. C'est `handoverBlocker` qui
 * dit « déjà retirée » AVANT « en vérification » (D4) — ne pas filtrer ici.
 *
 * ⚠️ Un lecteur sans jour de service n'a rien à demander : une commande sans
 * date demandée n'est dans aucun plan, et un contrôle de commande exige qu'elle
 * y soit (`scopeQualityTarget`) — aucune retenue ne peut la viser (vérifié le
 * 2026-09-28). Pas de méthode sans jour, donc.
 */
export abstract class QualityHoldsReader {
  /**
   * Le sous-ensemble de `orderIds` retenu ce jour-là : verdict courant
   * `blocking` sur la commande, ou sur un SKU qu'une de ses lignes du plan
   * porte (D6).
   *
   * @param serviceDay jour de service `AAAA-MM-JJ` — la date demandée de la
   *   commande, celle qui la range dans un plan.
   * @param orderIds identifiants opaques du commerce, ceux que le plan garde.
   */
  abstract heldOrders(
    serviceDay: string,
    orderIds: readonly string[],
  ): Promise<ReadonlySet<string>>;
}
