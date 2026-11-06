import { b2bMailTemplates } from "../mail-templates.js";
import { MAIL_LOGO_ATTACHMENT } from "../mail-logo.js";

/*
 * Le gabarit « votre livraison est en route » (en-route.md, PL3-D4) :
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
    window: null,
    orderUrl: "https://app.lfc.test/mes-commandes",
    locale: "fr",
    ...overrides,
  });
}

describe("le courriel « votre livraison est en route »", () => {
  it("porte le sujet du plan, la référence, l'adresse et « Il arrive bientôt. »", () => {
    const rendered = render();

    expect(rendered.subject).toBe("Votre livraison est en route");
    expect(rendered.html).toContain("ORD-4812");
    expect(rendered.html).toContain("12 rue des Lilas, 73150 Val d&#39;Isère");
    expect(rendered.html).toContain("Il arrive bientôt.");
    expect(rendered.html).not.toContain("dans la journée");
    expect(rendered.html).toContain("https://app.lfc.test/mes-commandes");
  });

  // Hugo, 2026-10-28 : « Livrée à » dit le créneau choisi à la commande, quand il y en a un.
  it("dit le créneau de la commande à la suite de l'adresse", () => {
    expect(render({ window: { start: "07:00", end: "09:00" } }).html).toContain(
      "12 rue des Lilas, 73150 Val d&#39;Isère, entre 07:00 et 09:00",
    );
    expect(render({ window: { start: null, end: "08:00" } }).html).toContain(
      "73150 Val d&#39;Isère, avant 08:00",
    );
  });

  it("ne dit ni le Labo, ni le recours de l'administrateur", () => {
    const { html } = render();

    expect(html).not.toContain("route de la Balme");
    expect(html).not.toContain("admin@lfc.test");
  });

  it("sans créneau, ne promet aucune heure et ne joint rien", () => {
    const rendered = render();

    expect(rendered.html).not.toMatch(/\d{1,2} ?h ?\d{2}/u);
    expect(rendered.attachments).toEqual([MAIL_LOGO_ATTACHMENT]); // le logo d'en-tête, et rien d'autre
  });

  it("sans adresse ni lien : ni ligne d'adresse, ni bouton", () => {
    const rendered = render({ addressLines: [], orderUrl: "" });

    expect(rendered.html).not.toContain("Livrée à");
    expect(rendered.html).not.toContain("Voir ma commande");
  });

  // Plan E7 reliquat, choix 17 : le reste qui part a son courriel.
  it("le reste en route dit « le reste de votre commande »", () => {
    const rendered = render({ remainder: true });

    expect(rendered.subject).toBe("Le reste de votre commande est en route");
    expect(rendered.html).toContain("parti avec le reste de votre commande");
    expect(rendered.html).toContain("ORD-4812");
  });

  it("sans reste, le courriel est celui d'avant", () => {
    expect(render({ remainder: false })).toEqual(render());
  });

  it("parle la langue demandée", () => {
    expect(render({ locale: "en" }).subject).toBe("Your delivery is on its way");
    expect(render({ locale: "it" }).subject).toBe("La sua consegna è in viaggio");
  });
});
