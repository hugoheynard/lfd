import { type MailSendTimeline, mailSendStepsOf } from "../mail-send-steps.js";

const T0 = new Date(Date.UTC(2026, 0, 1, 8, 0, 0));
const at = (minutes: number): Date => new Date(T0.getTime() + minutes * 60_000);

const BASE: MailSendTimeline = {
  status: "requested",
  requestedAt: T0,
  firstAttemptAt: null,
  lastAttemptAt: null,
  sentAt: null,
  failedAt: null,
  delivery: null,
  deliveryAt: null,
};

describe("mailSendStepsOf — les étapes horodatées d'un envoi", () => {
  it("une demande seule n'a que son étape de demande", () => {
    expect(mailSendStepsOf(BASE)).toEqual([{ step: "requested", at: T0 }]);
  });

  it("un envoi accepté puis rebondi, dans l'ordre du temps", () => {
    const steps = mailSendStepsOf({
      ...BASE,
      status: "sent",
      firstAttemptAt: at(1),
      lastAttemptAt: at(1),
      sentAt: at(2),
      delivery: "bounced",
      deliveryAt: at(3),
    });
    expect(steps.map((step) => step.step)).toEqual([
      "requested",
      "first_attempt",
      "accepted",
      "bounced",
    ]);
  });

  it("dit la dernière tentative quand elle n'est pas la première, et l'échec d'avant l'acceptation", () => {
    const steps = mailSendStepsOf({
      ...BASE,
      status: "sent",
      firstAttemptAt: at(1),
      failedAt: at(2),
      lastAttemptAt: at(10),
      sentAt: at(11),
    });
    expect(steps.map((step) => step.step)).toEqual([
      "requested",
      "first_attempt",
      "failed",
      "last_attempt",
      "accepted",
    ]);
  });

  it("un refus se dit refus", () => {
    const steps = mailSendStepsOf({ ...BASE, status: "refused", failedAt: at(1) });
    expect(steps.at(-1)).toEqual({ step: "refused", at: at(1) });
  });
});
