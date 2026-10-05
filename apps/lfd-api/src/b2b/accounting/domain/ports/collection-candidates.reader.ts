import type { OrderCollectionState } from "../entities/order-collection.js";
import type { SepaScheme } from "../value-objects/sepa-scheme.js";
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
  readonly totalCents: number;
  /** `null` = aucune ligne d'état : la commande est `due` par défaut. */
  readonly collection: OrderCollectionState | null;
}

/**
 * Ce que la **constitution** d'un lot lit, et elle seule (ISP : un seul
 * consommateur, toutes ces méthodes lui servent).
 *
 * ⚠️ `collectableOrders` ne prend PAS l'entité, contrairement à ce que le plan
 * nomme (`collectableOrders(entity, closesAt)`, §1) : le rattachement passe
 * par le créancier du mandat, et les mandats appartiennent à `payments`. Un
 * adaptateur de la comptabilité qui les lirait franchirait la frontière en SQL.
 * Le rattachement est donc fait par le domaine (`assembleCollection`), sur ce
 * port et sur `CollectionMandatesReader`.
 */
export abstract class CollectionCandidatesReader {
  /** Le plancher posé par la migration, `null` s'il a disparu. */
  abstract floor(): Promise<Date | null>;

  /**
   * Les commandes prélevables créées sur `[floor, closesAt[`, sans borne basse
   * au-delà du plancher : une commande `due` ou `excluded` d'un cycle passé
   * revient (plan §3).
   */
  abstract collectableOrders(floor: Date, closesAt: Date): Promise<readonly CollectableOrder[]>;

  /** Toutes les périodes `billing` de ces sociétés (le site suit son payeur). */
  abstract billingFollowsOf(companyIds: readonly string[]): Promise<readonly BillingFollow[]>;

  /** La raison sociale de ces sociétés — ce qui s'imprime en `Dbtr/Nm`. */
  abstract companyNames(companyIds: readonly string[]): Promise<ReadonlyMap<string, string>>;

  /** Parmi ces mandats, ceux qui ont déjà une ligne dans un lot DÉPOSÉ. */
  abstract consumedMandates(mandateIds: readonly string[]): Promise<ReadonlySet<string>>;

  /** La dernière clôture d'un lot vivant de l'entité, strictement avant `before`. */
  abstract previousClosure(legalEntityId: string, before: Date): Promise<Date | null>;

  /** Les schémas qui ont DÉJÀ un lot vivant pour cette clôture. */
  abstract liveSchemes(legalEntityId: string, closesAt: Date): Promise<readonly SepaScheme[]>;
}
