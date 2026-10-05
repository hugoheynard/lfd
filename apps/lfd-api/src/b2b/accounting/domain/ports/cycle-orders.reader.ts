import type { BillingCycle } from "../services/billing-cycle.js";

/**
 * La part de TVA d'un taux, telle que la commande l'a **figée** à sa passation.
 *
 * `rate` est le nombre produit par `ventilateVat` (`@lfd/money`) — `5.5`, et
 * jamais le `Decimal(5,2)` d'une ligne de commande, qui s'écrit `5.50` : les
 * deux ne sont pas la même clé (plan `agregation-des-commandes`, §1.1).
 */
export interface FrozenVatShare {
  readonly rate: number;
  readonly amountCents: number;
}

/**
 * Une commande du relevé, **montants lus tels quels** sur la commande.
 *
 * Aucun champ n'est recalculé : le relevé additionne ce que la commande a figé,
 * et c'est la condition pour que le prélèvement, le relevé et la facture future
 * tombent sur le même centime.
 */
export interface CycleOrder {
  readonly id: string;
  readonly orderNumber: string;
  readonly placedAt: Date;
  /**
   * Le site qui a commandé — la raison sociale de `company_id`. Avant S4, c'est
   * aussi le payeur ; après, ce sera le sous-compte, et le payeur sera figé à
   * part (`billed_company_id`).
   */
  readonly siteName: string;
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly voucherDiscountCents: number;
  readonly deliveryFeeCents: number;
  readonly lateFeeCents: number;
  readonly vatCents: number;
  /**
   * `null` = commande antérieure au 2026-09-07 (jamais rétro-remplie), ou JSON
   * illisible. Elle n'est ni exclue ni re-ventilée : sa TVA va en « non
   * ventilée ».
   */
  readonly vatShares: readonly FrozenVatShare[] | null;
  readonly totalCents: number;
}

/**
 * Les commandes d'un relevé, **une par une**.
 *
 * Un port à part de `BillableOrdersReader`, et pas une méthode de plus : le
 * brouillon de prélèvement ne lit que des sommes par société, le relevé que des
 * commandes d'une société. Aucun des deux n'a l'usage de l'autre (ISP). Le
 * CRITÈRE, lui, est commun et écrit une seule fois dans l'adaptateur
 * (`billable-order-criterion.ts`) : un relevé qui ne retomberait pas sur
 * l'assiette du prélèvement ne servirait pas à le rapprocher.
 */
export abstract class CycleOrdersReader {
  /** La raison sociale de la société, ou `null` si elle n'existe pas. */
  abstract companyName(companyId: string): Promise<string | null>;

  /**
   * Les commandes passées au compte par cette société sur `[startsAt, closesAt[`,
   * de la plus ancienne à la plus récente.
   *
   * 🔴 Même périmètre que l'assiette : ni les commandes réglées par carte, ni
   * les gratuites, ni les annulées, ni celles d'un particulier.
   */
  abstract cycleOrders(companyId: string, cycle: BillingCycle): Promise<readonly CycleOrder[]>;
}
