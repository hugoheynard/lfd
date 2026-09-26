import {
  LoyaltyVoucherExpiredError,
  LoyaltyVoucherNotAvailableError,
} from "../errors/loyalty-errors.js";
import { LoyaltyHolder } from "../value-objects/loyalty-holder.js";
import { LoyaltyRatio } from "../value-objects/loyalty-ratio.js";
import type { LoyaltyReason } from "../value-objects/loyalty-reason.js";
import type { LoyaltySettings } from "../value-objects/loyalty-settings.js";

/**
 * Les états d'un bon au lot A. `reserved` n'existe pas encore : il attend le
 * traitement de TVA (plan D6 et §4).
 */
export type LoyaltyVoucherStatus = "available" | "expired" | "cancelled";

const MS_PER_DAY = 86_400_000;

/**
 * L'état d'un bon **lu à cet instant** : disponible mais passé sa date limite,
 * il se lit `expired`. Une fonction à part pour que l'agrégat et la lecture de
 * l'écran disent la même chose.
 */
export function voucherStatusAt(
  status: LoyaltyVoucherStatus,
  expiresAt: Date,
  now: Date,
): LoyaltyVoucherStatus {
  return status === "available" && now.getTime() >= expiresAt.getTime() ? "expired" : status;
}

/** L'agrégat tel que la base le range. */
export interface LoyaltyVoucherSnapshot {
  readonly id: string;
  readonly companyId: string | null;
  readonly userId: string | null;
  readonly valueCents: number;
  readonly pointsCost: number;
  readonly ratioPointsPerStep: number;
  readonly ratioStepValueCents: number;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly status: LoyaltyVoucherStatus;
  readonly parentVoucherId: string | null;
  readonly expiredAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly cancelledByStaffId: string | null;
  readonly cancellationReason: string | null;
}

/** Ce qu'il faut pour émettre un bon — les paliers ont déjà été payés en points. */
export interface LoyaltyVoucherIssue {
  readonly id: string;
  readonly holder: LoyaltyHolder;
  readonly steps: number;
  readonly settings: LoyaltySettings;
  readonly issuedAt: Date;
}

interface Cancellation {
  readonly at: Date;
  readonly byStaffId: string;
  readonly reason: string;
}

/**
 * **Un bon d'achat**, né d'une conversion de points (plan D5, D7).
 *
 * Son montant, son coût et le ratio appliqué sont figés à l'émission : changer
 * le réglage ne touche aucun bon émis. `available` est le seul état dont on
 * sort ; `expired` et `cancelled` sont terminaux.
 *
 * L'expiration se LIT à l'horloge ({@link isExpiredAt}) : un bon disponible
 * dont la date limite est passée n'est plus utilisable ni annulable, même
 * avant qu'une tâche l'ait écrit `expired`.
 */
export class LoyaltyVoucher {
  private constructor(
    readonly id: string,
    readonly holder: LoyaltyHolder,
    readonly valueCents: number,
    readonly pointsCost: number,
    readonly ratio: LoyaltyRatio,
    readonly issuedAt: Date,
    readonly expiresAt: Date,
    readonly parentVoucherId: string | null,
    private statusValue: LoyaltyVoucherStatus,
    private expiredAtValue: Date | null,
    private cancellationValue: Cancellation | null,
  ) {}

  /**
   * Un bon neuf, disponible, qui vaut `steps` paliers au ratio du réglage, et
   * dont la date limite tombe `voucherValidityDays` jours après l'émission.
   * Réservé à {@link LoyaltyAccount.convert}, qui a vérifié le solde.
   */
  static issue(issue: LoyaltyVoucherIssue): LoyaltyVoucher {
    const { ratio, voucherValidityDays } = issue.settings;
    const expiresAt = new Date(issue.issuedAt.getTime() + voucherValidityDays * MS_PER_DAY);
    return new LoyaltyVoucher(
      issue.id,
      issue.holder,
      ratio.valueOf(issue.steps),
      ratio.costOf(issue.steps),
      ratio,
      issue.issuedAt,
      expiresAt,
      null,
      "available",
      null,
      null,
    );
  }

  /** Ligne → agrégat. Le titulaire et le ratio revalident. */
  static reconstitute(row: LoyaltyVoucherSnapshot): LoyaltyVoucher {
    const cancellation =
      row.cancelledAt !== null && row.cancelledByStaffId !== null && row.cancellationReason !== null
        ? { at: row.cancelledAt, byStaffId: row.cancelledByStaffId, reason: row.cancellationReason }
        : null;
    return new LoyaltyVoucher(
      row.id,
      LoyaltyHolder.fromColumns(row.companyId, row.userId),
      row.valueCents,
      row.pointsCost,
      LoyaltyRatio.of(row.ratioPointsPerStep, row.ratioStepValueCents),
      row.issuedAt,
      row.expiresAt,
      row.parentVoucherId,
      row.status,
      row.expiredAt,
      cancellation,
    );
  }

  get status(): LoyaltyVoucherStatus {
    return this.statusValue;
  }

  get cancellationReason(): string | null {
    return this.cancellationValue?.reason ?? null;
  }

  /** Disponible, mais sa date limite est passée à cet instant. */
  isExpiredAt(now: Date): boolean {
    return this.statusValue === "available" && this.statusAt(now) === "expired";
  }

  /** L'état tel qu'on le lit à cet instant. */
  statusAt(now: Date): LoyaltyVoucherStatus {
    return voucherStatusAt(this.statusValue, this.expiresAt, now);
  }

  /**
   * Le staff annule le bon. Depuis `available` seulement, et avant sa date
   * limite : un bon expiré ne rend pas ses points (plan D7). Le recrédit est
   * le travail de {@link LoyaltyAccount.recreditCancelled}.
   *
   * @throws {LoyaltyVoucherNotAvailableError} déjà expiré ou annulé.
   * @throws {LoyaltyVoucherExpiredError} disponible, mais sa date limite est passée.
   */
  cancel(at: Date, byStaffId: string, reason: LoyaltyReason): void {
    if (this.statusValue !== "available") {
      throw new LoyaltyVoucherNotAvailableError(this.statusValue);
    }
    if (this.isExpiredAt(at)) {
      throw new LoyaltyVoucherExpiredError(this.expiresAt);
    }
    this.statusValue = "cancelled";
    this.cancellationValue = { at, byStaffId, reason: reason.text };
  }

  /**
   * Écrit l'expiration d'un bon disponible dont la date limite est passée.
   * Sans effet sinon — un rejeu ne réécrit rien.
   *
   * @returns `true` si le bon vient d'expirer.
   */
  expire(at: Date): boolean {
    if (!this.isExpiredAt(at)) {
      return false;
    }
    this.statusValue = "expired";
    this.expiredAtValue = at;
    return true;
  }

  toPersistence(): LoyaltyVoucherSnapshot {
    return {
      id: this.id,
      companyId: this.holder.companyId,
      userId: this.holder.userId,
      valueCents: this.valueCents,
      pointsCost: this.pointsCost,
      ratioPointsPerStep: this.ratio.pointsPerStep,
      ratioStepValueCents: this.ratio.stepValueCents,
      issuedAt: this.issuedAt,
      expiresAt: this.expiresAt,
      status: this.statusValue,
      parentVoucherId: this.parentVoucherId,
      expiredAt: this.expiredAtValue,
      cancelledAt: this.cancellationValue?.at ?? null,
      cancelledByStaffId: this.cancellationValue?.byStaffId ?? null,
      cancellationReason: this.cancellationValue?.reason ?? null,
    };
  }
}
