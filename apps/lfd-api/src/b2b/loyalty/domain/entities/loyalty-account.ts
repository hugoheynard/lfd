import {
  EmptyAdjustmentError,
  InsufficientLoyaltyPointsError,
  InvalidEarnedPointsError,
  InvalidStepCountError,
  LoyaltyBalanceBelowZeroError,
  LoyaltyProgramClosedError,
  LoyaltyProgramClosedToClienteleError,
  LoyaltyVoucherNotAvailableError,
} from "../errors/loyalty-errors.js";
import type { LoyaltyHolder } from "../value-objects/loyalty-holder.js";
import { isPositiveInteger } from "../value-objects/loyalty-ratio.js";
import type { LoyaltyReason } from "../value-objects/loyalty-reason.js";
import type { LoyaltySettings } from "../value-objects/loyalty-settings.js";
import { LoyaltyVoucher } from "./loyalty-voucher.js";

/** Les sortes de lignes du livre (plan D2). */
export type LoyaltyEntryKind = "earned" | "converted" | "adjusted";

/** Une ligne du livre à écrire — jamais réécrite, jamais effacée. */
export interface LoyaltyLedgerEntry {
  readonly id: string;
  readonly holder: LoyaltyHolder;
  readonly kind: LoyaltyEntryKind;
  /** Signé : négatif à la conversion. */
  readonly points: number;
  readonly orderId: string | null;
  readonly voucherId: string | null;
  readonly occurredAt: Date;
  readonly actorUserId: string | null;
  readonly staffUserId: string | null;
  readonly reason: string | null;
}

/** Ce que demande une conversion. */
export interface LoyaltyConversion {
  readonly steps: number;
  /** `null` = aucun réglage posé : le programme est fermé. */
  readonly settings: LoyaltySettings | null;
  readonly voucherId: string;
  readonly entryId: string;
  readonly actorUserId: string;
  readonly at: Date;
}

/** Ce que rapporte une commande définitive (plan D3, D4). */
export interface LoyaltyOrderGain {
  readonly entryId: string;
  readonly orderId: string;
  readonly points: number;
  readonly at: Date;
}

/** Ce que porte un geste du staff sur le livre. */
export interface LoyaltyStaffAct {
  readonly entryId: string;
  readonly staffUserId: string;
  readonly reason: LoyaltyReason;
  readonly at: Date;
}

/**
 * **Le livre de points d'un titulaire**, chargé SOUS SON VERROU.
 *
 * Il porte l'invariant qui compte : **le solde ne descend jamais sous zéro**
 * (plan D2). Le solde est la somme des lignes, relue après le verrou ; chaque
 * geste qui retire des points le confronte ici, et ajoute sa ligne à
 * {@link pendingEntries}, que le dépôt écrit dans la même transaction.
 *
 * Un livre chargé hors verrou ne garantirait rien : deux conversions
 * concurrentes liraient le même solde. C'est le dépôt qui le prend
 * (`LoyaltyAccountRepository.loadLocked`).
 */
export class LoyaltyAccount {
  private readonly pending: LoyaltyLedgerEntry[] = [];

  private constructor(
    readonly holder: LoyaltyHolder,
    private balanceValue: number,
  ) {}

  /** Le livre d'un titulaire, à la somme relue sous verrou. */
  static reconstitute(holder: LoyaltyHolder, balance: number): LoyaltyAccount {
    return new LoyaltyAccount(holder, balance);
  }

  get balance(): number {
    return this.balanceValue;
  }

  /** Les lignes que ce chargement a produites, à écrire par le dépôt. */
  get pendingEntries(): readonly LoyaltyLedgerEntry[] {
    return this.pending;
  }

  /**
   * Convertit des points en un bon de `steps` paliers entiers, au ratio du
   * réglage — lu maintenant, figé sur le bon (plan D5).
   *
   * @throws {InvalidStepCountError} pas un entier strictement positif.
   * @throws {LoyaltyProgramClosedError} aucun réglage posé.
   * @throws {LoyaltyProgramClosedToClienteleError} la clientèle du titulaire est fermée.
   * @throws {InsufficientLoyaltyPointsError} le solde ne couvre pas le coût.
   */
  convert(conversion: LoyaltyConversion): LoyaltyVoucher {
    const { settings, steps } = conversion;
    if (!isPositiveInteger(steps)) {
      throw new InvalidStepCountError(steps);
    }
    if (settings === null) {
      throw new LoyaltyProgramClosedError();
    }
    if (!settings.isOpenTo(this.holder)) {
      throw new LoyaltyProgramClosedToClienteleError(
        this.holder.kind === "company" ? "pro" : "public",
      );
    }
    const cost = settings.ratio.costOf(steps);
    if (cost > this.balanceValue) {
      throw new InsufficientLoyaltyPointsError(this.balanceValue, cost);
    }
    const voucher = LoyaltyVoucher.issue({
      id: conversion.voucherId,
      holder: this.holder,
      steps,
      settings,
      issuedAt: conversion.at,
    });
    this.append({
      id: conversion.entryId,
      kind: "converted",
      points: -cost,
      orderId: null,
      voucherId: voucher.id,
      at: conversion.at,
      actorUserId: conversion.actorUserId,
    });
    return voucher;
  }

  /**
   * Crédite ce que rapporte une commande définitive. N'écrit qu'un gain par
   * commande : c'est l'index partiel `(order_id) WHERE kind = 'earned'` qui le
   * garantit, et l'appelant le vérifie avant sous le verrou du titulaire.
   *
   * @throws {InvalidEarnedPointsError} pas un entier strictement positif.
   */
  earn(gain: LoyaltyOrderGain): void {
    if (!isPositiveInteger(gain.points)) {
      throw new InvalidEarnedPointsError(gain.points);
    }
    this.append({
      id: gain.entryId,
      kind: "earned",
      points: gain.points,
      orderId: gain.orderId,
      voucherId: null,
      at: gain.at,
      actorUserId: null,
    });
  }

  /**
   * Un ajustement motivé du staff, en plus ou en moins.
   *
   * @throws {EmptyAdjustmentError} zéro point, ou pas un entier.
   * @throws {LoyaltyBalanceBelowZeroError} le retrait dépasse le solde.
   */
  adjust(points: number, act: LoyaltyStaffAct): void {
    if (!Number.isSafeInteger(points) || points === 0) {
      throw new EmptyAdjustmentError();
    }
    if (this.balanceValue + points < 0) {
      throw new LoyaltyBalanceBelowZeroError(this.balanceValue, points);
    }
    this.appendStaffAct(points, null, act);
  }

  /**
   * Rend au livre les points d'un bon que le staff vient d'annuler — une ligne
   * `adjusted` liée au bon. La base n'en accepte qu'une par bon : une
   * annulation rejouée ne recrédite pas deux fois.
   *
   * @throws {LoyaltyVoucherNotAvailableError} le bon n'est pas annulé, ou pas de ce titulaire.
   */
  recreditCancelled(voucher: LoyaltyVoucher, act: LoyaltyStaffAct): void {
    if (voucher.status !== "cancelled" || !voucher.holder.equals(this.holder)) {
      throw new LoyaltyVoucherNotAvailableError(voucher.status);
    }
    this.appendStaffAct(voucher.pointsCost, voucher.id, act);
  }

  private appendStaffAct(points: number, voucherId: string | null, act: LoyaltyStaffAct): void {
    this.pending.push({
      id: act.entryId,
      holder: this.holder,
      kind: "adjusted",
      points,
      orderId: null,
      voucherId,
      occurredAt: act.at,
      actorUserId: null,
      staffUserId: act.staffUserId,
      reason: act.reason.text,
    });
    this.balanceValue += points;
  }

  private append(entry: {
    readonly id: string;
    readonly kind: LoyaltyEntryKind;
    readonly points: number;
    readonly orderId: string | null;
    readonly voucherId: string | null;
    readonly at: Date;
    readonly actorUserId: string | null;
  }): void {
    this.pending.push({
      id: entry.id,
      holder: this.holder,
      kind: entry.kind,
      points: entry.points,
      orderId: entry.orderId,
      voucherId: entry.voucherId,
      occurredAt: entry.at,
      actorUserId: entry.actorUserId,
      staffUserId: null,
      reason: null,
    });
    this.balanceValue += entry.points;
  }
}
