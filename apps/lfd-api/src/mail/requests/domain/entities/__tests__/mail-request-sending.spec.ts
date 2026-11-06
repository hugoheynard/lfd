import {
  MailRequestAlreadySettledError,
  MailRequestNotResumableError,
} from "../../errors/mail-request.errors.js";
import {
  MAIL_RESUME_WINDOW_MS,
  MAX_MAIL_ATTEMPTS,
  MailRequest,
  type MailRequestDraft,
} from "../mail-request.js";

/*
 * L'état `sending` et la reprise (S1b, plan `plan-service-e-mails.md`, § 8).
 * Les instants sont des décalages depuis la demande : rien n'est comparé au
 * calendrier.
 */

const REQUESTED_AT = new Date(0);
const MINUTE = 60_000;

function at(ms: number): Date {
  return new Date(REQUESTED_AT.getTime() + ms);
}

const DRAFT: MailRequestDraft = {
  id: "mail_1",
  template: "customer.order-ready",
  brand: "lfc",
  recipient: "client@example.test",
  locale: "fr",
  idempotencyKey: "order.ready:o1",
  requestedAt: REQUESTED_AT,
};

function sending(): MailRequest {
  const request = MailRequest.request(DRAFT);
  request.beginSending(at(MINUTE));
  return request;
}

describe("MailRequest — l'envoi différé engagé (`sending`)", () => {
  it("naît sans tentative", () => {
    expect(MailRequest.request(DRAFT).snapshot()).toMatchObject({
      firstAttemptAt: null,
      lastAttemptAt: null,
      attempts: 0,
    });
  });

  it("requested → sending : la première tentative est datée et comptée", () => {
    expect(sending().snapshot()).toMatchObject({
      status: "sending",
      firstAttemptAt: at(MINUTE),
      lastAttemptAt: at(MINUTE),
      attempts: 1,
    });
  });

  it.each([
    ["sent", (request: MailRequest) => request.markSent("re_1", at(2 * MINUTE))],
    ["refused", (request: MailRequest) => request.markRefused("non", at(2 * MINUTE))],
    ["failed", (request: MailRequest) => request.markFailed("réseau", at(2 * MINUTE))],
  ])("sending → %s", (status, settle) => {
    const request = sending();
    settle(request);
    expect(request.status).toBe(status);
  });

  it("failed → sending : une reprise garde la première tentative et compte l'essai", () => {
    const request = sending();
    request.markFailed("réseau", at(2 * MINUTE));

    request.beginSending(at(10 * MINUTE));

    expect(request.snapshot()).toMatchObject({
      status: "sending",
      firstAttemptAt: at(MINUTE),
      lastAttemptAt: at(10 * MINUTE),
      attempts: 2,
    });
  });

  it("sending → sending : l'orphelin se reprend dans la fenêtre", () => {
    const request = sending();
    request.beginSending(at(20 * MINUTE));
    expect(request.snapshot().attempts).toBe(2);
  });

  it("refuse la reprise à 23 h de la première tentative", () => {
    const request = sending();
    request.markFailed("réseau", at(2 * MINUTE));
    const tooLate = at(MINUTE + MAIL_RESUME_WINDOW_MS);

    expect(request.canResume(tooLate)).toBe(false);
    expect(request.isSendable(tooLate)).toBe(false);
    expect(() => request.beginSending(tooLate)).toThrow(MailRequestNotResumableError);
  });

  it("permet la reprise juste avant 23 h", () => {
    const request = sending();
    request.markFailed("réseau", at(2 * MINUTE));
    expect(request.isSendable(at(MINUTE + MAIL_RESUME_WINDOW_MS - 1))).toBe(true);
  });

  it("refuse la reprise au plafond d'essais", () => {
    const request = sending();
    for (let attempt = 1; attempt < MAX_MAIL_ATTEMPTS; attempt += 1) {
      request.beginSending(at((attempt + 1) * MINUTE));
    }
    expect(request.snapshot().attempts).toBe(MAX_MAIL_ATTEMPTS);
    expect(() => request.beginSending(at(60 * MINUTE))).toThrow(MailRequestNotResumableError);
  });

  it("un échec sans tentative différée (sendAndAwaitReceipt) ne se reprend pas seul", () => {
    const request = MailRequest.request(DRAFT);
    request.markFailed("réseau", at(MINUTE));

    expect(request.canResume(at(2 * MINUTE))).toBe(false);
    expect(() => request.beginSending(at(2 * MINUTE))).toThrow(MailRequestNotResumableError);
  });

  it.each([
    ["sent", (request: MailRequest) => request.markSent(null, at(2 * MINUTE))],
    ["refused", (request: MailRequest) => request.markRefused("non", at(2 * MINUTE))],
  ])("une demande %s ne s'engage plus", (_status, settle) => {
    const request = sending();
    settle(request);
    expect(request.isSendable(at(3 * MINUTE))).toBe(false);
    expect(() => request.beginSending(at(3 * MINUTE))).toThrow(MailRequestAlreadySettledError);
  });

  it("une demande `sending` n'est pas « envoyable » : l'envoi est déjà engagé", () => {
    expect(sending().isSendable(at(2 * MINUTE))).toBe(false);
  });

  it("giveUp : un `sending` hors fenêtre passe `failed`, avec la raison", () => {
    const request = sending();
    request.giveUp(at(MINUTE + MAIL_RESUME_WINDOW_MS));

    expect(request.snapshot()).toMatchObject({ status: "failed" });
    expect(request.snapshot().failureReason).toContain("23 h");
  });

  it("giveUp refuse de renoncer à un envoi encore reprenable", () => {
    expect(() => sending().giveUp(at(2 * MINUTE))).toThrow(MailRequestNotResumableError);
  });

  it("giveUp refuse une demande qui n'est pas engagée", () => {
    const request = MailRequest.request(DRAFT);
    expect(() => request.giveUp(at(MAIL_RESUME_WINDOW_MS * 2))).toThrow(
      MailRequestNotResumableError,
    );
  });
});
