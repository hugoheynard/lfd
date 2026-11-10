import { noticeRecipientOf } from "../collection-notice-recipient.js";

describe("à qui part l'avis de prélèvement (décision Hugo, 2026-10-08)", () => {
  it("au contact de facturation de la société payeuse, le plus ancien s'il y en a plusieurs", () => {
    expect(
      noticeRecipientOf({
        billingContacts: [
          { id: "contact:1", email: "compta@port.test" },
          { id: "contact:2", email: "direction@port.test" },
        ],
        owner: { id: "user:owner", email: "patron@port.test" },
      }),
    ).toEqual({ email: "compta@port.test", source: "billing_contact" });
  });

  it("à défaut, au détenteur du compte", () => {
    expect(
      noticeRecipientOf({
        billingContacts: [],
        owner: { id: "user:owner", email: "patron@port.test" },
      }),
    ).toEqual({ email: "patron@port.test", source: "owner" });
  });

  it("un contact de facturation sans adresse lisible ne compte pas : on passe au détenteur", () => {
    expect(
      noticeRecipientOf({
        billingContacts: [
          { id: "contact:1", email: "  " },
          { id: "contact:2", email: "pas-une-adresse" },
        ],
        owner: { id: "user:owner", email: " patron@port.test " },
      }),
    ).toEqual({ email: "patron@port.test", source: "owner" });
  });

  it("ni l'un ni l'autre : non envoyable, jamais une adresse devinée", () => {
    expect(noticeRecipientOf({ billingContacts: [], owner: null })).toBeNull();
    expect(
      noticeRecipientOf({ billingContacts: [], owner: { id: "user:owner", email: "" } }),
    ).toBeNull();
    expect(noticeRecipientOf(undefined)).toBeNull();
  });
});
