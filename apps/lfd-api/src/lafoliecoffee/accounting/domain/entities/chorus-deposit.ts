import { addDays } from "@lfd/contracts";

import {
  ChorusAlreadyDepositedError,
  ChorusDayOutOfRangeError,
  ChorusNotDepositedError,
  ChorusOutcomeKnownError,
  CreditedInvoiceNotForChorusError,
  InvalidChorusDepositError,
  InvoiceNotForChorusError,
} from "../errors/chorus-deposit-errors.js";
import {
  isPublicInvoice,
  type ChorusDepositStanding,
  type DueInvoiceFacts,
} from "../services/public-invoice-due.js";

/** Ce que le staff note d'une facture sur le portail Chorus Pro. */
export type ChorusDepositKind = "deposited" | "rejected" | "accepted";

/** Une ligne du journal de dépôt — append-only. Jours `AAAA-MM-JJ`. */
export interface ChorusDepositEntry {
  readonly id: string;
  readonly kind: ChorusDepositKind;
  readonly occurredOn: string;
  /** Le motif d'un rejet ; `null` sinon. */
  readonly reason: string | null;
  readonly staffId: string;
  /** Le nom figé de l'auteur ; `null` si sa fiche n'en porte aucun. */
  readonly staffName: string | null;
  readonly recordedAt: Date;
}

/** La facture qu'un dépôt suit, figée ou relue — rien n'y est écrit. */
export interface ChorusInvoiceFacts extends DueInvoiceFacts {
  readonly invoiceId: string;
  readonly number: string;
  readonly payerCompanyId: string;
  readonly payerName: string;
  /** Un avoir la corrige : elle ne se dépose plus. */
  readonly creditedOut: boolean;
}

/** Un geste du staff : qui, quand, et le jour saisi. */
export interface ChorusGesture {
  readonly entryId: string;
  readonly occurredOn: string;
  /** Le jour de Paris du geste — borne haute du jour saisi. */
  readonly today: string;
  readonly staffId: string;
  readonly staffName: string | null;
  readonly at: Date;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

/** `AAAA-MM-JJ`, un jour qui existe (le 31 février se relit autrement). */
function isCalendarDay(value: string): boolean {
  return DAY_PATTERN.test(value) && addDays(value, 0) === value;
}

/** La longueur d'un motif de rejet : de quoi recopier celui du portail. */
export const CHORUS_REJECTION_REASON_MAX = 500;

/**
 * **Le dépôt d'UNE facture d'organisme public sur Chorus Pro** (plan
 * `plan-clients-publics-chorus.md`, § 6 quinquies, T2′).
 *
 * Gardien de l'ordre : déposée une seule fois (une facture rejetée ne se
 * redépose pas — la comptabilité fait l'avoir et une nouvelle facture, à la
 * main) ; rejetée ou mise en paiement seulement après le dépôt, et une seule
 * de ces deux issues ; chaque jour saisi entre la facture (ou le dépôt) et
 * aujourd'hui. Seulement une facture (380) d'un payeur public, non annulée
 * par un avoir. Le journal est append-only : l'agrégat n'ajoute que des
 * lignes, que `pending()` rend au dépôt.
 */
export class ChorusDeposit {
  private readonly added: ChorusDepositEntry[] = [];

  private constructor(
    readonly invoice: ChorusInvoiceFacts,
    private readonly entries: ChorusDepositEntry[],
  ) {}

  /** Rehydrate le journal d'une facture (dans n'importe quel ordre). */
  static of(invoice: ChorusInvoiceFacts, entries: readonly ChorusDepositEntry[]): ChorusDeposit {
    return new ChorusDeposit(invoice, [...entries]);
  }

  /**
   * « Déposée le … ».
   *
   * @throws {InvoiceNotForChorusError} @throws {CreditedInvoiceNotForChorusError}
   * @throws {ChorusAlreadyDepositedError} @throws {ChorusDayOutOfRangeError}
   */
  deposit(gesture: ChorusGesture): ChorusDepositEntry {
    this.assertDepositable();
    const deposited = this.find("deposited");
    if (deposited !== null) {
      throw new ChorusAlreadyDepositedError(this.invoice.number, deposited.occurredOn);
    }
    this.assertDay(gesture, this.invoice.issuedOn);
    return this.append("deposited", gesture, null);
  }

  /**
   * « Rejetée par Chorus » — motif obligatoire.
   *
   * @throws {ChorusNotDepositedError} @throws {ChorusOutcomeKnownError}
   * @throws {InvalidChorusDepositError} motif vide ou trop long.
   */
  reject(gesture: ChorusGesture, reason: string): ChorusDepositEntry {
    const depositedOn = this.assertAwaitingOutcome();
    const trimmed = reason.trim();
    if (trimmed === "" || trimmed.length > CHORUS_REJECTION_REASON_MAX) {
      throw new InvalidChorusDepositError(
        this.invoice.number,
        `le motif du rejet est obligatoire, ${String(CHORUS_REJECTION_REASON_MAX)} caractères au plus — recopier celui du portail.`,
      );
    }
    this.assertDay(gesture, depositedOn);
    return this.append("rejected", gesture, trimmed);
  }

  /**
   * « Mise en paiement » — facultatif, informatif.
   *
   * @throws {ChorusNotDepositedError} @throws {ChorusOutcomeKnownError}
   */
  accept(gesture: ChorusGesture): ChorusDepositEntry {
    const depositedOn = this.assertAwaitingOutcome();
    this.assertDay(gesture, depositedOn);
    return this.append("accepted", gesture, null);
  }

  /** Les lignes ajoutées depuis le chargement : ce que le dépôt écrit. */
  pending(): readonly ChorusDepositEntry[] {
    return [...this.added];
  }

  /** Le journal réduit à ses dates — ce que lit `effectiveDueOn`. */
  standing(): ChorusDepositStanding {
    return standingOf(this.entries);
  }

  private assertDepositable(): void {
    if (!isPublicInvoice(this.invoice)) {
      throw new InvoiceNotForChorusError(this.invoice.number);
    }
    if (this.invoice.creditedOut) {
      throw new CreditedInvoiceNotForChorusError(this.invoice.number);
    }
  }

  /** @returns le jour du dépôt. */
  private assertAwaitingOutcome(): string {
    if (!isPublicInvoice(this.invoice)) {
      throw new InvoiceNotForChorusError(this.invoice.number);
    }
    const deposited = this.find("deposited");
    if (deposited === null) {
      throw new ChorusNotDepositedError(this.invoice.number);
    }
    for (const outcome of ["rejected", "accepted"] as const) {
      const known = this.find(outcome);
      if (known !== null) {
        throw new ChorusOutcomeKnownError(this.invoice.number, outcome, known.occurredOn);
      }
    }
    return deposited.occurredOn;
  }

  private assertDay(gesture: ChorusGesture, earliest: string): void {
    if (!isCalendarDay(gesture.occurredOn)) {
      throw new InvalidChorusDepositError(
        this.invoice.number,
        `« ${gesture.occurredOn} » n'est pas un jour (AAAA-MM-JJ).`,
      );
    }
    if (gesture.occurredOn < earliest || gesture.occurredOn > gesture.today) {
      throw new ChorusDayOutOfRangeError(
        this.invoice.number,
        gesture.occurredOn,
        earliest,
        gesture.today,
      );
    }
  }

  private find(kind: ChorusDepositKind): ChorusDepositEntry | null {
    return this.entries.find((entry) => entry.kind === kind) ?? null;
  }

  private append(
    kind: ChorusDepositKind,
    gesture: ChorusGesture,
    reason: string | null,
  ): ChorusDepositEntry {
    const entry: ChorusDepositEntry = {
      id: gesture.entryId,
      kind,
      occurredOn: gesture.occurredOn,
      reason,
      staffId: gesture.staffId,
      staffName: gesture.staffName,
      recordedAt: gesture.at,
    };
    this.entries.push(entry);
    this.added.push(entry);
    return entry;
  }
}

/** Les dates d'un journal de dépôt — partagé avec les lecteurs qui ne chargent pas l'agrégat. */
export function standingOf(
  entries: readonly Pick<ChorusDepositEntry, "kind" | "occurredOn" | "reason">[],
): ChorusDepositStanding {
  const of = (kind: ChorusDepositKind) => entries.find((entry) => entry.kind === kind) ?? null;
  const rejected = of("rejected");
  return {
    depositedOn: of("deposited")?.occurredOn ?? null,
    rejectedOn: rejected?.occurredOn ?? null,
    rejectionReason: rejected?.reason ?? null,
    acceptedOn: of("accepted")?.occurredOn ?? null,
  };
}
