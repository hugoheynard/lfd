import { Logger } from "@nestjs/common";

import { AppError } from "../../../../platform/shared/errors/app-error.js";
import type { CardSubject, SubjectSettlement } from "../../../channels/subjects/index.js";
import { IntentLabel } from "../../domain/value-objects/intent-label.js";

const logger = new Logger("CardRefundLabel");

/**
 * **Les clés de pointage d'un remboursement** (plan
 * `documentation/payment/le-pointage-stripe.md`, § 4) — celles que le
 * sujet déclare dans sa description (`order_number`, `app`), opaques pour le
 * bloc, bornées par `IntentLabel`. 🔴 Un texte de pointage ne bloque jamais un
 * remboursement : un sujet qui ne se décrit pas, ou une clé refusée, rend
 * aucune clé — journalisé par identifiants seuls.
 */
export async function refundLabelOf(
  settlement: SubjectSettlement,
  subject: CardSubject,
): Promise<Readonly<Record<string, string>>> {
  try {
    const described = await settlement.describe(subject);
    return IntentLabel.metadataOf(described.metadata ?? {});
  } catch (error) {
    if (!(error instanceof AppError)) {
      throw error;
    }
    logger.warn(
      `Remboursement de ${subject.type}:${subject.id} émis sans clés de pointage : ${error.message}`,
    );
    return {};
  }
}
