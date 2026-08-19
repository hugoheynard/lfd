import type { AccountAlertView } from "@lfd/contracts";

import type { AlertDraft } from "../evaluate-order.js";

/** Ce qu'il faut pour inscrire une alerte au journal d'un compte. */
export interface AlertToRecord extends AlertDraft {
  readonly companyId: string;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly occurredAt: Date;
}

/**
 * Le journal des alertes d'un compte.
 *
 * `record` est **idempotent** : un événement rejoué (reprise de file, redémarrage,
 * double publication) ne double pas le journal. C'est la clé `kind:orderId` qui
 * le garantit en base, pas une vérification applicative qui perdrait la course.
 */
export abstract class AccountAlertRepository {
  abstract record(alerts: readonly AlertToRecord[]): Promise<void>;

  abstract listForCompany(companyId: string): Promise<AccountAlertView[]>;

  /** Acquitter est idempotent : ré-acquitter ne réécrit pas l'auteur d'origine. */
  abstract acknowledge(id: string, staffSub: string, at: Date): Promise<void>;

  /** Le compte d'alertes **non acquittées**, par société — pour la pastille. */
  abstract countUnacknowledged(): Promise<ReadonlyMap<string, number>>;
}
