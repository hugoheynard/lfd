/**
 * **Sur quel ÉTAT DU MONDE la question porte.**
 *
 * Deuxième axe d'une demande de prix, à côté de {@link PriceLens} — et il ne
 * faut pas les confondre :
 *
 * - la **lentille** dit ce que la question a le droit de _prouver_ (engagements,
 *   historique) ;
 * - l'**époque** dit dans quel état du monde on la pose : celui d'aujourd'hui,
 *   ou celui d'un instant passé.
 *
 * ## Pourquoi ça ne se déduit pas de `at`
 *
 * Ça se déduit, mais **pas là où `at` est lu**. `Pricer` seul tient à la fois
 * l'instant demandé et l'horloge ; le chargeur et les lecteurs, non. Faire
 * descendre l'horloge jusqu'aux lecteurs pour qu'ils recalculent chacun la même
 * comparaison, ce serait trois encodages d'une seule décision — exactement
 * l'éparpillement par lequel R15 s'est glissé.
 *
 * La comparaison se fait donc **une fois**, à l'endroit qui a les deux valeurs,
 * et le résultat voyage sous ce nom.
 *
 * ## Ce que chaque valeur change, concrètement
 *
 * | | `current` | `replay` |
 * | --- | --- | --- |
 * | clause d'archivage | `archived_at IS NULL` | `unarchivedAt(at)` |
 * | cache de matériaux | **utilisé** | **contourné** |
 *
 * 🔴 **Le contournement du cache n'est pas de l'hygiène.** Le cache retient des
 * **tables entières, pour tous les clients**, sous une clé qui ne porte que le
 * nom de la table. Une seule lecture datée qui s'y rangerait servirait ensuite
 * des lignes rangées **au chemin qui facture** — un prix faux, durable, et pour
 * tout le monde.
 *
 * ## Pourquoi une lecture datée doit lire les rangées
 *
 * Depuis le 2026-09-09, clore **borne** la fenêtre : une décision rangée porte
 * donc sa vraie fin, et le domaine sait déjà l'écarter (`isInForce`). Mais la
 * clause `archived_at IS NULL` du chemin courant la ferait **disparaître** du
 * passé — c'est le défaut R17, et c'est cette valeur qui le ferme.
 *
 * Lire les rangées ne rouvre pas l'ambiguïté que la clause partielle protégeait :
 * une décision rangée l'est après la fin de sa fenêtre, donc elle n'occupe plus
 * le créneau d'une remplaçante.
 */
export type PriceEpoch = "current" | "replay";

/**
 * La question porte-t-elle sur un état **passé** du monde ?
 *
 * Exportée plutôt que testée en ligne : le jour où une troisième époque
 * apparaîtrait — une projection dans le futur, par exemple —, c'est ici qu'on
 * décide de son camp, une fois, plutôt que dans chaque `if` qui l'aurait
 * supposée binaire.
 */
export function readsArchived(epoch: PriceEpoch): boolean {
  return epoch === "replay";
}

/**
 * L'époque d'une demande, **décidée une seule fois** — à l'endroit qui tient
 * l'instant demandé ET l'horloge.
 *
 * ⚠️ La comparaison est **stricte**. Un `at` égal à l'instant courant est la
 * question d'aujourd'hui : la rendre `replay` contournerait le cache sur le
 * chemin qui facture, pour un résultat identique.
 */
export function epochOf(at: Date, now: Date): PriceEpoch {
  return at.getTime() < now.getTime() ? "replay" : "current";
}
