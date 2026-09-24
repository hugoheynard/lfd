import type { CatalogOperation } from "../entities/catalog-operation.js";

/**
 * Port d'**écriture** du miroir des opérations reçues : il prend et rend
 * l'agrégat. Seule l'ingestion d'un envoi l'écrit.
 *
 * Il voit les opérations RETIRÉES, et c'est voulu : une opération qui revient
 * dans un envoi doit être reconnue — sa surcharge l'attend — et une surcharge
 * se pose encore sur une opération retirée qu'on relit.
 */
export abstract class CatalogOperationRepository {
  /** L'opération, retirée comprise, ou `null` si elle n'a jamais été reçue. */
  abstract load(key: string): Promise<CatalogOperation | null>;

  abstract loadAllIncludingWithdrawn(): Promise<CatalogOperation[]>;

  /**
   * Écrit les agrégats. La sélection d'une opération TENUE est remplacée ;
   * celle d'une opération retirée est gardée telle qu'elle était reçue — c'est
   * ce que l'écran de réception montre d'elle.
   */
  abstract saveMany(operations: readonly CatalogOperation[]): Promise<void>;
}
