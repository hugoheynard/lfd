import { Injectable, Logger } from "@nestjs/common";

import { EInvoiceTransport, type TransmittedInvoice } from "../domain/ports/e-invoice-transport.js";

/**
 * **Le dépôt à la main** (plan `plan-clients-publics-chorus.md`, T4) : rien
 * n'est envoyé. La facture publique émise entre d'elle-même dans la file
 * « À déposer » (une facture sans ligne de dépôt, `ChorusInvoicesReader`) ;
 * la comptabilité la télécharge, la dépose sur Chorus Pro et note la date.
 */
@Injectable()
export class ManualChorusDeposit extends EInvoiceTransport {
  private readonly logger = new Logger(ManualChorusDeposit.name);

  transmit(invoice: TransmittedInvoice): Promise<void> {
    this.logger.log(`Facture ${invoice.number} : à déposer sur Chorus Pro, à la main.`);
    return Promise.resolve();
  }
}
