import { b2bMailTemplates } from "../mail-templates.js";

/*
 * Le gabarit « votre livraison est en route » (plan-en-route.md, PL3-D4) :
 * ce qu'il dit, et surtout ce qu'il ne promet pas.
 */

const REGISTRY = b2bMailTemplates({
  supportEmail: "admin@lfc.test",
  backOfficeUrl: "https://bo.lfc.test",
});
const enRoute = REGISTRY["customer.delivery-en-route"];

function render(overrides: Partial<Parameters<typeof enRoute>[0]> = {}) {
  return enRoute({
    reference: "ORD-4812",
    addressLines: ["12 rue des Lilas", "", "73150 Val d'Isère"],
    orderUrl: "https://app.lfc.test/mes-commandes",
    locale: "fr",
    ...overrides,
  });
}

describe("le courriel « votre livraison est en route »", () => {
  it("porte le sujet du plan, la référence, l'adresse et « dans la journée »", () => {
    const rendered = render();

    expect(rendered.subject).toBe("Votre livraison est en route");
    expect(rendered.html).toContain("ORD-4812");
    expect(rendered.html).toContain("12 rue des Lilas, 73150 Val d&#39;Isère");
    expect(rendered.html).toContain("il arrive dans la journée");
    expect(rendered.html).toContain("https://app.lfc.test/mes-commandes");
  });

  it("ne promet aucune heure et ne joint rien", () => {
    const rendered = render();

    expect(rendered.html).not.toMatch(/\d{1,2} ?h ?\d{2}/u);
    expect(rendered.attachments).toBeUndefined();
  });

  it("sans adresse ni lien : ni ligne d'adresse, ni bouton", () => {
    const rendered = render({ addressLines: [], orderUrl: "" });

    expect(rendered.html).not.toContain("Livrée à");
    expect(rendered.html).not.toContain("Voir ma commande");
  });

  it("parle la langue demandée", () => {
    expect(render({ locale: "en" }).subject).toBe("Your delivery is on its way");
    expect(render({ locale: "it" }).subject).toBe("La sua consegna è in viaggio");
  });
});
