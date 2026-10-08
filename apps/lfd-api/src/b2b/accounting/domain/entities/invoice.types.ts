import type { InvoiceVatBreakdown } from "@lfd/money";

import type { InvoiceUnitCode } from "../value-objects/invoice-unit.js";
import type { StatementBuyer, StatementSeller } from "./billing-statement.js";

/**
 * Les types de **l'agrégat `Invoice`** (plan
 * `documentation/facturation/plan-emission-de-la-facture.md`, § 5, lot E1).
 */

/** 380 facture commerciale, 381 avoir — UNTDID 1001, BT-3. */
export const COMMERCIAL_INVOICE = "380";
export const CREDIT_NOTE = "381";
export type InvoiceTypeCode = typeof COMMERCIAL_INVOICE | typeof CREDIT_NOTE;

/**
 * Le vendeur figé : le même bloc que l'arrêté imprime (`StatementSeller`),
 * recopié de l'entité au jour de l'émission.
 */
export type InvoiceSeller = StatementSeller;

/**
 * L'acheteur figé — le **payeur légal** (Q3 : la maison mère pour un site qui
 * suit sa facturation). Même bloc que l'arrêté ; un champ vide y est inconnu
 * de la fiche, et l'émission le refuse plutôt que de le deviner.
 */
export type InvoiceBuyer = StatementBuyer;

/**
 * Les mentions de la facture, toutes **renseignées** : l'émission refuse tant
 * qu'une manque (`invoiceIssuanceBlockers`). Copiées de l'entité, jamais
 * relues.
 */
export interface InvoiceMentions {
  readonly latePenaltyRateBasisPoints: number;
  readonly recoveryIndemnityCents: number;
  readonly earlyPaymentDiscount: string;
  /** La catégorie d'opération de la réforme : nous livrons des biens. */
  readonly operationCategory: "goods";
  /** L'option pour le paiement de la TVA d'après les débits : jamais prise. */
  readonly vatOnDebits: false;
}

/** Une ligne émise : un produit, à un prix, à un taux (D2), HT repris des bons (F6). */
export interface InvoiceLineInput {
  readonly sku: string;
  readonly label: string;
  readonly unitCode: InvoiceUnitCode;
  /** En millièmes entiers d'unité (`InvoiceQuantity`) — 1 pièce = 1000. */
  readonly quantityThousandths: number;
  readonly unitPriceMillicents: number;
  readonly vatRate: number;
  readonly amountCents: number;
}

/**
 * Un bon couvert (BT-13) et sa date de livraison **réelle** — `null` tant
 * qu'aucun fait de retrait ou de tournée ne la donne : jamais la date
 * demandée à sa place.
 */
export interface InvoiceOrderReference {
  readonly orderId: string;
  readonly reference: string;
  /** `AAAA-MM-JJ`, ou `null` : non livré (ou inconnu) au jour de l'émission. */
  readonly deliveredOn: string | null;
}

/** UNTDID 4461 — le prélèvement SEPA, seul moyen que la facture du mois porte. */
export const SEPA_DIRECT_DEBIT = "59";

/**
 * Le moyen de paiement figé à l'émission (BG-16, lot E4) : le prélèvement
 * SEPA sous le mandat EFFECTIF du payeur au jour de l'émission. L'ICS
 * (BT-90) se relit sur le vendeur figé ; la RUM (BT-89) est la seule chose
 * que le mandat ajoute. Un lot préparé plus tard sous un autre mandat ne
 * réécrit pas la facture.
 */
export interface InvoicePaymentMeans {
  readonly code: typeof SEPA_DIRECT_DEBIT;
  /** BT-89 — la RUM du mandat. */
  readonly mandateReference: string;
}

/** Tout ce que la facture fige — la forme persistée et relue (E2). */
export interface InvoiceState {
  readonly id: string;
  readonly number: string;
  readonly type: InvoiceTypeCode;
  /** L'id de la facture corrigée, pour un avoir ; `null` pour une facture. */
  readonly correctedInvoiceId: string | null;
  readonly correctedInvoiceNumber: string | null;
  readonly legalEntityId: string;
  /** `AAAA-MM-JJ`. */
  readonly issuedOn: string;
  /** `AAAA-MM-JJ` ; `null` pour un avoir, qui n'appelle aucun paiement. */
  readonly dueOn: string | null;
  readonly seller: InvoiceSeller;
  readonly buyer: InvoiceBuyer;
  /** `null` quand elle ne diffère pas de l'adresse de facturation. */
  readonly deliveryAddressLines: readonly string[] | null;
  readonly orders: readonly InvoiceOrderReference[];
  readonly lines: readonly InvoiceLineInput[];
  readonly vat: InvoiceVatBreakdown;
  readonly mentions: InvoiceMentions;
  /** `null` : aucun mandat unique à l'émission, ou un avoir. */
  readonly paymentMeans: InvoicePaymentMeans | null;
  readonly documentKey: string | null;
  readonly documentSha256: string | null;
}
