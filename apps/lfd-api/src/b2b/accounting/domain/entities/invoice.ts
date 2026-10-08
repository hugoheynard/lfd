import type { InvoiceVatBreakdown } from "@lfd/money";

import {
  InvalidInvoiceError,
  InvoiceDocumentAlreadyAttachedError,
} from "../errors/invoice-errors.js";
import type { InvoiceSellerFacts } from "../services/invoice-issuance-blockers.js";
import { InvoiceNumber } from "../value-objects/invoice-number.js";
import {
  assertLines,
  assertPaymentMeans,
  assertPrepayment,
  assertSha256,
  assertTotals,
  assertWithinCorrected,
} from "./invoice-invariants.js";
import { assertCorrectable, assertDates, assertOrders } from "./invoice-shape.js";
import { distinctDeliveryAddress, issuableParties } from "./invoice-parties.js";
import {
  COMMERCIAL_INVOICE,
  CREDIT_NOTE,
  type InvoiceBuyer,
  type InvoiceLineInput,
  type InvoiceOrderReference,
  type InvoicePaymentMeans,
  type InvoicePrepayment,
  type InvoiceSeller,
  type InvoiceState,
} from "./invoice.types.js";

/** Ce que l'émission d'une facture (380) reçoit — tout calculé, rien recalculé ici. */
export interface IssueInvoiceInput {
  readonly id: string;
  /** Attribué par le compteur de l'entité (E2), dans la transaction de l'émission. */
  readonly number: InvoiceNumber;
  readonly issuedOn: string;
  readonly dueOn: string;
  /** `LegalEntity.invoiceSellerFacts()` — ce que les refus jugent ; `null` = aucune entité. */
  readonly sellerFacts: InvoiceSellerFacts | null;
  readonly seller: InvoiceSeller;
  /** Le payeur légal ; `null` = absent de l'annuaire. */
  readonly buyer: InvoiceBuyer | null;
  readonly deliveryAddressLines: readonly string[] | null;
  readonly orders: readonly InvoiceOrderReference[];
  readonly lines: readonly InvoiceLineInput[];
  readonly vat: InvoiceVatBreakdown;
  /** Le mandat effectif du payeur (BG-16) ; `null` s'il n'y en a pas un seul. */
  readonly paymentMeans: InvoicePaymentMeans | null;
  /**
   * Ce qui est déjà payé (BT-113) — la facture carte, acquittée (E5a) ;
   * `null` pour la facture du mois. Exige le moyen « carte », et lui seul.
   */
  readonly prepayment: InvoicePrepayment | null;
}

/** Ce que l'émission d'un avoir (381) reçoit. */
export interface IssueCreditNoteInput {
  readonly id: string;
  readonly number: InvoiceNumber;
  readonly issuedOn: string;
  readonly corrected: Invoice;
  /** Les avoirs DÉJÀ émis sur la même facture : le plafond est ce qui reste. */
  readonly priorCreditNotes: readonly Invoice[];
  /** Les bons visés, parmi ceux de la facture ; vide pour un geste global. */
  readonly orders: readonly InvoiceOrderReference[];
  readonly lines: readonly InvoiceLineInput[];
  readonly vat: InvoiceVatBreakdown;
}

/**
 * **La facture émise** — 380, ou l'avoir 381 qui en corrige une (plan
 * `documentation/comptabilite/facturation/plan-emission-de-la-facture.md`, § 5, lot E1).
 *
 * Une pièce, pas un dossier : AUCUNE méthode ne touche aux montants, aux
 * lignes ni aux parties. Une erreur se corrige par un avoir, jamais en
 * défaisant la facture. Seul le document rendu (§ 6) s'attache, une fois.
 *
 * 🔴 **Pas de statut de paiement.** « Prélevée », « rejetée », « réglée »
 * vivent dans le suivi d'encaissement : un rejet bancaire n'efface pas une
 * vente.
 */
export class Invoice {
  private constructor(
    private readonly state: InvoiceState,
    private documentKeyValue: string | null,
    private documentSha256Value: string | null,
  ) {}

  /**
   * Émet une facture. Les parties sont jugées par `invoiceIssuanceBlockers`
   * AVANT tout le reste : un manque se dit en premier, et en entier.
   *
   * @throws {InvoiceIssuanceBlockedError} un manque nommé (vendeur, mentions, acheteur).
   * @throws {InvalidInvoiceError} date, ligne ou bon mal formé.
   * @throws {InvoiceTotalsMismatchError} la ventilation ne se recompose pas.
   * @throws {InvoiceAssemblyError} numéro d'une autre année que l'émission.
   */
  static issue(input: IssueInvoiceInput): Invoice {
    const number = input.number.value;
    const legalEntityId = input.seller.legalEntityId;
    const parties = issuableParties(
      number,
      legalEntityId,
      input.sellerFacts,
      input.seller,
      input.buyer,
    );
    assertDates(input.number, input.issuedOn, input.dueOn);
    if (input.orders.length === 0) {
      throw new InvalidInvoiceError("bons", "une facture couvre au moins un bon (BT-13)");
    }
    assertOrders(input.orders);
    assertLines(input.lines);
    assertTotals(number, input.lines, input.vat);
    assertPaymentMeans(input.paymentMeans);
    assertPrepayment(number, input.issuedOn, input.paymentMeans, input.prepayment, input.vat);
    return new Invoice(
      {
        id: input.id,
        number,
        type: COMMERCIAL_INVOICE,
        correctedInvoiceId: null,
        correctedInvoiceNumber: null,
        legalEntityId,
        issuedOn: input.issuedOn,
        dueOn: input.dueOn,
        ...parties,
        deliveryAddressLines: distinctDeliveryAddress(parties.buyer, input.deliveryAddressLines),
        orders: [...input.orders],
        lines: [...input.lines],
        vat: input.vat,
        paymentMeans: input.paymentMeans,
        prepayment: input.prepayment,
        documentKey: null,
        documentSha256: null,
      },
      null,
      null,
    );
  }

  /**
   * Émet un avoir sur une facture : mêmes parties et mentions que la facture
   * corrigée, montants positifs (le sens est porté par le type 381), et rien
   * au-delà de ce qui reste à corriger, taux par taux.
   *
   * @throws {InvalidCreditNoteError} corrige un avoir, ou daté avant la facture.
   * @throws {CreditNoteExceedsInvoiceError} dépasse la facture sur un taux.
   */
  static creditNote(input: IssueCreditNoteInput): Invoice {
    const corrected = input.corrected.state;
    const number = input.number.value;
    assertCorrectable(corrected, {
      number: input.number,
      issuedOn: input.issuedOn,
      priorCorrectedIds: input.priorCreditNotes.map((note) => note.state.correctedInvoiceId),
      orders: input.orders,
    });
    assertDates(input.number, input.issuedOn, null);
    assertOrders(input.orders);
    assertLines(input.lines);
    assertTotals(number, input.lines, input.vat);
    const prior = input.priorCreditNotes.map((note) => note.state.vat);
    assertWithinCorrected(corrected.number, corrected.vat, prior, input.vat);
    return new Invoice(
      {
        ...corrected,
        id: input.id,
        number,
        type: CREDIT_NOTE,
        correctedInvoiceId: corrected.id,
        correctedInvoiceNumber: corrected.number,
        issuedOn: input.issuedOn,
        dueOn: null,
        // Un avoir n'appelle aucun paiement : il n'en dit pas le moyen, ni
        // ce qui aurait été payé.
        paymentMeans: null,
        prepayment: null,
        orders: [...input.orders],
        lines: [...input.lines],
        vat: input.vat,
        documentKey: null,
        documentSha256: null,
      },
      null,
      null,
    );
  }

  /**
   * Relit une pièce persistée (E2). Revalide la forme et les totaux ; ne
   * rejuge PAS les parties — une facture émise reste émise même si la fiche
   * du client a perdu son SIREN depuis.
   */
  static restore(state: InvoiceState): Invoice {
    const number = InvoiceNumber.parse(state.number);
    assertDates(number, state.issuedOn, state.dueOn);
    assertLines(state.lines);
    assertTotals(state.number, state.lines, state.vat);
    assertPaymentMeans(state.paymentMeans);
    assertPrepayment(state.number, state.issuedOn, state.paymentMeans, state.prepayment, state.vat);
    if (state.documentSha256 !== null) {
      assertSha256(state.documentSha256);
    }
    return new Invoice(state, state.documentKey, state.documentSha256);
  }

  /**
   * Attache le document rendu (Factur-X) — une seule fois, et c'est tout ce
   * qu'une facture émise accepte encore.
   *
   * @throws {InvoiceDocumentAlreadyAttachedError} déjà attaché.
   * @throws {InvalidInvoiceError} clé vide ou empreinte mal formée.
   */
  attachDocument(key: string, sha256: string): void {
    if (this.documentKeyValue !== null) {
      throw new InvoiceDocumentAlreadyAttachedError(this.state.number);
    }
    if (key.trim() === "") {
      throw new InvalidInvoiceError("clé du document", "clé de stockage vide");
    }
    assertSha256(sha256);
    this.documentKeyValue = key;
    this.documentSha256Value = sha256;
  }

  get id(): string {
    return this.state.id;
  }

  get number(): string {
    return this.state.number;
  }

  get isCreditNote(): boolean {
    return this.state.type === CREDIT_NOTE;
  }

  get totalHtCents(): number {
    return this.state.vat.taxableBaseCents;
  }

  get totalVatCents(): number {
    return this.state.vat.vatCents;
  }

  get totalTtcCents(): number {
    return this.state.vat.totalCents;
  }

  /** Acquittée à l'émission (E5a) : une facture carte. */
  get isPrepaid(): boolean {
    return this.state.prepayment !== null;
  }

  /** La forme persistée — l'adaptateur (E2) et le rendu Factur-X (E3a) la lisent, rien d'autre. */
  toState(): InvoiceState {
    return {
      ...this.state,
      documentKey: this.documentKeyValue,
      documentSha256: this.documentSha256Value,
    };
  }
}
