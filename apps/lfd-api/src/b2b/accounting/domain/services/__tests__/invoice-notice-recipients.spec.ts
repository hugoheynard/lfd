import { invoiceNoticeRecipients } from "../invoice-notice-recipients.js";

describe("à qui part « Votre facture » (Q3)", () => {
  it("le contact de facturation du payeur, puis les rôles facturation des sous-comptes", () => {
    expect(
      invoiceNoticeRecipients(
        { billingContactEmails: ["compta@principal.test"], ownerEmail: "patron@principal.test" },
        ["compta@chalet.test", "gerant@chalet.test"],
      ),
    ).toEqual([
      { email: "compta@principal.test", source: "billing_contact" },
      { email: "compta@chalet.test", source: "site_billing" },
      { email: "gerant@chalet.test", source: "site_billing" },
    ]);
  });

  it("sans contact de facturation, le détenteur du payeur — comme l'avis de prélèvement", () => {
    expect(
      invoiceNoticeRecipients({ billingContactEmails: [], ownerEmail: " patron@port.test " }, []),
    ).toEqual([{ email: "patron@port.test", source: "owner" }]);
  });

  it("dédoublonne sans tenir compte de la casse : une boîte, un message, sous la première source", () => {
    expect(
      invoiceNoticeRecipients({ billingContactEmails: ["Compta@Groupe.test"], ownerEmail: null }, [
        "compta@groupe.test",
        "chalet@groupe.test",
        "CHALET@groupe.test",
      ]),
    ).toEqual([
      { email: "Compta@Groupe.test", source: "billing_contact" },
      { email: "chalet@groupe.test", source: "site_billing" },
    ]);
  });

  it("écarte une adresse vide ou sans arobase, sans rien deviner", () => {
    expect(
      invoiceNoticeRecipients({ billingContactEmails: ["  "], ownerEmail: "" }, [
        "",
        "pas-une-adresse",
      ]),
    ).toEqual([]);
  });

  it("un payeur absent de la carte n'empêche pas de prévenir les sous-comptes", () => {
    expect(invoiceNoticeRecipients(undefined, ["compta@chalet.test"])).toEqual([
      { email: "compta@chalet.test", source: "site_billing" },
    ]);
  });
});
