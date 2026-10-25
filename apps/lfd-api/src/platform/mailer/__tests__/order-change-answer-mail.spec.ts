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
  it("appliquée : l'objet nomme la commande, le corps dit où la relire", () => {
    const mail = REGISTRY["customer.order-change-applied"]({
      reference: "ORD-0042",
      totalCents: 4250,
      previousTotalCents: 3800,
      locale: "fr",
    });
    expect(mail.subject).toBe("Commande ORD-0042 modifiée à votre demande");
    expect(mail.html).toContain("Mes commandes");
  });

  /** Décision du 2026-10-23 : la boutique promet que « le nouveau total vous est confirmé par e-mail ». */
  it("appliquée, total en hausse : le nouveau total TTC et ce qu'il y a de plus", () => {
    const mail = REGISTRY["customer.order-change-applied"]({
      reference: "ORD-0042",
      totalCents: 4250,
      previousTotalCents: 3800,
      locale: "fr",
    });
    expect(mail.html).toContain("Nouveau total TTC");
    expect(mail.html).toContain("42,50\u00a0€");
    expect(mail.html).toContain("Soit 4,50\u00a0€ de plus");
    expect(mail.html).toContain("38,00\u00a0€");
  });

  it("appliquée, total en baisse : l'écart dit en moins, jamais négatif", () => {
    const mail = REGISTRY["customer.order-change-applied"]({
      reference: "ORD-0042",
      totalCents: 3000,
      previousTotalCents: 3800,
      locale: "fr",
    });
    expect(mail.html).toContain("Soit 8,00\u00a0€ de moins");
    expect(mail.html).not.toContain("-8,00");
  });

  it("appliquée, total inchangé : il le dit, sans écart à zéro", () => {
    const mail = REGISTRY["customer.order-change-applied"]({
      reference: "ORD-0042",
      totalCents: 3800,
      previousTotalCents: 3800,
      locale: "fr",
    });
    expect(mail.html).toContain("Le total reste le même");
    expect(mail.html).not.toContain("0,00");
  });

  it("appliquée en anglais : le montant au format anglais", () => {
    const mail = REGISTRY["customer.order-change-applied"]({
      reference: "ORD-0042",
      totalCents: 4250,
      previousTotalCents: 3800,
      locale: "en",
    });
    expect(mail.html).toContain("€42.50");
  });

  it("refusée : le mot de l'équipe, échappé, et la commande inchangée", () => {
    const mail = REGISTRY["customer.order-change-refused"]({
      reference: "ORD-0042",
      reason: "La fournée <b>est</b> lancée.",
      locale: "fr",
    });
    expect(mail.subject).toBe("Commande ORD-0042 : modification impossible");
    expect(mail.html).toContain("La fournée &lt;b&gt;est&lt;/b&gt; lancée.");
    expect(mail.html).toContain("Votre commande reste telle que vous");
  });

  it("parle la langue du client", () => {
    const mail = REGISTRY["customer.order-change-refused"]({
      reference: "ORD-0042",
      reason: "Too late.",
      locale: "en",
    });
    expect(mail.subject).toBe("Order ORD-0042: change not possible");
  });
});
