import type { StoredMailDelivery, StoredMailStatus } from "./mail-send-state.js";

export type MailSendStepKind =
  | "requested"
  | "first_attempt"
  | "last_attempt"
  | "accepted"
  | "failed"
  | "refused"
  | StoredMailDelivery;

export interface MailSendStep {
  readonly step: MailSendStepKind;
  readonly at: Date;
}

/** Ce que les étapes lisent d'une demande. */
export interface MailSendTimeline {
  readonly status: StoredMailStatus;
  readonly requestedAt: Date;
  readonly firstAttemptAt: Date | null;
  readonly lastAttemptAt: Date | null;
  readonly sentAt: Date | null;
  readonly failedAt: Date | null;
  readonly delivery: StoredMailDelivery | null;
  readonly deliveryAt: Date | null;
}

/**
 * **Les étapes horodatées d'un envoi**, dans l'ordre du temps (plan
 * `plan-suivi-des-e-mails.md`, lot T2). Une étape sans instant n'est pas
 * servie. `failedAt` est le DERNIER échec ou le refus : un envoi accepté
 * après un échec garde son échec dans l'histoire. La dernière tentative
 * n'est dite que si elle n'est pas la première.
 */
export function mailSendStepsOf(timeline: MailSendTimeline): readonly MailSendStep[] {
  const steps: MailSendStep[] = [{ step: "requested", at: timeline.requestedAt }];
  push(steps, "first_attempt", timeline.firstAttemptAt);
  if (timeline.lastAttemptAt?.getTime() !== timeline.firstAttemptAt?.getTime()) {
    push(steps, "last_attempt", timeline.lastAttemptAt);
  }
  push(steps, "accepted", timeline.sentAt);
  push(steps, timeline.status === "refused" ? "refused" : "failed", timeline.failedAt);
  if (timeline.delivery !== null) {
    push(steps, timeline.delivery, timeline.deliveryAt);
  }
  return [...steps].sort((left, right) => left.at.getTime() - right.at.getTime());
}

function push(steps: MailSendStep[], step: MailSendStepKind, at: Date | null): void {
  if (at !== null) {
    steps.push({ step, at });
  }
}
