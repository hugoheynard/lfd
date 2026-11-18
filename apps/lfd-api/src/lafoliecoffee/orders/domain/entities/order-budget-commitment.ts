import type { AccountEngagement } from "../ports/account-order-engagement.js";
import { BudgetCommitmentAlreadyInvoicedError } from "../errors/budget-commitment-errors.js";
import {
  budgetCommitmentFor,
  type PayerCommitmentTerms,
} from "../services/budget-commitment-rule.js";
import type {
  BudgetCommitment,
  EnteredBudgetCommitment,
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
 * ligne `orders`, porte la règle : pas de correction d'une commande que la
 * comptabilité a engagée, et la même exigence du payeur qu'à la passation.
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
   * @throws {BudgetCommitmentAlreadyInvoicedError} la commande est engagée.
   * @throws voir `budgetCommitmentFor` — la règle de la passation.
   */
  correct(
    entered: EnteredBudgetCommitment | null,
    terms: PayerCommitmentTerms,
    engagement: AccountEngagement | null,
  ): boolean {
    if (engagement === null || engagement.kind !== "free") {
      throw new BudgetCommitmentAlreadyInvoicedError(
        this.state.orderNumber,
        engagement?.kind === "invoiced" ? engagement.invoiceNumber : null,
      );
    }
    const next = budgetCommitmentFor(entered, terms);
    const before = this.state.commitment;
    if (next === null ? before === null : next.sameAs(before)) {
      return false;
    }
    this.corrected = next;
    return true;
  }
}
