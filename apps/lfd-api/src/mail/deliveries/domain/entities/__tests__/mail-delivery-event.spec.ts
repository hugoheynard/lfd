import { InvalidMailDeliveryEventError } from "../../errors/mail-delivery-event.errors.js";
import { MailDeliveryEvent, type MailDeliveryEventDraft } from "../mail-delivery-event.js";

// Comparés entre eux seulement.
const OCCURRED = new Date(1_000);
const RECEIVED = new Date(2_000);

const DRAFT: MailDeliveryEventDraft = {
  id: "evt_1",
  svixId: "msg_1",
  providerId: "re_1",
  delivery: "bounced",
  kind: "Permanent/General",
  occurredAt: OCCURRED,
  receivedAt: RECEIVED,
};

describe("MailDeliveryEvent — un retour rangé", () => {
  it("rend le retour à appliquer, à l'instant du fournisseur", () => {
    expect(MailDeliveryEvent.receive(DRAFT).report()).toEqual({
      delivery: "bounced",
      kind: "Permanent/General",
      at: OCCURRED,
    });
  });

  it.each([
    ["sans identifiant Svix", { svixId: "" }],
    ["sans identifiant Resend", { providerId: "" }],
    ["à l'identifiant Svix trop long", { svixId: "m".repeat(201) }],
    ["au genre trop long", { kind: "K".repeat(65) }],
  ])("refuse un retour %s", (_label, patch) => {
    expect(() => MailDeliveryEvent.receive({ ...DRAFT, ...patch })).toThrow(
      InvalidMailDeliveryEventError,
    );
  });
});
