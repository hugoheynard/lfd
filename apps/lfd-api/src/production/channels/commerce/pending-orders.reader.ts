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
}
