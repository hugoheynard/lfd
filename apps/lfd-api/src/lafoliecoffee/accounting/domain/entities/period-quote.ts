import {
  EmptyPeriodQuoteError,
  InvalidPeriodQuoteRankError,
  PeriodQuoteNotAwaitingError,
} from "../errors/period-quote-errors.js";
import { periodTagOf } from "../services/invoicing-closures.js";
import type { InvoiceableOrder } from "../services/monthly-invoicing.js";
import { periodQuoteFigures } from "../services/period-quote-fingerprint.js";

/**
 * L'état d'un devis — valeurs écrites en base (`period_quote.state`, CHECK) :
 * elles ne se renomment pas.
 */
export type PeriodQuoteState = "awaiting" | "invoiced" | "superseded";

/** Le premier rang d'une version : un devis rangé à la clôture est sa version 1. */
const FIRST_VERSION = 1;

/** Ce que la clôture sait d'un groupe à mettre en devis. */
export interface PeriodQuoteShelving {
  readonly id: string;
  /** Le rang du devis dans sa période, chez son entité (`period_quote_counter`). */
  readonly rank: number;
  readonly legalEntityId: string;
  readonly payerCompanyId: string;
  readonly payerName: string;
  /** Le mandat effectif du groupe ; `null` = aucun. */
  readonly mandateId: string | null;
  /** Le code service que portent les commandes ; `""` = aucun. */
  readonly serviceCode: string;
  /** Le début de la période DU PAYEUR. */
  readonly periodStartsAt: Date;
  readonly periodClosesAt: Date;
  /** Les seules commandes facturables du groupe (v5 B3). */
  readonly orders: readonly InvoiceableOrder[];
  readonly createdAt: Date;
}

/** La ligne d'un devis, telle que l'adaptateur l'écrit. */
export interface PeriodQuoteSnapshot {
  readonly id: string;
  readonly number: string;
  readonly version: number;
  readonly legalEntityId: string;
  readonly payerCompanyId: string;
  readonly payerName: string;
  readonly mandateId: string | null;
  readonly serviceCode: string;
  readonly periodStartsAt: Date;
  readonly periodClosesAt: Date;
  readonly state: PeriodQuoteState;
  readonly fingerprint: string;
  readonly totalTtcCents: number;
  readonly orderIds: readonly string[];
  readonly createdAt: Date;
}

/**
 * **Le devis de période** (plan `plan-clients-publics-chorus.md`, § 6 sexies,
 * QD3 et QD5) : les commandes d'un payeur public qui attendent leur numéro
 * d'engagement, et l'empreinte de la facture qu'elles feront.
 *
 * L'empreinte et le total se calculent TOUJOURS sur les commandes que le
 * devis porte (`periodQuoteFigures`) : on ne les donne pas, on ne peut donc
 * pas les donner faux. Un devis sans commande n'existe pas.
 *
 * Deux gestes le font vivre ici : la naissance (v1, `awaiting`, à la
 * clôture) et le renvoi (`resend`), qui garde la version quand l'empreinte
 * n'a pas bougé et en range une nouvelle sinon. L'engagement reçu
 * (`invoiced`) a son propre geste.
 */
export class PeriodQuote {
  private constructor(
    private readonly state: PeriodQuoteSnapshot,
    private readonly orders: readonly InvoiceableOrder[],
  ) {}

  /**
   * Le devis rangé par la clôture : version 1, en attente.
   *
   * @throws {EmptyPeriodQuoteError} aucune commande.
   * @throws {InvalidPeriodQuoteRankError} un rang qui n'est pas un entier ≥ 1.
   */
  static shelve(input: PeriodQuoteShelving): PeriodQuote {
    if (!Number.isInteger(input.rank) || input.rank < 1) {
      throw new InvalidPeriodQuoteRankError(input.rank);
    }
    const { rank, orders, ...identity } = input;
    return new PeriodQuote(
      {
        ...identity,
        number: periodQuoteNumberOf(input.periodClosesAt, rank),
        version: FIRST_VERSION,
        state: "awaiting",
        ...figuresOf(input.payerName, orders),
      },
      orders,
    );
  }

  /**
   * Le devis relu en base. Il ne porte pas ses commandes chiffrées : seul
   * `resend` les demande, et les reçoit relues.
   */
  static restore(snapshot: PeriodQuoteSnapshot): PeriodQuote {
    return new PeriodQuote(snapshot, []);
  }

  /** L'identifiant du devis. */
  get id(): string {
    return this.state.id;
  }

  get number(): string {
    return this.state.number;
  }

  get orderIds(): readonly string[] {
    return this.state.orderIds;
  }

  get version(): number {
    return this.state.version;
  }

  /**
   * **« Renvoyer le devis »** (QD5) : l'empreinte recalculée sur les
   * commandes du devis telles qu'elles sont aujourd'hui (annulées retirées
   * par l'appelant). Égale, la même version repart ; différente, une version
   * n+1 la remplace — même numéro, nouvelles commandes, nouvelle empreinte —
   * et celle-ci passe `superseded`.
   *
   * @throws {PeriodQuoteNotAwaitingError} le devis est facturé ou déjà remplacé.
   * @throws {EmptyPeriodQuoteError} plus aucune commande du devis n'est à facturer.
   */
  resend(orders: readonly InvoiceableOrder[], successorId: string, at: Date): PeriodQuoteResend {
    if (this.state.state !== "awaiting") {
      throw new PeriodQuoteNotAwaitingError(
        this.state.number,
        this.state.version,
        this.state.state,
      );
    }
    const figures = figuresOf(this.state.payerName, orders);
    if (figures.fingerprint === this.state.fingerprint) {
      return { kind: "unchanged", quote: this };
    }
    const successor = new PeriodQuote(
      {
        ...this.state,
        ...figures,
        id: successorId,
        version: this.state.version + 1,
        state: "awaiting",
        createdAt: at,
      },
      orders,
    );
    const superseded = new PeriodQuote({ ...this.state, state: "superseded" }, this.orders);
    return { kind: "renewed", superseded, successor };
  }

  /**
   * Le même devis, réduit aux commandes que la base a réellement prises : son
   * empreinte et son total se recalculent sur elles (v5 S4).
   *
   * @throws {EmptyPeriodQuoteError} aucune n'a été prise.
   */
  keeping(kept: ReadonlySet<string>): PeriodQuote {
    const remaining = this.orders.filter((order) => kept.has(order.orderId));
    return new PeriodQuote(
      { ...this.state, ...figuresOf(this.state.payerName, remaining) },
      remaining,
    );
  }

  toSnapshot(): PeriodQuoteSnapshot {
    return this.state;
  }
}

/** Ce que rend un renvoi : la même version, ou l'ancienne remplacée et la nouvelle. */
export type PeriodQuoteResend =
  | { readonly kind: "unchanged"; readonly quote: PeriodQuote }
  | {
      readonly kind: "renewed";
      readonly superseded: PeriodQuote;
      readonly successor: PeriodQuote;
    };

/** `D-<AAAAMMJJ>-<rang>` : l'étiquette de la période (son dernier jour), puis le rang. */
export function periodQuoteNumberOf(periodClosesAt: Date, rank: number): string {
  return `D-${periodTagOf(periodClosesAt)}-${String(rank)}`;
}

function figuresOf(
  payerName: string,
  orders: readonly InvoiceableOrder[],
): Pick<PeriodQuoteSnapshot, "fingerprint" | "totalTtcCents" | "orderIds"> {
  if (orders.length === 0) {
    throw new EmptyPeriodQuoteError(payerName);
  }
  return { ...periodQuoteFigures(orders), orderIds: orders.map((order) => order.orderId) };
}
