import { Injectable } from "@nestjs/common";

import { CustomerDocumentStore } from "../../../../platform/storage/customer-document-store.js";
import type { PeriodQuoteSnapshot } from "../../domain/entities/period-quote.js";
import {
  PeriodQuoteOutdatedError,
  PeriodQuoteSellerMissingError,
} from "../../domain/errors/period-quote-errors.js";
import { InvoiceFontSource } from "../../domain/ports/invoice-font-source.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { PeriodQuoteOrdersReader } from "../../domain/ports/period-quote-orders.reader.js";
import { QuoteMercurialeReader } from "../../domain/ports/quote-mercuriale.reader.js";
import { periodQuoteFigures } from "../../domain/services/period-quote-fingerprint.js";
import {
  periodQuoteDocumentKey,
  periodQuoteFileName,
  renderPeriodQuotePdf,
  type PeriodQuoteSeller,
} from "../../domain/services/period-quote-pdf.js";

/** Le document d'un devis, tel que l'envoi le joint : rangé, désigné par sa clé. */
export interface PeriodQuoteDocument {
  readonly fileName: string;
  /** La clé au stockage des pièces client. */
  readonly key: string;
  /** Le vendeur imprimé — l'e-mail le nomme. */
  readonly sellerName: string;
}

/**
 * **Rend et range le PDF d'une version de devis, une fois** (QD4) :
 * `quotes/<entité>/<numéro>-v<version>.pdf`. Une version déjà rangée n'est
 * pas rendue à nouveau : son fichier est celui qui est parti, et le renvoi
 * de la même version joint le même.
 *
 * Le rendu se fait sur les commandes du devis telles qu'elles sont, et
 * seulement si leur empreinte est encore celle du devis : un document qui
 * contredirait le devis rangé ne part pas.
 *
 * Hors de toute transaction : le stockage est un appel réseau.
 *
 * @throws {PeriodQuoteOutdatedError} les commandes ont changé depuis le rangement.
 * @throws {PeriodQuoteSellerMissingError} l'entité du devis est introuvable.
 */
@Injectable()
export class PeriodQuoteDocumentRenderer {
  constructor(
    private readonly orders: PeriodQuoteOrdersReader,
    private readonly entities: LegalEntityReader,
    private readonly mercuriales: QuoteMercurialeReader,
    private readonly fonts: InvoiceFontSource,
    private readonly kept: CustomerDocumentStore,
  ) {}

  async ensure(quote: PeriodQuoteSnapshot): Promise<PeriodQuoteDocument> {
    const seller = await this.sellerOf(quote.legalEntityId);
    const document = {
      fileName: periodQuoteFileName(quote),
      key: periodQuoteDocumentKey(quote),
      sellerName: seller.name,
    };
    if ((await this.kept.readIfPresent(document.key)) !== null) {
      return document;
    }
    const orders = await this.orders.liveOrdersOf(quote.orderIds);
    if (orders.length === 0 || periodQuoteFigures(orders).fingerprint !== quote.fingerprint) {
      throw new PeriodQuoteOutdatedError(quote.number, quote.version);
    }
    const bytes = await renderPeriodQuotePdf({
      quote,
      orders,
      seller,
      // Le dernier instant de la période : la mercuriale qui la ferme.
      mercuriale: await this.mercuriales.labelAt(
        quote.payerCompanyId,
        new Date(quote.periodClosesAt.getTime() - 1),
      ),
      fonts: await this.fonts.load(),
    });
    await this.kept.save(document.key, { bytes, contentType: "application/pdf" });
    return document;
  }

  /** L'entité telle qu'elle s'imprime. */
  private async sellerOf(legalEntityId: string): Promise<PeriodQuoteSeller> {
    const entity = await this.entities.byId(legalEntityId);
    if (entity === null) {
      throw new PeriodQuoteSellerMissingError(legalEntityId);
    }
    return {
      name: entity.name,
      legalForm: entity.legalForm,
      siren: entity.siren,
      vatNumber: entity.vatNumber,
      addressLines: [
        entity.addressLine1,
        ...(entity.addressLine2 === "" ? [] : [entity.addressLine2]),
        `${entity.postalCode} ${entity.city}`,
      ],
    };
  }
}
