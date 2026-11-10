import {
  InvalidAppliedVoucherAmountError,
  LoyaltyVoucherExpiredError,
  LoyaltyVoucherLapsedForUseError,
  LoyaltyVoucherNotAvailableError,
  LoyaltyVoucherNotReservedError,
  LoyaltyVoucherNotUsableError,
  LoyaltyVoucherReservedError,
} from "../errors/loyalty-errors.js";
import {
  LoyaltyVoucherNotLapsableError,
  LoyaltyVoucherNotMergeableError,
  LoyaltyVoucherRemainderSettledError,
} from "../errors/voucher-restitution-errors.js";
import { voucherRestitutionOf } from "../services/voucher-restitution.js";
import { LoyaltyHolder } from "../value-objects/loyalty-holder.js";
import { LoyaltyRatio } from "../value-objects/loyalty-ratio.js";
import type { LoyaltyReason } from "../value-objects/loyalty-reason.js";
import {
  voucherStatusAt,
  type LoyaltyVoucherIssue,
  type LoyaltyVoucherSnapshot,
  type LoyaltyVoucherStatus,
  type VoucherRemainder,
  type VoucherReinstatement,
} from "./loyalty-voucher-shapes.js";

export {
  voucherStatusAt,
  type LoyaltyVoucherIssue,
  type LoyaltyVoucherSnapshot,
  type LoyaltyVoucherStatus,
  type VoucherRemainder,
  type VoucherReinstatement,
} from "./loyalty-voucher-shapes.js";

const MS_PER_DAY = 86_400_000;

interface Cancellation {
  readonly at: Date;
  readonly byStaffId: string;
  readonly reason: string;
}

interface MergeBack {
  readonly at: Date;
  readonly orderId: string;
}

/**
 * **Un bon de fidélité**, né d'une conversion de points (plan D5, D7).
 *
 * Son montant, son coût et le ratio appliqué sont figés à l'émission : changer
 * le réglage ne touche aucun bon émis. `available` sort vers `reserved`
 * (passation), `expired` ou `cancelled` ; `reserved` ne revient à `available`
 * — ou ne tombe à `expired` — que par l'annulation de la commande ; un
 * reliquat `available` peut être refondu (`merged_back`) dans son parent à
 * l'annulation de la commande qui l'a fait naître (lot C3b) ; `expired`,
 * `cancelled` et `merged_back` sont terminaux.
 *
 * `persistedStatus` est le statut lu en base à la reconstitution (`null` pour
 * un bon neuf) : la sauvegarde ne s'écrit que si la base le porte encore
 * (lot C3b, C3b.2) — un instantané périmé n'écrase jamais un état plus récent.
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
    private mergeBackValue: MergeBack | null = null,
    readonly persistedStatus: LoyaltyVoucherStatus | null = null,
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
      row.mergedBackAt !== null && row.mergedBackOrderId !== null
        ? { at: row.mergedBackAt, orderId: row.mergedBackOrderId }
        : null,
      row.status,
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
    if (this.remainderSettledAtValue !== null) {
      // Le rendre à pleine valeur À CÔTÉ de son reliquat doublerait la
      // valeur : seul `reinstate` sait refondre (lot C3b, C3b.4).
      throw new LoyaltyVoucherRemainderSettledError(this.id);
    }
    if (now.getTime() >= this.expiresAt.getTime()) {
      this.lapse(now);
      return "expired";
    }
    this.statusValue = "available";
    return "available";
  }

  /**
   * La commande qui portait ce bon est annulée (lot C3b, C3b.3, C3b.4) : le
   * rendre, refondre son reliquat, ou constater qu'il est éteint — l'issue de
   * {@link voucherRestitutionOf}, appliquée ici. Les refus (`blocked`) ne lèvent
   * pas : la commande seule sait dire si l'autre commande s'annule.
   *
   * C'est la SEULE méthode qui remet `remainderSettledAt` à `null` : réengagé
   * plus tard, le bon laissera un nouveau reliquat. Aucun point ne bouge.
   *
   * @param remainder le reliquat NON REFONDU de ce bon, ou `null`.
   * @throws {LoyaltyVoucherNotMergeableError} `remainder` n'est pas celui de ce bon.
   */
  reinstate(input: {
    readonly remainder: LoyaltyVoucher | null;
    readonly at: Date;
    readonly orderId: string;
    readonly engagedElsewhere: boolean;
  }): VoucherReinstatement {
    const { remainder, at } = input;
    if (remainder !== null && remainder.parentVoucherId !== this.id) {
      throw new LoyaltyVoucherNotMergeableError(
        remainder.id,
        `il n'est pas le reliquat de ${this.id}`,
      );
    }
    const issue = voucherRestitutionOf({
      parent: this,
      remainder,
      now: at,
      engagedElsewhere: input.engagedElsewhere,
    });
    switch (issue.kind) {
      case "already":
      case "blocked":
        return issue;
      case "lapsed":
        this.lapse(at);
        return {
          kind: "lapsed",
          remainder: issue.remainder,
          remainderExpired: issue.remainder?.expire(at) ?? false,
        };
      case "returned":
        this.restore();
        return { kind: "returned" };
      case "merged":
        issue.remainder.mergeBackInto(this, at, input.orderId);
        this.restore();
        return issue;
    }
  }

  /**
   * Ce reliquat est refondu dans son bon d'origine, à l'annulation de la
   * commande `orderId` (lot C3b) : `available → merged_back`. Il n'est jamais
   * supprimé — son montant, ses dates et son parent restent.
   *
   * @throws {LoyaltyVoucherNotMergeableError} pas le reliquat de `parent`, pas disponible, ou échu.
   */
  mergeBackInto(parent: LoyaltyVoucher, at: Date, orderId: string): void {
    if (this.parentVoucherId !== parent.id) {
      throw new LoyaltyVoucherNotMergeableError(
        this.id,
        `il n'est pas le reliquat de ${parent.id}`,
      );
    }
    if (this.statusValue !== "available") {
      throw new LoyaltyVoucherNotMergeableError(this.id, `état : ${this.statusValue}`);
    }
    if (this.isExpiredAt(at)) {
      throw new LoyaltyVoucherNotMergeableError(this.id, "sa date limite est passée");
    }
    this.statusValue = "merged_back";
    this.mergeBackValue = { at, orderId };
  }

  /**
   * Un bon engagé, échu à `at`, dont la commande est annulée : `reserved →
   * expired` (cas 4 du lot C3b). `expire()` ne convient pas : il ne part que
   * d'`available`.
   *
   * @throws {LoyaltyVoucherNotLapsableError} pas engagé, ou pas échu à `at`.
   */
  lapse(at: Date): void {
    if (this.statusValue !== "reserved") {
      throw new LoyaltyVoucherNotLapsableError(this.id, `état : ${this.statusValue}`);
    }
    if (at.getTime() < this.expiresAt.getTime()) {
      throw new LoyaltyVoucherNotLapsableError(this.id, "sa date limite n'est pas passée");
    }
    this.statusValue = "expired";
    this.expiredAtValue = at;
  }

  /** Le parent retrouve sa valeur et sa date d'origine, sans marque de solde. */
  private restore(): void {
    this.statusValue = "available";
    this.remainderSettledAtValue = null;
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
      mergedBackAt: this.mergeBackValue?.at ?? null,
      mergedBackOrderId: this.mergeBackValue?.orderId ?? null,
    };
  }
}
