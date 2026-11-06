import { invoiceNoticeRecipients } from "../invoice-notice-recipients.js";

const contact = (n: number, email: string) => ({ id: `contact:${String(n)}`, email });
const site = (n: number, email: string) => ({ id: `user:${String(n)}`, email });

describe("à qui part « Votre facture » (Q3)", () => {
  it("le contact de facturation du payeur, puis les rôles facturation des sous-comptes", () => {
    expect(
      invoiceNoticeRecipients(
        {
          billingContacts: [contact(1, "compta@principal.test")],
          owner: { id: "user:owner", email: "patron@principal.test" },
        },
        [site(2, "compta@chalet.test"), site(3, "gerant@chalet.test")],
      ),
    ).toEqual([
      { id: "contact:1", email: "compta@principal.test", source: "billing_contact" },
      { id: "user:2", email: "compta@chalet.test", source: "site_billing" },
      { id: "user:3", email: "gerant@chalet.test", source: "site_billing" },
    ]);
  });

  it("sans contact de facturation, le détenteur du payeur — comme l'avis de prélèvement", () => {
    expect(
      invoiceNoticeRecipients(
        { billingContacts: [], owner: { id: "user:owner", email: " patron@port.test " } },
        [],
      ),
    ).toEqual([{ id: "user:owner", email: "patron@port.test", source: "owner" }]);
  });

  it("dédoublonne sans tenir compte de la casse : une boîte, un message, sous la première source et son identifiant", () => {
    expect(
      invoiceNoticeRecipients(
        { billingContacts: [contact(1, "Compta@Groupe.test")], owner: null },
        [
          site(2, "compta@groupe.test"),
          site(3, "chalet@groupe.test"),
          site(4, "CHALET@groupe.test"),
        ],
      ),
    ).toEqual([
      { id: "contact:1", email: "Compta@Groupe.test", source: "billing_contact" },
      { id: "user:3", email: "chalet@groupe.test", source: "site_billing" },
    ]);
  });

  it("écarte une adresse vide ou sans arobase, sans rien deviner", () => {
    expect(
      invoiceNoticeRecipients(
        { billingContacts: [contact(1, "  ")], owner: { id: "user:owner", email: "" } },
        [site(2, ""), site(3, "pas-une-adresse")],
      ),
    ).toEqual([]);
  });

  it("un payeur absent de la carte n'empêche pas de prévenir les sous-comptes", () => {
    expect(invoiceNoticeRecipients(undefined, [site(2, "compta@chalet.test")])).toEqual([
      { id: "user:2", email: "compta@chalet.test", source: "site_billing" },
    ]);
  });
});
