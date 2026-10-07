/** Ce que le passage a fait : les jours pour lesquels la cloche a été tendue. */
export interface RoundsGapBellReport {
  /** Jours `AAAA-MM-JJ` en alerte à ce passage (la cloche dédoublonne). */
  readonly alerted: readonly string[];
}

/**
 * **Le passage « hors tournée »** (`documentation/livraisons/tournees/composition-automatique.md`,
 * §5, l'alerte avant le jour J) : prévenir le bureau quand le jour de
 * livraison est aujourd'hui, ou demain à partir de 16 h, que le plan est
 * arrêté et que des livraisons ne sont dans aucune tournée enregistrée.
 */
export class RingRoundsGapBellCommand {}
