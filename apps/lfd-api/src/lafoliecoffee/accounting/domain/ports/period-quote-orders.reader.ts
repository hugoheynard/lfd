import type { InvoiceableOrder } from "../services/monthly-invoicing.js";

/**
 * Port de **lecture** des commandes d'un devis de période, chiffrables comme
 * la clôture les a lues (`InvoiceableOrder`) : c'est sur elles que
 * l'empreinte se recalcule et que le document se rend (QD4, QD5).
 */
export abstract class PeriodQuoteOrdersReader {
  /**
   * Les commandes demandées, **annulées retirées** — la règle de l'émission
   * (`withoutCancelled`) : une commande annulée depuis le rangement ne sera
   * pas facturée, le devis ne la chiffre plus.
   */
  abstract liveOrdersOf(orderIds: readonly string[]): Promise<readonly InvoiceableOrder[]>;
}
