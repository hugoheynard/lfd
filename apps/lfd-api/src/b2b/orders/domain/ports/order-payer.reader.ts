import type { OrderCompanyStatus } from "./company-status.reader.js";

/** Le principal qu'un site suit en `billing` à un instant. */
export interface OrderPayerFollow {
  readonly payerId: string;
  readonly payerName: string;
  readonly payerStatus: OrderCompanyStatus;
}

/** Ce que la passation doit savoir de la société qui commande pour en déduire le payeur. */
export interface OrderPayerStanding {
  readonly companyId: string;
  readonly companyName: string;
  /** « Compte de groupe, sans livraison » (§4) : il ne commande pas en son nom. */
  readonly groupWithoutDelivery: boolean;
  /** La période `billing` en cours à l'instant demandé, ou `null` : la société paie seule. */
  readonly billingFollow: OrderPayerFollow | null;
}

/**
 * **Qui paie une commande, lu au moment de la passer** (`plan-sous-comptes.md`
 * §2.3, §2.4).
 *
 * Un port à part d'`OrderGuardReader` (ISP) : seule la composition le lit, une
 * fois par commande, et le garde n'a pas à grossir pour elle. La résolution
 * vit dans `company_follows`, datée — le payeur d'aujourd'hui ne vaut que
 * pour une commande d'aujourd'hui, et c'est pourquoi il est COPIÉ ensuite.
 */
export abstract class OrderPayerReader {
  /** `null` si la société n'existe pas — la passation la refuse déjà ailleurs. */
  abstract standingAt(companyId: string, at: Date): Promise<OrderPayerStanding | null>;
}
