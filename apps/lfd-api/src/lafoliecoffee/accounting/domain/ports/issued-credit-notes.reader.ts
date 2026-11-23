/**
 * Un avoir (facture 381) émis, tel qu'il a été figé : ses montants se lisent
 * tels quels, jamais recalculés.
 */
export interface IssuedCreditNote {
  readonly number: string;
  /** Le jour d'émission, `AAAA-MM-JJ`. */
  readonly issuedOn: string;
  /**
   * Le payeur légal, identifiant opaque d'une société : l'avoir ne porte pas
   * de colonne de nom, celui qu'il a figé vit dans son JSON `buyer`, et
   * l'export nomme la société par son enseigne d'aujourd'hui.
   */
  readonly payerCompanyId: string;
  readonly totalHtCents: number;
  readonly totalVatCents: number;
  readonly totalTtcCents: number;
  /**
   * Les numéros des commandes que l'avoir nomme (`invoice_order`), dans
   * l'ordre de la pièce ; vide pour un geste global sur la facture.
   */
  readonly orderNumbers: readonly string[];
}

/**
 * **Les avoirs émis dans une période** — lecture publiée par la comptabilité,
 * propriétaire des pièces, pour l'export des ventes : au compte, un avoir est
 * le seul signe qu'une vente pro a été réduite. Une requête pour la période.
 */
export abstract class IssuedCreditNotesReader {
  /**
   * Les avoirs dont le jour d'émission est entre `fromDay` et `toDay`, bornes
   * incluses (`AAAA-MM-JJ`, validés par l'appelant), par jour puis par numéro.
   */
  abstract issuedBetween(fromDay: string, toDay: string): Promise<readonly IssuedCreditNote[]>;
}
