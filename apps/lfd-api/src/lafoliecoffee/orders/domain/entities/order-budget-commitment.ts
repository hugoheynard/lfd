import type { AccountEngagement } from "../ports/account-order-engagement.js";
import type { QuotedOrder } from "../ports/quoted-orders.reader.js";
import {
  BudgetCommitmentAlreadyInvoicedError,
  BudgetCommitmentAlreadyNumberedError,
  BudgetCommitmentInPeriodQuoteError,
  BudgetCommitmentNotInQuoteError,
  InvalidBudgetCommitmentError,
} from "../errors/budget-commitment-errors.js";
import {
  budgetCommitmentFor,
  type PayerCommitmentTerms,
} from "../services/budget-commitment-rule.js";
import {
  BudgetCommitment,
  type EnteredBudgetCommitment,
} from "../value-objects/budget-commitment.js";

/** L'état tel que l'adaptateur le relit, sous le verrou de la ligne `orders`. */
export interface OrderBudgetCommitmentSnapshot {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly placedByUserId: string;
  /** Le payeur copié à la passation (`billed_company_id`) ; `null` sans société. */
  readonly payerCompanyId: string | null;
  readonly commitment: BudgetCommitment | null;
}

/**
 * **L'engagement budgétaire d'une commande, corrigé par l'équipe** (E3′) — un
 * geste à part de la révision : la révision refuse dès la préparation, et un
 * numéro manquant se découvre souvent après la livraison.
 *
 * Pourquoi pas une méthode d'`Order` : `Order` est l'agrégat de PASSATION,
 * il ne se recharge pas (cf. `OrderBilling`). Cet agrégat-ci, sur la même
 * ligne `orders`, porte deux règles : la correction (pas sur une commande
 * que la comptabilité a engagée ni sur une commande en devis, et la même
 * exigence du payeur qu'à la passation), et le numéro reçu sur un devis de
 * période (`acceptQuoted`), qui a sa propre précondition.
 */
export class OrderBudgetCommitment {
  private corrected: BudgetCommitment | null | undefined = undefined;

  private constructor(private readonly state: OrderBudgetCommitmentSnapshot) {}

  static fromSnapshot(snapshot: OrderBudgetCommitmentSnapshot): OrderBudgetCommitment {
    return new OrderBudgetCommitment(snapshot);
  }

  get orderId(): string {
    return this.state.orderId;
  }

  get orderNumber(): string {
    return this.state.orderNumber;
  }

  get placedByUserId(): string {
    return this.state.placedByUserId;
  }

  get payerCompanyId(): string | null {
    return this.state.payerCompanyId;
  }

  /** L'engagement avant le geste. */
  get before(): BudgetCommitment | null {
    return this.state.commitment;
  }

  /** L'engagement à écrire ; `undefined` : rien n'a changé. */
  get pendingCommitment(): BudgetCommitment | null | undefined {
    return this.corrected;
  }

  /**
   * Corrige l'engagement. Refuse dès que la comptabilité a engagé la commande
   * (facture, lot, encaissement) : la facture a figé le numéro, et la sortie
   * est l'avoir. Le même engagement qu'avant n'est pas un geste : `false`.
   *
   * @param engagement ce que la comptabilité en a fait, relu sous le même
   *   verrou ; `null` : inconnu, refusé comme engagé.
   * @param quote le devis de période en attente qui la porte, relu sous le
   *   même verrou ; son numéro passe par le devis (QD2).
   * @throws {BudgetCommitmentAlreadyInvoicedError} la commande est engagée.
   * @throws {BudgetCommitmentInPeriodQuoteError} la commande est dans un devis en attente.
   * @throws voir `budgetCommitmentFor` — la règle de la passation.
   */
  correct(
    entered: EnteredBudgetCommitment | null,
    terms: PayerCommitmentTerms,
    engagement: AccountEngagement | null,
    quote: QuotedOrder | null,
  ): boolean {
    if (engagement === null || engagement.kind !== "free") {
      throw new BudgetCommitmentAlreadyInvoicedError(
        this.state.orderNumber,
        engagement?.kind === "invoiced" ? engagement.invoiceNumber : null,
      );
    }
    if (quote !== null) {
      throw new BudgetCommitmentInPeriodQuoteError(this.state.orderNumber, quote.quoteNumber);
    }
    const next = budgetCommitmentFor(entered, terms);
    const before = this.state.commitment;
    if (next === null ? before === null : next.sameAs(before)) {
      return false;
    }
    this.corrected = next;
    return true;
  }

  /**
   * **Le numéro reçu sur un devis de période** (QD6, plan
   * `plan-clients-publics-chorus.md`, § 6 sexies) : écrit sur une commande
   * de ce devis, encore en attente, qui n'en porte pas. Le code service reste
   * celui que la commande porte — celui du devis. Ce n'est pas la règle de
   * correction : elle refuse tout numéro d'un payeur sur devis.
   *
   * @param target le devis dont l'engagement est reçu.
   * @param current le devis en attente qui porte la commande, relu sous le verrou.
   * @throws {BudgetCommitmentNotInQuoteError} la commande n'est pas dans ce devis en attente.
   * @throws {BudgetCommitmentAlreadyNumberedError} elle porte déjà un numéro.
   * @throws {InvalidBudgetCommitmentError} un numéro vide ou mal formé.
   */
  acceptQuoted(number: string, target: QuotedOrder, current: QuotedOrder | null): void {
    if (current?.quoteId !== target.quoteId) {
      throw new BudgetCommitmentNotInQuoteError(this.state.orderNumber, target.quoteNumber);
    }
    const before = this.state.commitment;
    if (before !== null && before.number !== "") {
      throw new BudgetCommitmentAlreadyNumberedError(this.state.orderNumber, before.number);
    }
    const received = BudgetCommitment.entered({
      number,
      serviceCode: before?.serviceCode ?? "",
    });
    if (received === null || received.number === "") {
      throw new InvalidBudgetCommitmentError("numéro d'engagement", "il est vide");
    }
    this.corrected = received;
  }
}
