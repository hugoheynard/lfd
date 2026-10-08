import type { OrderCollectionState } from "../entities/order-collection.js";
import type { CollectionFormName } from "../value-objects/collection-form.js";
import type { SepaScheme } from "../value-objects/sepa-scheme.js";
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
   * F2 (`documentation/facturation/plan-le-prelevement-suit-la-facture.md`).
   */
  readonly frozen: FrozenInvoiceOrder;
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

  /**
   * La forme de prélèvement de ces sites en vigueur à `at` — la CLÔTURE du
   * cycle, jamais l'heure du téléchargement (plan-sous-comptes §2.1 ter). Un
   * site absent de la carte n'a pas de décision : `principal_mandate`.
   */
  abstract collectionFormsAt(
    companyIds: readonly string[],
    at: Date,
  ): Promise<ReadonlyMap<string, CollectionFormName>>;

  /** La raison sociale de ces sociétés — ce qui s'imprime en `Dbtr/Nm`. */
  abstract companyNames(companyIds: readonly string[]): Promise<ReadonlyMap<string, string>>;

  /** Parmi ces mandats, ceux qui ont déjà une ligne dans un lot DÉPOSÉ. */
  abstract consumedMandates(mandateIds: readonly string[]): Promise<ReadonlySet<string>>;

  /** La dernière clôture d'un lot vivant de l'entité, strictement avant `before`. */
  abstract previousClosure(legalEntityId: string, before: Date): Promise<Date | null>;

  /**
   * La mise en service de la facture du mois (E4) : un bon passé depuis
   * attend sa facture au lieu d'être arrêté. `null` si la ligne a disparu.
   */
  abstract invoicingFloor(): Promise<Date | null>;

  /**
   * Les factures émises (380) qui couvrent ces bons, par bon — chacune avec
   * TOUS ses bons, pas seulement ceux demandés.
   */
  abstract invoicesOf(
    orderIds: readonly string[],
  ): Promise<ReadonlyMap<string, CollectableInvoice>>;

  /** Les schémas qui ont DÉJÀ un lot vivant pour cette clôture. */
  abstract liveSchemes(legalEntityId: string, closesAt: Date): Promise<readonly SepaScheme[]>;
}
