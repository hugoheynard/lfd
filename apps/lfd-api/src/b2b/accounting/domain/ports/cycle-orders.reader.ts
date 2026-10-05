import type { OrderCollectionStateName } from "../entities/order-collection.js";
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
  /** La société qui a commandé (`company_id`) — le site, quand c'est un sous-compte. */
  readonly companyId: string;
  /**
   * Le nom sous lequel ce site se reconnaît (`companyDisplayName` : l'enseigne,
   * à défaut la raison sociale). Deux chalets d'une même société ont la même
   * raison sociale ; seule l'enseigne les distingue sur un relevé.
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
  /**
   * L'état d'encaissement (`order_collection`, lot figé P2) — `due` quand
   * aucune ligne ne la cite : aucun lot ne l'a encore vue.
   */
  readonly collectionState: OrderCollectionStateName;
}

/** La société d'un relevé, sous ses deux noms. */
export interface StatementCompany {
  /** La raison sociale — l'en-tête et le nom du fichier. */
  readonly name: string;
  /** L'enseigne, à défaut la raison sociale — le titre de son groupe. */
  readonly label: string;
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
  /** La société du relevé, ou `null` si elle n'existe pas. */
  abstract statementCompany(companyId: string): Promise<StatementCompany | null>;

  /**
   * Les commandes passées au compte par ces sociétés sur `[startsAt, closesAt[`,
   * de la plus ancienne à la plus récente. Plusieurs sociétés : le relevé d'un
   * principal lit aussi celles de ses sites, que le domaine trie ensuite à date
   * (`billedPayerOf`).
   *
   * 🔴 Même périmètre que l'assiette : ni les commandes réglées par carte, ni
   * les gratuites, ni les annulées, ni celles d'un particulier.
   */
  abstract cycleOrders(
    companyIds: readonly string[],
    cycle: BillingCycle,
  ): Promise<readonly CycleOrder[]>;
}
