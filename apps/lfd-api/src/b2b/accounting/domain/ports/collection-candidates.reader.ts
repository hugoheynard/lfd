import type { OrderCollectionState } from "../entities/order-collection.js";
import type { FrozenInvoiceOrder } from "../services/invoice-dossier.types.js";
import type { CollectableInvoice } from "../services/collection-assembly.js";
import type { BillingFollow } from "./statement-billing.reader.js";

/**
 * Une commande que la constitution d'un lot doit regarder : passée au compte
 * (le critère partagé de l'assiette), créée après le plancher et avant la
 * clôture, et dont l'état d'encaissement est absent, `due` ou `excluded`.
 */
export interface CollectableOrder {
  readonly orderId: string;
  readonly orderNumber: string;
  /** La société qui a commandé — le site, pour un sous-compte. */
  readonly companyId: string;
  readonly placedAt: Date;
  /** Le payeur copié à la passation (S4), `null` pour une commande d'avant. */
  readonly billedCompanyId: string | null;
  readonly totalCents: number;
  /**
   * Ce que le bon a figé pour sa facture — les entrées du simulateur. Lu en
   * F1 sans être consommé : le montant de ligne reste Σ `totalCents` jusqu'à
   * F2 (`documentation/comptabilite/facturation/le-prelevement-suit-la-facture.md`).
   */
  readonly frozen: FrozenInvoiceOrder;
  /** `null` = aucune ligne d'état : la commande est `due` par défaut. */
  readonly collection: OrderCollectionState | null;
}

/**
 * Les commandes que la **constitution** d'un lot regarde, leurs factures,
 * leurs payeurs et leurs noms. Le cycle se lit par `CollectionCalendarReader`,
 * la forme des sites et les mandats consommés par `CountedLotInputsReader` —
 * séparés le 2026-10-23 (ISP), même adaptateur.
 *
 * ⚠️ `collectableOrders` ne prend PAS l'entité, contrairement à ce que le plan
 * nomme (`collectableOrders(entity, closesAt)`, §1) : le rattachement passe
 * par le créancier du mandat, et les mandats appartiennent à `payments`. Un
 * adaptateur de la comptabilité qui les lirait franchirait la frontière en SQL.
 * Le rattachement est donc fait par le domaine (`assembleCollection`), sur ce
 * port et sur `CollectionMandatesReader`.
 */
export abstract class CollectionCandidatesReader {
  /**
   * Les SEULS identifiants des commandes de l'assiette créées sur
   * `[floor, closesAt[` — sans état ni contenu : la constitution les
   * verrouille avant de lire quoi que ce soit d'autre (doc
   * `documentation/commandes/annulation/annulation-par-le-staff.md`, C5.3).
   */
  abstract collectableOrderIds(floor: Date, closesAt: Date): Promise<readonly string[]>;

  /**
   * Parmi `orderIds`, les commandes prélevables créées sur `[floor, closesAt[`,
   * sans borne basse au-delà du plancher : une commande `due` ou `excluded`
   * d'un cycle passé revient (plan §3). RELUES — l'assiette et l'état
   * d'encaissement —, pour qu'une lecture faite sous verrou fasse autorité.
   */
  abstract collectableOrders(
    floor: Date,
    closesAt: Date,
    orderIds: readonly string[],
  ): Promise<readonly CollectableOrder[]>;

  /** Toutes les périodes `billing` de ces sociétés (le site suit son payeur). */
  abstract billingFollowsOf(companyIds: readonly string[]): Promise<readonly BillingFollow[]>;

  /** La raison sociale de ces sociétés — ce qui s'imprime en `Dbtr/Nm`. */
  abstract companyNames(companyIds: readonly string[]): Promise<ReadonlyMap<string, string>>;

  /**
   * Les factures émises (380) qui couvrent ces bons, par bon — chacune avec
   * TOUS ses bons, pas seulement ceux demandés.
   */
  abstract invoicesOf(
    orderIds: readonly string[],
  ): Promise<ReadonlyMap<string, CollectableInvoice>>;
}
