import { z } from "zod";

import type { OrderCollectionStateView } from "./collection-batch.js";
import type { VatShareView } from "./order.js";

/**
 * **Le relevé de cycle** — les commandes passées au compte par une société sur
 * une PÉRIODE de facturation, et leurs totaux. Ce n'est pas une facture : ni
 * numéro, ni mentions (plan `documentation/commandes/plan-agregation-des-commandes.md`).
 *
 * La période suit le mode de facturation DU PAYEUR (plan
 * `plan-rythme-de-facturation.md`, §16.9, lot M4a) : un mois civil pour le
 * mensuel au 1er, une semaine pour l'hebdomadaire.
 */

/**
 * `?periodClosesAt=<ISO>` — la FORME seulement. Le serveur refuse aussi une
 * période qui n'a pas commencé, ou un instant qui n'est pas une clôture de
 * l'entité : ce sont des règles, elles vivent dans le domaine.
 */
export const statementPeriodSchema = z.iso.datetime();

/**
 * `?companyId=` de `GET …/statements/cycles` (lot M4a) — la FORME seulement :
 * le payeur dont le sélecteur propose les périodes (ses semaines s'il est
 * hebdomadaire). Absent : le calendrier de l'entité en service.
 */
export const statementPayerSchema = z.string().min(1);

/** Une période de relevé : `[periodStartsAt, periodClosesAt[`, dans le fuseau des affaires. */
export interface StatementCycleView {
  /** ISO, **exclusif** — l'identité de la période, à renvoyer en `?periodClosesAt=`. */
  readonly periodClosesAt: string;
  /** ISO, inclusif — la clôture précédente réelle. */
  readonly periodStartsAt: string;
  /** « du 1er au 30 septembre 2026 » — jours locaux, dernier jour inclus. */
  readonly periodLabel: string;
  /** La période contient l'instant présent : elle accumule encore. */
  readonly inProgress: boolean;
}

/**
 * Les périodes proposées au sélecteur, la plus récente d'abord : celle en
 * cours, puis celles qui se sont closes APRÈS la mise en service de la facture
 * par période (au plus douze).
 */
export interface StatementCyclesView {
  readonly cycles: readonly StatementCycleView[];
}

/** Une commande du relevé. Tous les montants en centimes, lus sur la commande. */
export interface CycleStatementOrderView {
  readonly id: string;
  readonly orderNumber: string;
  /**
   * ISO — l'instant de passation. Il ne range PAS la commande dans son cycle :
   * depuis ZL (2026-10-22), un cycle montre les bons que sa facture porte ou
   * portera, rangés par jour de livraison.
   */
  readonly placedAt: string;
  /** La société qui a commandé — le site, quand c'est un sous-compte. */
  readonly companyId: string;
  /** Son enseigne, à défaut sa raison sociale. */
  readonly siteName: string;
  /**
   * Qui règle cette commande quand ce n'est pas la société du relevé : le
   * principal que ce site suivait en `billing` à la date de la commande. `null`
   * sinon — et toujours `null` dans le relevé du principal.
   */
  readonly paidBy: StatementPayerView | null;
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
  /**
   * L'état d'encaissement (`order_collection`, lot P2 du lot figé) — `due`
   * quand aucun lot ne l'a encore vue.
   */
  readonly collectionState: OrderCollectionStateView;
  /**
   * Vrai : la facture émise du cycle porte ce bon, annulé depuis. Il reste au
   * relevé — le total du relevé reste celui de la facture — et l'avoir reste à
   * émettre (« Annulé après facturation »).
   */
  readonly cancelledAfterInvoicing: boolean;
}

/** Une société qui en règle une autre. */
export interface StatementPayerView {
  readonly companyId: string;
  readonly name: string;
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
   * Toujours `true` avant S4-0 : le relevé est recalculé à chaque lecture.
   * Une commande annulée avant la facture du cycle en sort ; annulée après,
   * elle reste, marquée `cancelledAfterInvoicing`.
   */
  readonly provisional: boolean;
  /** Le périmètre, en toutes lettres — ce que le relevé ne couvre pas. */
  readonly scope: string;
  /**
   * La société du relevé d'abord (`ownOrders`), puis un groupe par site qui la
   * suivait en `billing` à la date de ses commandes, par nom. Avant S4, tous
   * les sites sont groupés ici, un sous-total chacun.
   */
  readonly groups: readonly CycleStatementGroupView[];
  /** = la somme des groupes, au centime. */
  readonly totals: CycleStatementTotalsView;
  /**
   * Ses sous-comptes actuels qui ne suivent pas `billing` : des entités qui
   * règlent seules. Listées pour qu'on les retrouve, **sans montant**.
   */
  readonly selfPayingEntities: readonly StatementEntityView[];
}

/** Un groupe du relevé : ses commandes, et leur sous-total. */
export interface CycleStatementGroupView {
  readonly companyId: string;
  /** L'enseigne du site, ou celle de la société du relevé pour son propre groupe. */
  readonly label: string;
  readonly ownOrders: boolean;
  readonly orders: readonly CycleStatementOrderView[];
  readonly totals: CycleStatementTotalsView;
}

/** Une entité rattachée qui règle seule. */
export interface StatementEntityView {
  readonly companyId: string;
  readonly name: string;
}
