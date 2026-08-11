import type { AlertKind, AlertRule } from "@lfd/contracts";

import type { AlertDraft } from "../evaluate-order.js";

/** Ce qu'il faut pour annoncer une alerte, en plus de l'alerte elle-même. */
export interface AlertContext {
  readonly companyId: string;
  readonly companyName: string;
  readonly orderNumber: string;
  readonly occurredAt: Date;
}

/**
 * Les **canaux** d'une alerte — ce qu'on fait en plus de l'inscrire au journal.
 *
 * Un port, pas une classe concrète : l'évaluation doit pouvoir se tester sans
 * mailer ni cloche, et dépendre du service réel la rendrait indissociable de ses
 * effets de bord.
 */
export abstract class AlertChannels {
  abstract dispatch(
    drafts: readonly AlertDraft[],
    rules: ReadonlyMap<AlertKind, AlertRule>,
    context: AlertContext,
  ): Promise<void>;
}
