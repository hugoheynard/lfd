/**
 * **La ligne-témoin d'une reprise** (`card_payment.takeover`, plan M2,
 * §4.3) : l'instant où la migration a repris l'existant. Écrite par la
 * migration seule ; le bloc ne fait que la lire.
 */
export abstract class TakeoverReader {
  /** L'instant de la reprise du lot (`P0`), ou `null` sans témoin (une base de test vidée). */
  abstract migratedAt(lot: string): Promise<Date | null>;
}
