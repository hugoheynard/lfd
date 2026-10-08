import { instantToLocal } from "@lfd/contracts";

import { BusinessError, DomainError } from "../../../platform/shared/errors/app-error.js";
import { statementSellerOf } from "../domain/entities/billing-statement.js";
import type { Invoice } from "../domain/entities/invoice.js";
import { InvoiceIssuanceBlockedError } from "../domain/errors/invoice-errors.js";
import type { CardInvoiceOutcomeKey } from "../domain/ports/card-invoice-outcomes.js";
import type { CreditorReader } from "../domain/ports/creditor.reader.js";
import type { InvoiceIssuersReader } from "../domain/ports/invoice-issuers.reader.js";
import type { StatementBuyerReader } from "../domain/ports/statement-buyer.reader.js";
import { billedPayerOf } from "../domain/services/billed-payer.js";
import {
  CARD_PAYMENT_MEANS,
  cardInvoiceDueOn,
  type CardInvoiceCandidate,
} from "../domain/services/card-invoicing.js";
import { invoiceFromDossier } from "../domain/services/invoice-from-dossier.js";
import { isBillable } from "../domain/services/invoice-billability.js";
import { simulateInvoiceDossier } from "../domain/services/invoice-dossier.js";
import {
  invoiceIssuanceBlockers,
  severalIssuersBlocker,
} from "../domain/services/invoice-issuance-blockers.js";
import { InvoiceNumber } from "../domain/value-objects/invoice-number.js";

/** Ce que la préparation lit — une fois par commande. */
export interface CardInvoiceReaders {
  readonly creditors: CreditorReader;
  readonly issuers: InvoiceIssuersReader;
  readonly buyers: StatementBuyerReader;
}

/**
 * La facture carte, prête à numéroter — ou le refus, en clair.
 *
 * 🔴 Tout ce qui peut REFUSER se juge ICI, avant qu'un numéro soit pris :
 * l'abonné durable qui l'appelle tourne dans la transaction de son reçu, et
 * un refus levé après `InvoiceNumbering.next` laisserait le compteur avancé
 * dans une transaction que l'abonné validerait — un trou dans la séquence.
 * D'où le brouillon construit à blanc sous un numéro factice : l'agrégat a dit
 * tout ce qu'il avait à dire avant le vrai.
 */
export type CardInvoicePreparation =
  | { readonly kind: "blocked"; readonly key: CardInvoiceOutcomeKey; readonly message: string }
  | {
      readonly kind: "ready";
      readonly key: CardInvoiceOutcomeKey & { readonly legalEntityId: string };
      readonly issuedOn: string;
      readonly draft: (number: InvoiceNumber) => Invoice;
    };

/**
 * @param id l'identifiant de la future facture (`IdGenerator`).
 * @param at l'instant de l'émission (`Clock`) — son jour local est la date
 *        d'émission (§ 2 bis-2), jamais le jour du retrait.
 */
export async function prepareCardInvoice(
  readers: CardInvoiceReaders,
  candidate: CardInvoiceCandidate,
  id: string,
  at: Date,
): Promise<CardInvoicePreparation> {
  const payerId = billedPayerOf(
    {
      companyId: candidate.companyId ?? "",
      placedAt: candidate.placedAt,
      billedCompanyId: candidate.billedCompanyId,
    },
    candidate.follows,
  );
  const buyer = (await readers.buyers.buyersOf([payerId])).get(payerId) ?? null;
  const base = {
    orderId: candidate.orderId,
    orderNumber: candidate.orderNumber,
    payerCompanyId: payerId,
    payerName: buyer?.name ?? payerId,
    at,
  };
  const blocked = (
    message: string,
    legalEntityId: string | null = null,
  ): CardInvoicePreparation => ({
    kind: "blocked",
    key: { ...base, legalEntityId },
    message,
  });
  const issuers = await readers.issuers.activeIssuers();
  const [seller, ...others] = issuers;
  if (seller === undefined || others.length > 0) {
    const blockers =
      seller === undefined
        ? invoiceIssuanceBlockers(null, buyer)
        : [severalIssuersBlocker(issuers.length)];
    return blocked(new InvoiceIssuanceBlockedError(blockers).message);
  }
  const entityId = seller.legalEntityId;
  const blockers = invoiceIssuanceBlockers(seller, buyer);
  if (blockers.length > 0) {
    return blocked(new InvoiceIssuanceBlockedError(blockers).message, entityId);
  }
  if (!isBillable(candidate.frozen)) {
    return blocked(
      `Le bon ${candidate.orderNumber} est incohérent ou sans taux de TVA : il ne se facture ` +
        "pas — le signaler à l'équipe technique.",
      entityId,
    );
  }
  const computed = simulateInvoiceDossier([candidate.frozen]).invoice;
  if (computed.vat.totalCents !== candidate.totalCents) {
    return blocked(
      `Le TTC recalculé du bon ${candidate.orderNumber} (${String(computed.vat.totalCents)} c) ` +
        `diffère de l'encaissé (${String(candidate.totalCents)} c) : la facture acquittée ne ` +
        "tomberait pas juste — le signaler à l'équipe technique.",
      entityId,
    );
  }
  try {
    const creditor = await readers.creditors.snapshot(entityId);
    if (creditor === null) {
      return blocked(`L'entité émettrice ${seller.name} est introuvable.`, entityId);
    }
    const issuedOn = instantToLocal(at).day;
    const paidOn = instantToLocal(candidate.paidAt ?? at).day;
    const draft = (number: InvoiceNumber): Invoice =>
      invoiceFromDossier({
        id,
        number,
        issuedOn,
        dueOn: cardInvoiceDueOn(paidOn, issuedOn),
        sellerFacts: seller,
        seller: statementSellerOf(creditor),
        buyer,
        deliveryAddressLines: null,
        orders: [
          {
            orderId: candidate.orderId,
            reference: candidate.orderNumber,
            deliveredOn:
              candidate.handedOverAt === null ? null : instantToLocal(candidate.handedOverAt).day,
          },
        ],
        paymentMeans: CARD_PAYMENT_MEANS,
        prepayment: { amountCents: candidate.totalCents, paidOn },
        computed,
      });
    // À blanc, sous un numéro de la bonne année : seul le rang changera.
    draft(InvoiceNumber.compose(Number(issuedOn.slice(0, 4)), 1));
    return { kind: "ready", key: { ...base, legalEntityId: entityId }, issuedOn, draft };
  } catch (error: unknown) {
    if (error instanceof DomainError || error instanceof BusinessError) {
      return blocked(error.message, entityId);
    }
    throw error;
  }
}
