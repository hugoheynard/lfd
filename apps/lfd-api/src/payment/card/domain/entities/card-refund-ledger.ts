import { CardRefundRejectedError } from "../errors/card-refund-errors.js";
import {
  cardRefundStatusMove,
  type CardRefundNature,
  type CardRefundSource,
  type CardRefundStatus,
  isOpenRefundStatus,
} from "../value-objects/card-refund-values.js";
import type { PaymentSubject } from "../value-objects/payment-subject.js";

/**
 * La seule devise des paiements du bloc : les intentions sont créées en euros
 * (`CARD_CURRENCY`, `block-card-payments.ts`, vérifié le 2026-11-10). Un
 * remboursement dans une autre devise ne se compare pas au montant encaissé.
 */
export const CARD_REFUND_CURRENCY = "eur";

/** Une ligne du carnet, telle que la table `card_payment.refund` la range. */
export interface CardRefundLine {
  readonly id: string;
  readonly requestId: string | null;
  readonly nature: CardRefundNature | null;
  readonly source: CardRefundSource;
  /** Le `re_…` ; `null` pour un « rendu autrement ». */
  readonly providerRef: string | null;
  readonly amountCents: number;
  readonly currency: string;
  readonly status: CardRefundStatus;
  readonly refundedAt: Date;
  readonly recordedAt: Date;
  readonly updatedAt: Date;
}

/** Un remboursement tel que le prestataire l'annonce. `refundedAt` est SON instant. */
export interface CardRefundReport {
  readonly providerRef: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly status: CardRefundStatus;
  readonly refundedAt: Date;
}

/** La demande qui a émis un remboursement : son identifiant et sa nature. */
export interface CardRefundAttribution {
  readonly requestId: string;
  readonly nature: CardRefundNature;
}

/** Ce que le carnet sait de son paiement quand on le charge. */
export interface CardRefundLedgerState {
  readonly paymentId: string;
  readonly subject: PaymentSubject;
  readonly account: string;
  /** L'intention chez le prestataire (`pi_…`) ; `null` : rien à rembourser chez lui. */
  readonly paymentRef: string | null;
  /** `payment.amount_cents` — le plafond (G2) : jamais plus rendu qu'encaissé. */
  readonly amountCents: number;
  readonly paid: boolean;
  /** Dans l'ordre du constat (`recordedAt`, `id`). */
  readonly lines: readonly CardRefundLine[];
}

/** L'issue d'un constat. Un refus, lui, LÈVE ({@link CardRefundRejectedError}). */
export type CardRefundRecording =
  | { readonly kind: "unchanged" }
  | {
      readonly kind: "recorded";
      readonly line: CardRefundLine;
      /** Le statut connu AVANT ce constat ; `null` : la ligne est neuve. */
      readonly before: CardRefundStatus | null;
    };

/**
 * **Le carnet des remboursements d'un paiement** (plan M2, §3.4, §5.1, G2) —
 * l'agrégat qui tient les règles du lot R1, déménagées d'`OrderRefundLedger`
 * (retiré au lot P1.c) :
 *
 * - **idempotent par `re_…`** : un webhook rejoué ne double rien ;
 * - **un statut ne régresse pas** ({@link cardRefundStatusMove}) ; une
 *   inversion n'est que `succeeded → failed` ;
 * - **une devise** ;
 * - **Σ des `succeeded` ≤ montant du paiement** : un excès est une panne qui
 *   se voit, jamais une écriture fausse.
 *
 * Il ne porte PAS le règlement du sujet : c'est le sujet qui le pose, au canal
 * (`onRefundOutcome`), sur la position recalculée.
 */
export class CardRefundLedger {
  private readonly created = new Set<string>();
  private readonly updated = new Set<string>();

  private constructor(
    private readonly state: CardRefundLedgerState,
    private lines: CardRefundLine[],
  ) {}

  static rehydrate(state: CardRefundLedgerState): CardRefundLedger {
    return new CardRefundLedger(state, [...state.lines]);
  }

  get paymentId(): string {
    return this.state.paymentId;
  }
  get subject(): PaymentSubject {
    return this.state.subject;
  }
  get account(): string {
    return this.state.account;
  }
  get paymentRef(): string | null {
    return this.state.paymentRef;
  }
  get paid(): boolean {
    return this.state.paid;
  }

  /** Le cumul des remboursements réussis, en centimes. */
  succeededCents(): number {
    return sumOf(this.lines.filter((line) => line.status === "succeeded"));
  }

  /** Ce qui reste à rendre sur ce paiement : montant − Σ réussis, jamais négatif. */
  remainderCents(): number {
    return Math.max(0, this.state.amountCents - this.succeededCents());
  }

  /** Les remboursements en attente de la banque : en vol. */
  inFlightLines(): readonly CardRefundLine[] {
    return this.lines.filter((line) => isOpenRefundStatus(line.status));
  }

  lineOf(providerRef: string): CardRefundLine | null {
    return this.lines.find((line) => line.providerRef === providerRef) ?? null;
  }

  lineById(id: string): CardRefundLine | null {
    return this.lines.find((line) => line.id === id) ?? null;
  }

  /**
   * Constate un remboursement annoncé par le prestataire.
   *
   * @param attribution la demande qui l'a émis, pour une ligne NEUVE ; une
   *   ligne connue garde la sienne (sa nature est immuable en base).
   * @throws {CardRefundRejectedError} devise, cumul au-delà du montant,
   *   montant changé, ou retour d'un remboursement réussi à « annulé ».
   */
  record(
    report: CardRefundReport,
    attribution: CardRefundAttribution | null,
    newId: string,
    at: Date,
  ): CardRefundRecording {
    if (report.currency !== CARD_REFUND_CURRENCY) {
      throw new CardRefundRejectedError("currency");
    }
    const known = this.lineOf(report.providerRef);
    if (known === null) {
      const line = providerLine(report, attribution, newId, at);
      this.commit([...this.lines, line], line, this.created);
      return { kind: "recorded", line, before: null };
    }
    if (known.amountCents !== report.amountCents) {
      throw new CardRefundRejectedError("amount_changed");
    }
    const move = cardRefundStatusMove(known.status, report.status);
    if (move === "illegal") {
      throw new CardRefundRejectedError("reversed_after_success");
    }
    if (move === "stale") {
      return { kind: "unchanged" };
    }
    const line: CardRefundLine = { ...known, status: report.status, updatedAt: at };
    this.commit(
      this.lines.map((candidate) => (candidate.id === known.id ? line : candidate)),
      line,
      this.updated,
    );
    return { kind: "recorded", line, before: known.status };
  }

  /**
   * **« Rendu autrement »** (§5.5) : une ligne `manual`, réussie, à l'instant
   * du geste — aucun argent n'a bougé chez le prestataire.
   *
   * @throws {CardRefundRejectedError} le cumul dépasserait le montant encaissé.
   */
  recordManual(
    attribution: CardRefundAttribution,
    amountCents: number,
    newId: string,
    at: Date,
  ): CardRefundLine {
    const line: CardRefundLine = {
      id: newId,
      requestId: attribution.requestId,
      nature: attribution.nature,
      source: "manual",
      providerRef: null,
      amountCents,
      currency: CARD_REFUND_CURRENCY,
      status: "succeeded",
      refundedAt: at,
      recordedAt: at,
      updatedAt: at,
    };
    this.commit([...this.lines, line], line, this.created);
    return line;
  }

  /** Les lignes à insérer, puis celles dont le statut a changé. */
  toPersistence(): {
    readonly created: readonly CardRefundLine[];
    readonly updated: readonly CardRefundLine[];
  } {
    return {
      created: this.lines.filter((line) => this.created.has(line.id)),
      updated: this.lines.filter((line) => this.updated.has(line.id) && !this.created.has(line.id)),
    };
  }

  /** G2 : le plafond se vérifie sur l'état d'APRÈS, avant de le retenir. */
  private commit(after: CardRefundLine[], line: CardRefundLine, mark: Set<string>): void {
    const succeeded = sumOf(after.filter((candidate) => candidate.status === "succeeded"));
    if (succeeded > this.state.amountCents) {
      throw new CardRefundRejectedError("exceeds_charge");
    }
    this.lines = after;
    mark.add(line.id);
  }
}

function providerLine(
  report: CardRefundReport,
  attribution: CardRefundAttribution | null,
  id: string,
  at: Date,
): CardRefundLine {
  return {
    id,
    requestId: attribution?.requestId ?? null,
    nature: attribution?.nature ?? null,
    source: "provider",
    providerRef: report.providerRef,
    amountCents: report.amountCents,
    currency: report.currency,
    status: report.status,
    refundedAt: report.refundedAt,
    recordedAt: at,
    updatedAt: at,
  };
}

function sumOf(lines: readonly CardRefundLine[]): number {
  return lines.reduce((sum, line) => sum + line.amountCents, 0);
}
