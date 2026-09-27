import {
  InvalidAppliedVoucherAmountError,
  LoyaltyVoucherExpiredError,
  LoyaltyVoucherLapsedForUseError,
  LoyaltyVoucherNotAvailableError,
  LoyaltyVoucherNotReservedError,
  LoyaltyVoucherNotUsableError,
  LoyaltyVoucherReservedError,
} from "../errors/loyalty-errors.js";
import { LoyaltyHolder } from "../value-objects/loyalty-holder.js";
import { LoyaltyRatio } from "../value-objects/loyalty-ratio.js";
import type { LoyaltyReason } from "../value-objects/loyalty-reason.js";
import type { LoyaltySettings } from "../value-objects/loyalty-settings.js";

/**
 * Les états d'un bon (plan D7). `reserved` : engagé sur une commande vivante,
 * depuis le lot C. Il n'y a pas d'état `used` — un bon réservé sur une commande
 * qui vit EST consommé, et n'en revient que par l'annulation de la commande.
 */
export type LoyaltyVoucherStatus = "available" | "expired" | "cancelled" | "reserved";

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
  /** Le reliquat de ce bon est soldé — émis, éteint, ou rien à émettre (lot C). */
  readonly remainderSettledAt: Date | null;
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

/**
 * Ce que laisse un bon consommé sur une commande (plan C5, §11 bis B2) :
 * - `settled` : déjà soldé — rien n'est refait ;
 * - `none` : il a tout imputé ;
 * - `issued` : un reliquat, nouveau bon du même titulaire ;
 * - `lapsed` : il restait `remainderCents`, mais sa date limite était passée
 *   à l'émission — le reliquat s'éteint, comme l'aurait fait le bon inutilisé.
 */
export type VoucherRemainder =
  | { readonly kind: "none" }
  | { readonly kind: "settled" }
  | { readonly kind: "issued"; readonly voucher: LoyaltyVoucher }
  | { readonly kind: "lapsed"; readonly remainderCents: number };

interface Cancellation {
  readonly at: Date;
  readonly byStaffId: string;
  readonly reason: string;
}

/**
 * **Un bon de fidélité**, né d'une conversion de points (plan D5, D7).
 *
 * Son montant, son coût et le ratio appliqué sont figés à l'émission : changer
 * le réglage ne touche aucun bon émis. `available` sort vers `reserved`
 * (passation), `expired` ou `cancelled` ; `reserved` ne revient à `available`
 * — ou ne tombe à `expired` — que par l'annulation de la commande ; `expired`
 * et `cancelled` sont terminaux.
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
    private remainderSettledAtValue: Date | null = null,
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
      row.remainderSettledAt,
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
   * @throws {LoyaltyVoucherReservedError} engagé sur une commande vivante (plan C9).
   * @throws {LoyaltyVoucherNotAvailableError} déjà expiré ou annulé.
   * @throws {LoyaltyVoucherExpiredError} disponible, mais sa date limite est passée.
   */
  cancel(at: Date, byStaffId: string, reason: LoyaltyReason): void {
    if (this.statusValue === "reserved") {
      throw new LoyaltyVoucherReservedError();
    }
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

  /**
   * La passation engage le bon sur une commande (plan C3, D7) : `available →
   * reserved`. Appelée sous le verrou du titulaire, sur un bon RELU : une
   * course perdue trouve un bon déjà réservé et est refusée.
   *
   * @throws {LoyaltyVoucherNotUsableError} déjà réservé, annulé ou expiré.
   * @throws {LoyaltyVoucherLapsedForUseError} disponible, mais échu à cet instant.
   */
  reserve(now: Date): void {
    this.ensureUsableAt(now);
    this.statusValue = "reserved";
  }

  /**
   * Le bon pourrait-il être engagé à cet instant ? La même règle que
   * {@link reserve}, sans rien changer : c'est ce que lit le devis, et la
   * passation avant de chiffrer son total.
   *
   * @throws {LoyaltyVoucherNotUsableError} déjà réservé, annulé ou expiré.
   * @throws {LoyaltyVoucherLapsedForUseError} disponible, mais échu à cet instant.
   */
  ensureUsableAt(now: Date): void {
    if (this.statusValue !== "available") {
      throw new LoyaltyVoucherNotUsableError(this.statusValue);
    }
    if (this.isExpiredAt(now)) {
      throw new LoyaltyVoucherLapsedForUseError(this.expiresAt);
    }
  }

  /**
   * La commande qui le portait est annulée : le bon revient (plan C4, D7).
   * Un bon réservé n'expire pas ; libéré après sa date limite, il passe
   * directement à `expired`.
   *
   * @returns l'état où il retombe.
   * @throws {LoyaltyVoucherNotReservedError} il n'était pas réservé.
   */
  release(now: Date): "available" | "expired" {
    if (this.statusValue !== "reserved") {
      throw new LoyaltyVoucherNotReservedError(this.statusValue);
    }
    if (now.getTime() >= this.expiresAt.getTime()) {
      this.statusValue = "expired";
      this.expiredAtValue = now;
      return "expired";
    }
    this.statusValue = "available";
    return "available";
  }

  /**
   * Ce que le bon laisse, une fois la commande définitive (plan C5) :
   * `valueCents − appliedCents`. Le reliquat garde le titulaire et **la date
   * limite du bon d'origine** — sinon un reliquat en chaîne prolongerait la
   * validité sans fin —, et ne coûte aucun point : le parent les a payés.
   *
   * Rien si la date limite est passée à l'émission (§11 bis B2) : le reliquat
   * s'éteint, et l'appelant le journalise.
   *
   * 🔴 Dans TOUS les cas, le bon est marqué soldé (`remainderSettledAt`) : un
   * second appel rend `settled` sans rien refaire. C'est cette marque qui
   * rend l'extinction journalisable une seule fois, et qui borne le passage de
   * nuit aux seuls bons encore à solder (décision du 2026-09-27).
   *
   * @throws {LoyaltyVoucherNotReservedError} le bon n'est pas engagé.
   * @throws {InvalidAppliedVoucherAmountError} montant imputé hors de `[0, valueCents]`.
   */
  leaveRemainder(remainder: {
    readonly id: string;
    readonly appliedCents: number;
    readonly at: Date;
  }): VoucherRemainder {
    if (this.statusValue !== "reserved") {
      throw new LoyaltyVoucherNotReservedError(this.statusValue);
    }
    if (this.remainderSettledAtValue !== null) {
      return { kind: "settled" };
    }
    const { appliedCents, at } = remainder;
    if (!Number.isInteger(appliedCents) || appliedCents < 0 || appliedCents > this.valueCents) {
      throw new InvalidAppliedVoucherAmountError(appliedCents, this.valueCents);
    }
    const remainderCents = this.valueCents - appliedCents;
    this.remainderSettledAtValue = at;
    if (remainderCents === 0) {
      return { kind: "none" };
    }
    if (at.getTime() >= this.expiresAt.getTime()) {
      return { kind: "lapsed", remainderCents };
    }
    return {
      kind: "issued",
      voucher: new LoyaltyVoucher(
        remainder.id,
        this.holder,
        remainderCents,
        0,
        this.ratio,
        at,
        this.expiresAt,
        this.id,
        "available",
        null,
        null,
        null,
      ),
    };
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
      remainderSettledAt: this.remainderSettledAtValue,
      expiredAt: this.expiredAtValue,
      cancelledAt: this.cancellationValue?.at ?? null,
      cancelledByStaffId: this.cancellationValue?.byStaffId ?? null,
      cancellationReason: this.cancellationValue?.reason ?? null,
    };
  }
}
