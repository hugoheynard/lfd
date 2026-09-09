/**
 * Port de lecture : **cette décision a-t-elle réellement facturé ?**
 *
 * ## Ce qu'il sert à refuser
 *
 * Depuis que clore **borne** la fenêtre (R17), une décision rangée garde sa
 * place dans le passé. Reposer par-dessus cette période réécrirait alors
 * l'explication d'une facture — la trace figée sur la commande garderait
 * l'ancien montant, et le tarif relu en raconterait un autre.
 *
 * 🔴 **Mais « rétroactif » n'est pas la bonne frontière**, et c'est tout l'objet
 * de ce port. Un barème posé puis rangé dix minutes plus tard n'a rien facturé :
 * le reposer sur la même période est le geste ordinaire « je me suis trompé, je
 * recommence », et son e2e l'atteste (`admin-pricing.e2e-spec.ts`, « libère la
 * cible en archivant »). Interdire toute pose rétroactive aurait supprimé ce
 * geste pour protéger un cas qui ne se produisait pas.
 *
 * La frontière juste est donc **a-t-elle facturé**, pas **est-elle passée**.
 *
 * ## Pourquoi un port, et pas une lecture directe
 *
 * La réponse vit dans les **commandes** — la trace figée de chaque ligne cite
 * les décisions qui ont produit son prix. `b2b/pricing` ne lit pas les tables de
 * `b2b/orders` : la dépendance a été retirée le 2026-09-09 et une porte de CI la
 * tient. Le contexte qui a besoin du fait **déclare** ce qu'il lui faut ; celui
 * qui le détient l'implémente, et `appBootstrap` les relie. Même forme que
 * `production/channels/commerce/`.
 *
 * ## Ce que le port NE promet pas
 *
 * Il répond sur une décision **nommée**, pas sur une période. Trouver les
 * décisions rangées qui recouvrent la fenêtre demandée reste le travail de
 * l'écriture, qui seule connaît la clé d'exclusion de sa table — six colonnes
 * pour une règle, une pour une mercuriale.
 */
export abstract class PricedDecisionsReader {
  /**
   * Cette décision figure-t-elle dans la trace d'au moins une ligne de commande ?
   *
   * `true` est **définitif** : une facture l'a citée, et rien ne la décitera.
   * `false` peut vieillir — une commande passée une seconde plus tard le
   * renverse —, et c'est pourquoi la question se pose au moment de **poser**,
   * jamais pour décider d'un prix.
   */
  abstract hasPriced(decisionId: string): Promise<boolean>;

  /**
   * La même question pour plusieurs décisions, en **une** lecture.
   *
   * Concrète et servie par {@link hasPriced} par défaut : un adaptateur qui sait
   * faire mieux — un seul `WHERE ... IN` — la remplace. Poser une mercuriale
   * peut avoir à interroger plusieurs rangées d'un coup, et N lectures sur le
   * chemin d'un écran de staff se voient.
   */
  async anyPriced(decisionIds: readonly string[]): Promise<boolean> {
    const answers = await Promise.all(decisionIds.map((id) => this.hasPriced(id)));
    return answers.includes(true);
  }
}
