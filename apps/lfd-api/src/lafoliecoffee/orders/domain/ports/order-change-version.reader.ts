/**
 * **Lire le numéro `orders-all`** — le journal de toutes les commandes
 * (`public.order_change`, `plan-veilleur-unique.md` § 3.2), alimenté par les
 * déclencheurs de `orders`, `order_lines` et `order_shortfall`, jamais par le
 * code. Séparé du balayage (ISP) : l'écran qui veille ne purge rien.
 *
 * Aucun mur tenant : le journal ne porte ni société ni commande, seulement
 * « quelque chose a été écrit ».
 */
export abstract class OrderChangeVersionReader {
  /** Le numéro du journal (`journalVersion`), `0` s'il est vide. Comparé par égalité. */
  abstract versionOf(): Promise<number>;
}
