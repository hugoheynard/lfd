import type { BillingFollow } from "./statement-billing.reader.js";

/** Une société citée : de quoi la nommer et faire un lien. */
export interface UnpaidCompanyRef {
  readonly id: string;
  /** L'enseigne, à défaut la raison sociale. */
  readonly name: string;
}

/** Une commande écartée `payer_detached`, telle que le lot l'a laissée. */
export interface DetachedUnpaidRow {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly placedAt: Date;
  readonly totalCents: number;
  /** Le site qui a commandé. */
  readonly site: UnpaidCompanyRef;
  /** Le payeur copié à la passation, `null` pour une commande d'avant S4. */
  readonly billedCompanyId: string | null;
  /** Quand le lot l'a écartée (`order_collection.updated_at`). */
  readonly excludedAt: Date;
}

/**
 * **Les impayés d'un site détaché** (`plan-sous-comptes.md` §2.1 quater, R3) :
 * les commandes que la constitution d'un lot a écartées `payer_detached`, et
 * qui le restent. Elles se règlent à la main ; le principal n'est jamais
 * débité d'office.
 *
 * Un port à part (ISP) : seule cette lecture le sert, en admin et côté client.
 */
export abstract class DetachedUnpaidReader {
  /** Toutes les commandes actuellement écartées `payer_detached`, de la plus ancienne. */
  abstract rows(): Promise<readonly DetachedUnpaidRow[]>;

  /** Les périodes `billing` de ces sites — le payeur des commandes d'avant S4. */
  abstract followsOf(siteIds: readonly string[]): Promise<readonly BillingFollow[]>;

  /** Ces sociétés, nommées. Une société inconnue est absente de la carte. */
  abstract companies(ids: readonly string[]): Promise<ReadonlyMap<string, UnpaidCompanyRef>>;
}
