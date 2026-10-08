import { noticeRecipientOf } from "../collection-notice-recipient.js";

describe("à qui part l'avis de prélèvement (décision Hugo, 2026-10-08)", () => {
  it("au contact de facturation de la société payeuse, le plus ancien s'il y en a plusieurs", () => {
    expect(
      noticeRecipientOf({
        billingContactEmails: ["compta@port.test", "direction@port.test"],
        ownerEmail: "patron@port.test",
      }),
    ).toEqual({ email: "compta@port.test", source: "billing_contact" });
  });

  it("à défaut, au détenteur du compte", () => {
    expect(noticeRecipientOf({ billingContactEmails: [], ownerEmail: "patron@port.test" })).toEqual(
      { email: "patron@port.test", source: "owner" },
    );
  });

  it("un contact de facturation sans adresse lisible ne compte pas : on passe au détenteur", () => {
    expect(
      noticeRecipientOf({
        billingContactEmails: ["  ", "pas-une-adresse"],
        ownerEmail: " patron@port.test ",
      }),
    ).toEqual({ email: "patron@port.test", source: "owner" });
  });

  it("ni l'un ni l'autre : non envoyable, jamais une adresse devinée", () => {
    expect(noticeRecipientOf({ billingContactEmails: [], ownerEmail: null })).toBeNull();
    expect(noticeRecipientOf({ billingContactEmails: [], ownerEmail: "" })).toBeNull();
    expect(noticeRecipientOf(undefined)).toBeNull();
  });
});
