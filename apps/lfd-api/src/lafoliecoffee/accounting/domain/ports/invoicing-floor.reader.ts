/**
 * La **mise en service de la facture par période** (`invoicing_floor`), pour
 * le passage automatique : il ne rattrape aucune clôture qui la précède (R3).
 *
 * Un port à part de `MonthlyInvoicingReader`, qui sert l'émission et lit les
 * bons : le passage n'en appelle rien d'autre (ISP).
 */
export abstract class InvoicingFloorReader {
  /** La mise en service ; `null` si la ligne a disparu. */
  abstract floor(): Promise<Date | null>;
}
