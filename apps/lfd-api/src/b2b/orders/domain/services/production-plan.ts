import type { OrderStatus } from "@lfd/contracts";

/**
 * La règle du **plan du soir** : quelles commandes une journée absorbe.
 *
 * ## Ce que « le plan absorbe » veut dire
 *
 * À la clôture, l'équipe arrête de prendre des commandes pour le lendemain et
 * lance la nuit. Les commandes de cette journée-là entrent dans le compte à
 * produire : elles cessent d'être « passées » pour devenir « confirmées ».
 *
 * **Personne ne décide commande par commande** — c'est tout l'intérêt. Une
 * journée bascule d'un coup, et aucune main ne se pose sur une ligne en
 * particulier. C'est pour ça que la colonne ne porte pas d'auteur.
 *
 * ## Pourquoi une fonction pure plutôt qu'un `where` en dur
 *
 * La condition tient en un mot aujourd'hui (`placed`). Écrite ici, elle se lit,
 * se teste sans base, et surtout **elle se nomme** : le jour où un état
 * s'ajoute, on vient le classer ici plutôt que de deviner ce qu'un `where`
 * voulait dire.
 */

/**
 * Cette commande entre-t-elle dans le plan ?
 *
 * 🔴 **Seules les `placed`.** Une commande déjà `in_production`, `ready` ou
 * `fulfilled` a dépassé le stade : la reconfirmer la ferait **reculer**, et les
 * états ne reculent jamais. Une `cancelled` n'est plus à produire, et une
 * `draft` n'existe pas encore — aucune des deux n'a sa place dans un compte de
 * fournil.
 *
 * Conséquence heureuse : clore deux fois la même journée absorbe zéro la
 * seconde fois. La clôture est **idempotente par sa règle**, pas par un garde
 * ajouté après coup.
 */
export function absorbedByPlan(status: OrderStatus): boolean {
  return status === "placed";
}
