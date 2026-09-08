import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/**
 * **Combien de commandes le commerce n'a pas encore basculées**, sur une journée
 * que la production a pourtant arrêtée.
 *
 * ## Pourquoi ce port existe
 *
 * Le couplage est minimal — la production publie, le commerce s'abonne — et le
 * bus vit **en processus** : l'événement n'est ni persisté ni rejoué. Un
 * container qui tombe entre la publication et l'écriture laisse des commandes
 * `placed` sur une journée close, et **rien ne le dirait**.
 *
 * C'est le prix qu'on a accepté en choisissant le couplage minimal. Ce port le
 * rend **visible** plutôt que de faire semblant qu'il n'existe pas : une
 * divergence qu'on ne peut pas voir n'est pas un risque assumé, c'est un pari.
 *
 * ⚠️ Il ne CORRIGE rien. Le rattrapage est de reclore la journée, ce qui
 * republie le fait sans recalculer l'instantané. Un port qui réparerait tout
 * seul cacherait la panne au lieu de la montrer.
 */
export abstract class PendingCommerceOrdersReader {
  /**
   * Zéro attendu sur une journée close. Autre chose = l'abonné a manqué le fait.
   *
   * ⚠️ `closedAt` **borne** le compte, et ce n'est pas un raffinement : une
   * commande passée APRÈS la clôture est légitimement `placed` — elle est en
   * retard, pas perdue. Sans cette borne, une journée close et une commande
   * tardive suffiraient à faire crier une divergence qui n'existe pas, et
   * l'alerte deviendrait du bruit qu'on cesse de lire.
   */
  abstract pendingFor(day: ServiceDay, closedAt: Date): Promise<number>;

  /**
   * Parmi ces commandes **dont le fournil a fait le bac**, combien le commerce
   * n'a-t-il pas encore avancées ?
   *
   * 🔴 Cette question n'avait pas de réponse jusqu'au 2026-09-08, et c'était le
   * trou du dispositif : `pendingFor` ne voit qu'une clôture perdue. Un
   * `OrderPackedEvent` perdu, lui, ne se voyait **nulle part** — ni écran, ni
   * compteur —, et le client restait bloqué à « au fournil » sans que personne
   * puisse le savoir autrement qu'en regardant deux tables à la main.
   *
   * ⚠️ C'est le COMMERCE qui décide ce que « pas encore avancée » veut dire : la
   * production n'a pas à connaître l'énuméré de ses statuts. Même raison que la
   * règle « producible », et même conséquence — le jour où un statut s'ajoute,
   * un seul fichier bouge.
   */
  abstract behindOnPacking(references: readonly string[]): Promise<number>;

  /**
   * La même question pour la **remise** : parmi ces commandes attestées remises
   * au comptoir du fournil, combien le commerce n'a-t-il pas encore closes ?
   *
   * Les références viennent de la table des attestations, pas du plan : une
   * commande passée après la clôture est remettable sans y figurer, et c'est
   * exactement celle qu'un compteur adossé au plan ne verrait jamais.
   */
  abstract behindOnHandover(references: readonly string[]): Promise<number>;
}
