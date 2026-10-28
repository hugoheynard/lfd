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
