import { readReceivedEmail, readResendEvent } from "../resend-event.js";

describe("readReceivedEmail — un e-mail reçu", () => {
  it("lit l'identifiant Resend d'un `email.received`", () => {
    expect(readReceivedEmail({ type: "email.received", data: { email_id: "in_1" } })).toEqual({
      emailId: "in_1",
    });
  });

  it.each([
    ["un autre type", { type: "email.bounced", data: { email_id: "re_1" } }],
    ["sans identifiant", { type: "email.received", data: {} }],
    ["sans données", { type: "email.received" }],
    ["illisible", null],
  ])("rend `null` pour %s", (_label, payload) => {
    expect(readReceivedEmail(payload)).toBeNull();
  });

  it("n'est pas un statut d'envoi : le journal des envois l'ignore", () => {
    expect(readResendEvent({ type: "email.received", data: { email_id: "in_1" } })).toBeNull();
  });
});

describe("readResendEvent — un retour", () => {
  const bounced = {
    type: "email.bounced",
    created_at: "2026-01-01T10:00:00.000Z",
    data: {
      email_id: "re_1",
      bounce: { message: "550 x@y.fr unknown", type: "Permanent", subType: "Suppressed" },
    },
  };

  it("lit le retour, l'identifiant, le genre et l'instant — jamais le texte", () => {
    const event = readResendEvent(bounced);

    expect(event).toEqual({
      delivery: "bounced",
      providerId: "re_1",
      kind: "Permanent/Suppressed",
      occurredAt: new Date("2026-01-01T10:00:00.000Z"),
    });
    expect(JSON.stringify(event)).not.toContain("x@y.fr");
  });

  it("un rebond sans genre lisible n'a pas de genre", () => {
    const payload = { ...bounced, data: { email_id: "re_1", bounce: { message: "boîte pleine" } } };

    expect(readResendEvent(payload)?.kind).toBeNull();
  });

  it("un instant illisible donne `null`, l'appelant prend le sien", () => {
    expect(readResendEvent({ ...bounced, created_at: "hier" })?.occurredAt).toBeNull();
  });

  it.each([
    ["email.delivery_delayed", "delayed"],
    ["email.delivered", "delivered"],
    ["email.complained", "complained"],
  ])("%s → %s", (type, delivery) => {
    expect(readResendEvent({ type, data: { email_id: "re_1" } })?.delivery).toBe(delivery);
  });

  it.each(["email.sent", "email.opened", "email.clicked", "email.failed"])("écarte %s", (type) => {
    expect(readResendEvent({ type, data: { email_id: "re_1" } })).toBeNull();
  });
});
