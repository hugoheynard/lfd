import {
  InvalidMailRequestError,
  MailRequestAlreadySettledError,
  UnknownMailBrandError,
} from "../../errors/mail-request.errors.js";
import { MailRequest, type MailRequestDraft } from "../mail-request.js";

const REQUESTED_AT = new Date(0);
const LATER = new Date(60_000);

const DRAFT: MailRequestDraft = {
  id: "mail_1",
  template: "customer.order-ready",
  brand: "lfc",
  recipient: "client@example.test",
  locale: "fr",
  idempotencyKey: "order.ready:o1",
  requestedAt: REQUESTED_AT,
};

describe("MailRequest — la demande et son suivi", () => {
  it("naît demandée, sans identifiant fournisseur ni date d'envoi", () => {
    const request = MailRequest.request(DRAFT);

    expect(request.snapshot()).toMatchObject({
      status: "requested",
      providerId: null,
      sentAt: null,
      failedAt: null,
      brand: "lfc",
    });
    expect(request.isSettled()).toBe(false);
  });

  it.each([
    ["template", { template: "  " }],
    ["recipient", { recipient: "" }],
    ["idempotencyKey", { idempotencyKey: " " }],
    ["id", { id: "" }],
  ])("refuse une demande au champ %s vide", (_field, patch) => {
    expect(() => MailRequest.request({ ...DRAFT, ...patch })).toThrow(InvalidMailRequestError);
  });

  it("refuse une clé d'idempotence trop longue", () => {
    expect(() => MailRequest.request({ ...DRAFT, idempotencyKey: "k".repeat(201) })).toThrow(
      InvalidMailRequestError,
    );
  });

  it("refuse une marque inconnue", () => {
    expect(() => MailRequest.request({ ...DRAFT, brand: "billetterie" })).toThrow(
      UnknownMailBrandError,
    );
  });

  it("envoyée : garde l'identifiant fournisseur et l'instant, et se ferme", () => {
    const request = MailRequest.request(DRAFT);
    request.markSent("re_123", LATER);

    expect(request.snapshot()).toMatchObject({
      status: "sent",
      providerId: "re_123",
      sentAt: LATER,
    });
    expect(request.isSettled()).toBe(true);
  });

  it("en échec technique : reste ouverte, et peut encore partir", () => {
    const request = MailRequest.request(DRAFT);
    request.markFailed("Resend injoignable", LATER);

    expect(request.snapshot()).toMatchObject({
      status: "failed",
      failureReason: "Resend injoignable",
      failedAt: LATER,
    });
    expect(request.isSettled()).toBe(false);
    request.markSent(null, LATER);
    expect(request.snapshot()).toMatchObject({ status: "sent", failureReason: null });
  });

  it("refusée : close, la raison est tronquée à 500 caractères", () => {
    const request = MailRequest.request(DRAFT);
    request.markRefused("x".repeat(800), LATER);

    expect(request.status).toBe("refused");
    expect(request.snapshot().failureReason).toHaveLength(500);
    expect(request.isSettled()).toBe(true);
  });

  it.each([
    ["envoyée", (r: MailRequest) => r.markSent("re_1", LATER)],
    ["refusée", (r: MailRequest) => r.markRefused("adresse invalide", LATER)],
  ])("une demande %s ne prend plus aucune transition", (_label, close) => {
    const request = MailRequest.request(DRAFT);
    close(request);

    expect(() => request.markSent("re_2", LATER)).toThrow(MailRequestAlreadySettledError);
    expect(() => request.markFailed("panne", LATER)).toThrow(MailRequestAlreadySettledError);
    expect(() => request.markRefused("refus", LATER)).toThrow(MailRequestAlreadySettledError);
  });

  it("se relit telle qu'elle a été rangée, close comprise", () => {
    const request = MailRequest.request(DRAFT);
    request.markSent("re_9", LATER);
    const reread = MailRequest.rehydrate(request.snapshot());

    expect(reread.snapshot()).toEqual(request.snapshot());
    expect(() => reread.markSent("re_10", LATER)).toThrow(MailRequestAlreadySettledError);
  });
});
