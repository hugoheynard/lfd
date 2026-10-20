import { b2bMailTemplates } from "../mail-templates.js";

/*
 * L'avis au principal d'un geste hors commande (plan-notifications-sous-comptes.md,
 * N4a) : le site et le geste ; jamais la personne (Q4), jamais le contenu.
 */

const REGISTRY = b2bMailTemplates({
  supportEmail: "admin@lfc.test",
  backOfficeUrl: "https://bo.lfc.test",
});
const notice = REGISTRY["customer.sub-account-gesture"];

function render(overrides: Partial<Parameters<typeof notice>[0]> = {}) {
  return notice({
    gesture: "problem_reported",
    siteName: "Chalet Gentiane",
    reference: "CMD-0042",
    byTeam: false,
    ...overrides,
  });
}

describe("le courriel « un de vos sites a… » d'un geste hors commande", () => {
  it("nomme le site, le geste et la commande", () => {
    const rendered = render();

    expect(rendered.subject).toBe(
      "Chalet Gentiane — Problème signalé par un de vos sites (CMD-0042)",
    );
    expect(rendered.html).toContain(
      "Votre site Chalet Gentiane a signalé un problème sur la commande CMD-0042.",
    );
    expect(rendered.html).toContain("Commande");
  });

  it("dit qu'un geste a été fait par l'équipe", () => {
    expect(render({ byTeam: true }).html).toContain("(fait par notre équipe)");
    expect(render().html).not.toContain("notre équipe");
  });

  it("sans référence, ni parenthèse au sujet ni ligne « Commande »", () => {
    const rendered = render({ reference: null });

    expect(rendered.subject).toBe("Chalet Gentiane — Problème signalé par un de vos sites");
    expect(rendered.html).not.toContain("Commande");
  });

  it("un geste d'adresse ne dit RIEN de l'adresse, ni de référence", () => {
    const rendered = render({ gesture: "default_delivery_set", reference: null, byTeam: true });

    expect(rendered.subject).toBe(
      "Chalet Gentiane — Adresse de livraison par défaut changée sur un de vos sites",
    );
    expect(rendered.html).toContain(
      "Votre site Chalet Gentiane a changé son adresse de livraison par défaut (fait par notre équipe).",
    );
  });

  it("un geste sur un contact ne nomme personne", () => {
    const rendered = render({ gesture: "primary_contact_changed", reference: null });

    expect(rendered.subject).toBe("Chalet Gentiane — Contact principal changé sur un de vos sites");
    expect(rendered.html).toContain("Votre site Chalet Gentiane a changé son contact principal.");
    expect(render({ gesture: "contact_added", reference: null }).html).toContain(
      "a ajouté un contact.",
    );
  });

  it("le RIB et la preuve de mandat : rien du compte", () => {
    expect(render({ gesture: "bank_account_changed", reference: null }).html).toContain(
      "Votre site Chalet Gentiane a enregistré un nouveau RIB.",
    );
    expect(
      render({ gesture: "mandate_proof_attached", reference: null, byTeam: true }).html,
    ).toContain("a déposé une preuve de mandat (fait par notre équipe).");
  });
});
