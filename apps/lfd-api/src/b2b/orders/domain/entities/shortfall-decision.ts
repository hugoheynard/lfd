import type { OrderStatus, SettlementRegime, ShortfallRemainder } from "@lfd/contracts";

import { NoShortfallToDecideError } from "../errors/order-shortfall-errors.js";
import {
  CardOrderShortfallError,
  NothingDepartsError,
  OrderTooOldForShortfallError,
  ShortfallAlreadyDecidedError,
  ShortfallOrderNotConfirmedError,
  VoucherOrderShortfallError,
} from "../errors/shortfall-decision-errors.js";
import type { OrderShortfall } from "./order-shortfall.js";

/** Ce qui part, par article : la quantité au bac au signal décidé. */
export interface DepartingQuantity {
  readonly sku: string;
  readonly quantity: number;
}

/** Un terme d'argent de la commande, et si la règle qui l'a produit est figée. */
export interface FrozenTerm {
  readonly amountCents: number;
  readonly hasAdjustment: boolean;
}

/** Ce que la décision lit de la commande, sous son verrou. */
export interface ShortfallDecisionSubject {
  readonly orderId: string;
  readonly reference: string;
  readonly status: OrderStatus;
  readonly settlementRegime: SettlementRegime;
  readonly voucherDiscountCents: number;
  /** La remise, les frais de livraison et la surtaxe. */
  readonly frozenTerms: readonly FrozenTerm[];
  /** Une décision existe déjà en base. */
  readonly decided: boolean;
}

/** L'état tel que l'adaptateur l'écrit. */
export interface ShortfallDecisionSnapshot {
  readonly id: string;
  readonly orderId: string;
  readonly reference: string;
  readonly decidedAt: Date;
  readonly decidedBy: string;
  readonly remainder: ShortfallRemainder;
  readonly departing: readonly DepartingQuantity[];
  readonly signalReportedAt: Date;
}

/** Qui décide, quand, et du reste. */
export interface ShortfallDecisionAct {
  readonly id: string;
  readonly decidedAt: Date;
  readonly decidedBy: string;
  readonly remainder: ShortfallRemainder;
}

const CARD_REGIMES: ReadonlySet<SettlementRegime> = new Set(["due", "paid"]);

/**
 * **La décision du départ incomplet** (lot E6b,
 * `documentation/commandes/plan-e6-le-depart-incomplet.md` § 12.2 et § 13) :
 * une par commande, définitive (Q-I4). Ce qui part est EXACTEMENT ce que le
 * colisage a figé au signal en vigueur — jamais une saisie : la fiche le
 * revérifie sous son verrou (`ShortfallDesk.authorize`).
 *
 * Elle porte l'invariant de ce qui peut partir incomplet : une commande
 * confirmée, au compte, sans bon de fidélité, dont chaque montant garde la
 * règle qui l'a produit — sans quoi le bon de livraison partiel ne saurait
 * pas recomposer ses montants (`composePartial`) —, et dont au moins une pièce
 * est au bac.
 *
 * Le reste est `abandoned` seulement : « à relivrer » arrive avec E7.
 */
export class ShortfallDecision {
  private constructor(private readonly state: ShortfallDecisionSnapshot) {}

  /**
   * @throws {ShortfallAlreadyDecidedError} @throws {NoShortfallToDecideError}
   * @throws {ShortfallOrderNotConfirmedError} @throws {CardOrderShortfallError}
   * @throws {VoucherOrderShortfallError} @throws {OrderTooOldForShortfallError}
   * @throws {NothingDepartsError}
   */
  static decide(
    subject: ShortfallDecisionSubject,
    shortfall: OrderShortfall,
    act: ShortfallDecisionAct,
  ): ShortfallDecision {
    if (subject.decided || shortfall.decided) {
      throw new ShortfallAlreadyDecidedError(subject.reference);
    }
    // Le signal d'abord : sans lui, le reste n'a pas de sens.
    const pending = shortfall.pending;
    if (pending === null) {
      throw new NoShortfallToDecideError(subject.reference);
    }
    ensureDecidable(subject);
    const departing = pending.lines.map((line) => ({ sku: line.sku, quantity: line.packed }));
    if (departing.every((line) => line.quantity === 0)) {
      throw new NothingDepartsError(subject.reference);
    }
    shortfall.decide(act.decidedAt);
    return new ShortfallDecision({
      ...act,
      orderId: subject.orderId,
      reference: subject.reference,
      departing,
      signalReportedAt: pending.reportedAt,
    });
  }

  get departing(): readonly DepartingQuantity[] {
    return this.state.departing;
  }

  toSnapshot(): ShortfallDecisionSnapshot {
    return this.state;
  }
}

function ensureDecidable(subject: ShortfallDecisionSubject): void {
  if (subject.status !== "confirmed") {
    throw new ShortfallOrderNotConfirmedError(subject.reference, subject.status);
  }
  if (CARD_REGIMES.has(subject.settlementRegime)) {
    throw new CardOrderShortfallError(subject.reference);
  }
  if (subject.voucherDiscountCents > 0) {
    throw new VoucherOrderShortfallError(subject.reference);
  }
  if (subject.frozenTerms.some((term) => term.amountCents !== 0 && !term.hasAdjustment)) {
    throw new OrderTooOldForShortfallError(subject.reference);
  }
}
