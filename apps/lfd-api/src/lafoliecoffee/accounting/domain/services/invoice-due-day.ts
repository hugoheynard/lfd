import { collectionDayOf } from "./collection-calendar.js";

/** La suite des clôtures, vue de l'échéance : la prochaine après un instant. */
export interface NextClosure {
  closureAfter(instant: Date): Date;
}

/** Les deux réglages de l'entité qui font l'échéance. */
export interface DueDaySettings {
  readonly preNotificationDays: number;
  readonly collectionDaysAfterClosure: number | null;
}

/**
 * **Le jour de prélèvement qu'une facture annonce** (`dueOn`, BT-9).
 *
 * Émise à temps — la veille de sa clôture C, avant C —, elle part dans le lot
 * de C : échéance = `collectionDayOf(C)`, comme avant.
 *
 * 🔴 Émise APRÈS C (rattrapage d'un passage manqué, bouton tardif), elle ne
 * peut plus entrer dans le lot de C s'il est déjà préparé ; elle part dans le
 * lot de la clôture suivante. Annoncer l'échéance de C promettrait au client
 * une date antérieure au prélèvement réel (Hugo, 2026-10-12 : « applique le
 * correctif »). On annonce donc celle de la prochaine clôture après
 * l'émission.
 *
 * ⚠️ Approximation assumée : si le lot de C n'est pas encore préparé à
 * l'émission, c'est lui qui la prendra, et le prélèvement tombera avant la
 * date imprimée sur la facture. Le préavis reste tenu : l'avis de
 * prélèvement part avec le lot et dit la vraie date, que D4
 * (`frozenCollectionDay`) ne laisse jamais plus proche que le délai de
 * pré-notification. Seule la facture annonce alors une date plus tardive.
 */
export function invoiceDueDay(
  closesAt: Date,
  issuedAt: Date,
  closures: NextClosure,
  settings: DueDaySettings,
): string {
  const lotClosure =
    issuedAt.getTime() < closesAt.getTime() ? closesAt : closures.closureAfter(issuedAt);
  return collectionDayOf(
    lotClosure,
    settings.preNotificationDays,
    settings.collectionDaysAfterClosure,
  );
}
