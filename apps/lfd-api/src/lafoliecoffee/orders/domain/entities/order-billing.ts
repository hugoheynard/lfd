import type { OrderStatus } from "@lfd/contracts";

import { amountDifferences, sumOfAmounts, type BillableAmounts } from "./billable-amounts.js";

/** Un bon de livraison remis, vu du solde : son jour et son en-tête (`null` avant E4a). */
export interface HandedOverNoteAmounts {
  readonly number: string;
  /** Le rang de l'envoi (1 = la commande) : un rang > 1 remis fait solder sur la somme des BL (E7). */
  readonly rank: number;
  /** `AAAA-MM-JJ` ; `null` = remis sans jour de réception, un écart : le solde le refuse. */
  readonly receivedOn: string | null;
  readonly amounts: BillableAmounts | null;
}

/** L'état tel que l'adaptateur le relit. */
export interface OrderBillingSnapshot {
  readonly orderId: string;
  readonly reference: string;
  readonly status: OrderStatus;
  /** La commande porte une décision de départ incomplet (E6b). */
  readonly partial: boolean;
  /** `AAAA-MM-JJ` — la première remise ; `null` tant que rien n'est reçu. */
  readonly receivedOn: string | null;
  /** Les totaux de la commande, tels que la passation ou la révision les a écrits. */
  readonly orderAmounts: BillableAmounts;
  readonly billable: BillableAmounts | null;
  /** `AAAA-MM-JJ`, posé avec `billable`. */
  readonly settledOn: string | null;
}

/** Le rang de la commande elle-même : son BL suit ses totaux. */
const FIRST_SHIPMENT_RANK = 1;

/** Ce que le solde devrait être, ou `null` si la commande n'est pas soldée. */
interface Settlement {
  readonly amounts: BillableAmounts;
  readonly settledOn: string;
}

/** Ce qu'un passage a fait des montants facturables. */
export type BillingWrite = "closed" | "corrected";

/**
 * **Le solde d'une commande, et ce qu'elle doit** (lot E6c1, plan
 * plan E6 (`documentation/commandes/bon-de-livraison.md`) § 12.3 et § 13) —
 * `Order.closeBilling` du plan.
 *
 * Pourquoi pas une méthode d'`Order` : `Order` est l'agrégat de PASSATION, il
 * ne se recharge pas (cf. `OrderShortfall`). Le solde est un agrégat à part,
 * sur la même ligne `orders`, et c'est lui qui porte la règle.
 *
 * - **Soldée** : remise, et sans reste à livrer. Une commande sans décision
 *   l'est à sa remise : ses montants facturables sont la **recopie** de ses
 *   totaux, au jour de réception. Une commande décidée (« reste abandonné »)
 *   l'est à la remise de son BL : ses montants sont la **somme des BL remis**,
 *   au jour du dernier. De même pour une commande à plusieurs envois (plan
 *   E7 reliquat, choix 8 et 18, lot L5b) : soldée à la remise du DERNIER
 *   envoi (`fulfilled` ; `partially_handed_over` ne l'est pas), sur la somme
 *   de ses BL remis — chacun avec ses montants (choix 10).
 * - **Jamais soldée** : une commande annulée, ou pas encore remise.
 * - **Posés une fois** par {@link closeBilling} ; corrigeables par
 *   {@link correctBilling} tant que la commande n'est pas engagée — gelés
 *   ensuite en base (`orders_billable_frozen`, E6c2).
 */
export class OrderBilling {
  private write: BillingWrite | null = null;

  private constructor(private state: OrderBillingSnapshot) {}

  static fromSnapshot(snapshot: OrderBillingSnapshot): OrderBilling {
    return new OrderBilling(snapshot);
  }

  get orderId(): string {
    return this.state.orderId;
  }

  get reference(): string {
    return this.state.reference;
  }

  /** L'écriture que l'adaptateur doit faire ; `null` = rien. */
  get pendingWrite(): BillingWrite | null {
    return this.write;
  }

  /**
   * Pose les montants facturables d'une commande soldée — une fois.
   *
   * @returns `false` : déjà posés, ou pas soldée (annulée, pas remise, BL décidé non remis).
   */
  closeBilling(notes: readonly HandedOverNoteAmounts[]): boolean {
    if (this.state.billable !== null) {
      return false;
    }
    const settlement = this.settlementOf(notes);
    if (settlement === null) {
      return false;
    }
    this.apply(settlement, "closed");
    return true;
  }

  /**
   * **Le geste de correction** (§ 13) : recompose des montants posés qui
   * diffèrent de la règle — seulement tant que la commande n'est pas ENGAGÉE
   * (facture, relevé ou prélèvement — plan E6c2, § 4) : après, le gel en base
   * le refuse, et un écart se reprend par un avoir.
   *
   * @returns `false` : rien à corriger, pas soldée, ou déjà engagée.
   */
  correctBilling(notes: readonly HandedOverNoteAmounts[], engaged: boolean): boolean {
    if (engaged || this.state.billable === null || this.gapsOf(notes).length === 0) {
      return false;
    }
    const settlement = this.settlementOf(notes);
    if (settlement === null) {
      return false;
    }
    this.apply(settlement, "corrected");
    return true;
  }

  /**
   * **Le contrôle** (§ 12.3) : les champs où les montants posés diffèrent de
   * la règle — la recopie pour une commande à un BL complet, la somme des BL
   * pour une commande partielle ou à plusieurs envois. Vide si tout concorde ou rien n'est posé ;
   * `["settlement"]` pour des montants posés sur une commande qui n'est pas
   * soldée.
   */
  gapsOf(notes: readonly HandedOverNoteAmounts[]): readonly string[] {
    const { billable, settledOn } = this.state;
    if (billable === null) {
      return [];
    }
    const settlement = this.settlementOf(notes);
    if (settlement === null) {
      return ["settlement"];
    }
    return [
      ...amountDifferences(billable, settlement.amounts),
      ...(settledOn === settlement.settledOn ? [] : ["settledOn"]),
    ];
  }

  /**
   * Pourquoi une commande remise n'est pas soldée, quand c'est un écart et non
   * une attente : un BL remis sans jour de réception, ou sans en-tête. `null`
   * sinon — rien à nommer.
   */
  settlementGapOf(notes: readonly HandedOverNoteAmounts[]): string | null {
    if (this.state.status !== "fulfilled" || !this.sumsNotes(notes)) {
      return null;
    }
    if (notes.some((note) => note.receivedOn === null)) {
      return "receivedOn";
    }
    return notes.some((note) => note.amounts === null) ? "terms" : null;
  }

  toSnapshot(): OrderBillingSnapshot {
    return this.state;
  }

  private apply(settlement: Settlement, write: BillingWrite): void {
    this.state = { ...this.state, billable: settlement.amounts, settledOn: settlement.settledOn };
    this.write = write;
  }

  /**
   * Le solde se lit sur les BL remis : départ incomplet décidé (E6), ou plus
   * d'un envoi remis (E7). Sinon, la recopie des totaux de la commande.
   */
  private sumsNotes(notes: readonly HandedOverNoteAmounts[]): boolean {
    return this.state.partial || notes.some((note) => note.rank > FIRST_SHIPMENT_RANK);
  }

  private settlementOf(notes: readonly HandedOverNoteAmounts[]): Settlement | null {
    const { status, receivedOn, orderAmounts } = this.state;
    if (status !== "fulfilled") {
      return null;
    }
    if (!this.sumsNotes(notes)) {
      return receivedOn === null ? null : { amounts: orderAmounts, settledOn: receivedOn };
    }
    return settlementOfNotes(notes);
  }
}

/** Σ des BL remis, au jour du dernier ; `null` sans BL remis, ou si l'un n'a pas d'en-tête. */
function settlementOfNotes(notes: readonly HandedOverNoteAmounts[]): Settlement | null {
  const amounts = notes.map((note) => note.amounts);
  const days = notes.map((note) => note.receivedOn);
  if (notes.length === 0 || amounts.some((part) => part === null) || days.includes(null)) {
    return null;
  }
  const settledOn = days
    .filter((day) => day !== null)
    .sort()
    .at(-1);
  if (settledOn === undefined) {
    return null;
  }
  return {
    amounts: sumOfAmounts(amounts.filter((part) => part !== null)),
    settledOn,
  };
}
