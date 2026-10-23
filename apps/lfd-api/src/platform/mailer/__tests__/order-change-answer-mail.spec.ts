import { b2bMailTemplates } from "../mail-templates.js";

/**
 * Les réponses à une demande de modification (plan de modification, M4) : la
 * référence de la commande dans l'objet, le mot de l'équipe dans un refus,
 * dans la langue demandée.
 */
const REGISTRY = b2bMailTemplates({
  supportEmail: "admin@lfc.test",
  backOfficeUrl: "https://bo.lfc.test",
});

describe("customer.order-change-applied / -refused", () => {
  it("appliquée : l'objet nomme la commande, le corps dit où la relire", async () => {
    const mail = await REGISTRY["customer.order-change-applied"]({
      reference: "CMD-0042",
      locale: "fr",
    });
    expect(mail.subject).toBe("Commande CMD-0042 modifiée à votre demande");
    expect(mail.html).toContain("Mes commandes");
  });

  it("refusée : le mot de l'équipe, échappé, et la commande inchangée", async () => {
    const mail = await REGISTRY["customer.order-change-refused"]({
      reference: "CMD-0042",
      reason: "La fournée <b>est</b> lancée.",
      locale: "fr",
    });
    expect(mail.subject).toBe("Commande CMD-0042 : modification impossible");
    expect(mail.html).toContain("La fournée &lt;b&gt;est&lt;/b&gt; lancée.");
    expect(mail.html).toContain("Votre commande reste telle que vous");
  });

  it("parle la langue du client", async () => {
    const mail = await REGISTRY["customer.order-change-refused"]({
      reference: "CMD-0042",
      reason: "Too late.",
      locale: "en",
    });
    expect(mail.subject).toBe("Order CMD-0042: change not possible");
  });
});
