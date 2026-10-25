import { b2bMailTemplates } from "../mail-templates.js";

/*
 * L'avis au principal (plan-notifications-sous-comptes.md, N2) : le site,
 * l'action, le numéro ; le montant seulement si le principal le voit (Q1) ;
 * jamais la personne (Q4), jamais de lien (S6 non bâti).
 */

const REGISTRY = b2bMailTemplates({
  supportEmail: "admin@lfc.test",
  backOfficeUrl: "https://bo.lfc.test",
});
const notice = REGISTRY["customer.sub-account-activity"];

function render(overrides: Partial<Parameters<typeof notice>[0]> = {}) {
  return notice({
    activity: "placed",
    siteName: "Chalet Gentiane",
    orderNumber: "ORD-0042",
    totalCents: 123_456,
    requestedFor: "2030-01-02",
    enteredByTeam: false,
    ...overrides,
  });
}

describe("le courriel « un de vos sites a… »", () => {
  it("nomme le site, l'action, la commande, le jour et le montant", () => {
    const rendered = render();

    expect(rendered.subject).toBe(
      "Chalet Gentiane — Commande passée par un de vos sites (ORD-0042)",
    );
    expect(rendered.html).toContain("Votre site Chalet Gentiane a passé la commande ORD-0042.");
    expect(rendered.html).toContain("mercredi 2 janvier");
    expect(rendered.html).toMatch(/1\s234,56\s€/u);
  });

  it("tait le montant quand le site ne suivait ni billing ni pricing (Q1)", () => {
    const rendered = render({ totalCents: null });

    expect(rendered.html).not.toContain("Montant");
    expect(rendered.html).not.toContain("€");
  });

  it("dit qu'une commande a été saisie par l'équipe", () => {
    expect(render({ enteredByTeam: true }).html).toContain("saisie par notre équipe");
  });

  it("dit chaque action avec ses mots", () => {
    expect(render({ activity: "cancelled" }).subject).toContain("Commande annulée");
    expect(render({ activity: "abandoned" }).html).toContain("a abandonné le règlement");
    expect(render({ activity: "payment_failed" }).subject).toContain("Paiement échoué");
  });

  it("ne porte aucun lien vers l'espace du site", () => {
    expect(render().html).not.toMatch(/href="https?:\/\/(?!.*mailto)[^"]*(mes-commandes|compte)/u);
  });
});
