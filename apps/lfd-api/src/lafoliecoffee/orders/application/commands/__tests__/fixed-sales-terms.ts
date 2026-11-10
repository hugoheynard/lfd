import type { SalesTermsDocument } from "@lfd/contracts";

import {
  OrderSalesTermsReader,
  type SalesTermsInForce,
} from "../../../domain/ports/order-sales-terms.reader.js";

/**
 * Les CGV en vigueur, fixées par le test, texte par texte — par défaut, AUCUN
 * texte rédigé (le repli du vrai lecteur sur une base vierge). Note chaque
 * texte demandé : la passation doit demander celui de l'audience qui tarife,
 * pas le deviner.
 */
export class FixedSalesTerms extends OrderSalesTermsReader {
  readonly asked: SalesTermsDocument[] = [];

  constructor(
    private readonly texts: Partial<Readonly<Record<SalesTermsDocument, SalesTermsInForce>>> = {},
  ) {
    super();
  }

  inForce(document: SalesTermsDocument): Promise<SalesTermsInForce> {
    this.asked.push(document);
    return Promise.resolve(this.texts[document] ?? { revision: null, fileId: null });
  }
}
