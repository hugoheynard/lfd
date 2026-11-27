/**
 * **« Cet arrêt est-il toujours celui de la journée ? Tiens-le le temps de mon
 * geste »** — port que le fournil DÉCLARE et IMPLÉMENTE, que le commerce
 * appelle quand il apprend un arrêt (`production.day_closed`) avant de
 * confirmer ses commandes.
 *
 * La boîte d'envoi ne garantit aucun ordre : le fait d'arrêt peut arriver
 * après une réouverture, quand la remise du commerce est déjà passée.
 * Confirmer alors laisserait des commandes `confirmed` sur une journée
 * ouverte : aucun plan ne les porte, et le prochain arrêt attendrait leur
 * remise sans fin (`ReopenReleasePending`). Le commerce ne confirme donc que
 * si la journée est encore arrêtée par CET arrêt (`closed_at` égal à
 * l'instant du fait) — une réannonce publie le même instant, et confirme.
 *
 * `holdIfCurrent` prend le verrou de la journée en mode PARTAGÉ, dans la
 * transaction de l'appelant et jusqu'à son `COMMIT` : une réouverture
 * (verrou exclusif) attend que la confirmation soit validée, et sa remise la
 * voit. Hors d'une unité de travail, l'adaptateur refuse.
 *
 * `production → lafoliecoffee` reste interdit : le fournil ne sait pas qui
 * l'appelle.
 */
export abstract class CurrentArrestHold {
  /** `true` si `closedAt` est l'arrêt en vigueur de la journée, lu sous le verrou partagé. */
  abstract holdIfCurrent(serviceDay: string, closedAt: Date): Promise<boolean>;
}
