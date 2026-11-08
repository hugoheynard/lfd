import { InvalidMailDeliveryEventError } from "../domain/errors/mail-delivery-event.errors.js";
import {
  type MailDeliveryReport,
  mailDeliveryOf,
} from "../../requests/domain/value-objects/mail-delivery.js";

/** Les colonnes d'un retour rangé qu'une demande applique. */
export interface DeliveryRow {
  readonly delivery: string;
  readonly kind: string | null;
  readonly occurredAt: Date;
}

/** Relit un retour rangé ; le CHECK en base interdit une valeur inconnue. */
export function reportOf(row: DeliveryRow): MailDeliveryReport {
  const delivery = mailDeliveryOf(row.delivery);
  if (delivery === null) {
    throw new InvalidMailDeliveryEventError(`le retour « ${row.delivery} »`);
  }
  return { delivery, kind: row.kind, at: row.occurredAt };
}
