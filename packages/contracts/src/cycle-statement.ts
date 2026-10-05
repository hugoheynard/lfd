import { z } from "zod";

import type { VatShareView } from "./order.js";

/**
 * **Le relevé de cycle** — les commandes passées au compte par une société sur
 * un mois, et leurs totaux. Ce n'est pas une facture : ni numéro, ni mentions
 * (plan `documentation/order/plan-agregation-des-commandes.md`).
 */

/**
 * `?month=AAAA-MM` — la FORME seulement. Le serveur refuse aussi un mois futur,
 * mais c'est une règle, pas une forme : elle vit dans le domaine.
 */
export const statementMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u);

/** Un cycle de relevé : un mois civil, dans le fuseau des affaires. */
export interface StatementCycleView {
  /** `2026-09` — l'identité du cycle, à renvoyer en `?month=`. */
  readonly month: string;
  /** Inclusif, ISO. */
  readonly startsAt: string;
  /** **Exclusif**, ISO. */
  readonly closesAt: string;
  /** Le cycle contient l'instant présent : il accumule encore. */
  readonly inProgress: boolean;
}

/** Les cycles proposés au sélecteur, le plus récent d'abord. */
export interface StatementCyclesView {
  readonly cycles: readonly StatementCycleView[];
}

/** Une commande du relevé. Tous les montants en centimes, lus sur la commande. */
export interface CycleStatementOrderView {
  readonly id: string;
  readonly orderNumber: string;
  /** ISO — l'instant de passation, qui range la commande dans son cycle. */
  readonly placedAt: string;
  /** La société qui a commandé. Avant S4, c'est aussi le payeur. */
  readonly siteName: string;
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly voucherDiscountCents: number;
  /** `subtotal − discount − voucher`, hors livraison et surtaxe. */
  readonly htCents: number;
  readonly deliveryFeeCents: number;
  readonly lateFeeCents: number;
  /** La ventilation figée à la passation, ou `null` (commande antérieure au 2026-09-07). */
  readonly vatShares: readonly VatShareView[] | null;
  /** Faux ⇒ la TVA de la commande est comptée dans « non ventilée ». */
  readonly vatVentilated: boolean;
  readonly vatCents: number;
  readonly totalCents: number;
}

export interface CycleStatementTotalsView {
  readonly orderCount: number;
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly voucherDiscountCents: number;
  readonly htCents: number;
  readonly deliveryFeeCents: number;
  readonly lateFeeCents: number;
  /** Somme des parts figées, une par taux, du plus bas au plus haut. */
  readonly vatByRate: readonly VatShareView[];
  readonly unventilatedVatCents: number;
  /** = Σ `vatByRate` + `unventilatedVatCents`, au centime. */
  readonly vatCents: number;
  readonly totalCents: number;
}

export interface CycleStatementView {
  readonly companyId: string;
  readonly companyName: string;
  readonly cycle: StatementCycleView;
  /**
   * Toujours `true` avant S4-0 : le relevé est recalculé à chaque lecture, et
   * une commande annulée après coup en sort.
   */
  readonly provisional: boolean;
  /** Le périmètre, en toutes lettres — ce que le relevé ne couvre pas. */
  readonly scope: string;
  readonly orders: readonly CycleStatementOrderView[];
  readonly totals: CycleStatementTotalsView;
}
