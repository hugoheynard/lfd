import type { ProductionForecastView } from '@lfd/contracts';

/**
 * **Ce qui est déjà rentré pour demain**, extrait du prévisionnel du fournil.
 *
 * 🔴 Cette lecture vient de la production, et c'est délibéré : le chiffre que le
 * commercial regarde le matin doit être **celui que le fournil fabriquera**. Le
 * recalculer ici depuis la liste des commandes donnerait une seconde définition
 * de « commandé pour demain » — et le jour où elles divergeraient, personne ne
 * saurait laquelle croire.
 *
 * Le grain est le jour de SERVICE (`AAAA-MM-JJ`), jamais un `Date` : une
 * journée de fabrication n'a pas d'heure, et lui en donner une la fait changer
 * de camp au passage à l'heure d'hiver.
 */
export interface TomorrowOrders {
  /** Le jour de service concerné, `AAAA-MM-JJ`. */
  readonly date: string;
  /** Combien de commandes sont déjà posées dessus. */
  readonly orderCount: number;
  /** Et en combien de pièces elles se traduisent au fournil. */
  readonly totalUnits: number;
  /**
   * La journée est **arrêtée** : son chiffre est un fait de fabrication, plus
   * une prévision. Rare pour J+1 — mais un fournil qui ferme tôt le veille d'un
   * jour férié le fait, et afficher « prévu » sur un compte figé mentirait.
   */
  readonly closed: boolean;
}

const DAY_LABEL = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/**
 * La journée `day` telle que le prévisionnel la voit — ou `null` si la lecture
 * a échoué, ou si le serveur n'a pas rendu ce jour-là.
 *
 * On ne retombe PAS sur zéro : « aucune commande pour demain » et « je n'ai pas
 * pu lire » sont deux nouvelles opposées, et la première ferait décrocher le
 * téléphone pour rien.
 */
export function tomorrowOrders(
  view: ProductionForecastView | null,
  day: string,
): TomorrowOrders | null {
  const found = view?.days.find((candidate) => candidate.date === day);
  if (found === undefined) {
    return null;
  }
  return {
    date: found.date,
    orderCount: found.orderCount,
    totalUnits: found.totalUnits,
    closed: found.closed,
  };
}

/** `mardi 16 septembre` — la date en clair, lue en UTC comme le reste du jour de service. */
export function dayLabel(day: string): string {
  return DAY_LABEL.format(new Date(`${day}T00:00:00.000Z`));
}
