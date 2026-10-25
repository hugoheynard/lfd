import { MAIL_LOGO_ATTACHMENT } from "../mail-logo.js";
import { b2bMailTemplates } from "../mail-templates.js";
import { MAIL_CASES } from "./rendering-golden/mail-rendering.cases.js";

/*
 * « Avertir le client » (Supervision, 2026-10-25) : « Votre commande prend du
 * retard » — ce qu'il dit, et surtout l'heure qu'il ne promet pas. Et le
 * « Rappel au client », qui renvoie le courriel « prête » sous un autre
 * en-tête : « elle vous attend au point de retrait … ».
 */

const REGISTRY = b2bMailTemplates({
  supportEmail: "admin@lfc.test",
  backOfficeUrl: "https://bo.lfc.test",
});
const delayed = REGISTRY["customer.order-delayed"];

function render(overrides: Partial<Parameters<typeof delayed>[0]> = {}) {
  return delayed({
    reference: "ORD-4812",
    pickupLabel: "Le Labo",
    orderUrl: "https://app.lfc.test/mes-commandes",
    locale: "fr",
    ...overrides,
  });
}

describe("le courriel « votre commande prend du retard »", () => {
  it("porte le numéro dans l'objet, le point de retrait et la promesse du courriel « prête »", () => {
    const rendered = render();

    expect(rendered.subject).toBe("Votre commande ORD-4812 prend du retard");
    expect(rendered.html).toContain("Le Labo");
    expect(rendered.html).toContain("Nous vous écrirons dès qu&#39;elle le sera");
    expect(rendered.html).toContain("https://app.lfc.test/mes-commandes");
  });

  it("🔴 ne promet aucune heure et ne joint rien", () => {
    const rendered = render();

    expect(rendered.html).not.toMatch(/\d{1,2} ?h ?\d{2}/u);
    expect(rendered.attachments).toEqual([MAIL_LOGO_ATTACHMENT]);
  });

  it("sans point ni lien : ni ligne « À retirer », ni bouton", () => {
    const rendered = render({ pickupLabel: null, orderUrl: "" });

    expect(rendered.html).not.toContain("À retirer");
    expect(rendered.html).not.toContain("Voir ma commande");
  });

  it("parle la langue demandée", () => {
    expect(render({ locale: "en" }).subject).toBe("Your order ORD-4812 is running late");
    expect(render({ locale: "it" }).subject).toBe("Il suo ordine ORD-4812 è in ritardo");
  });
});

describe("le « Rappel au client »", () => {
  const ready = REGISTRY["customer.order-ready"];
  const pickup = MAIL_CASES["customer.order-ready"]["pickup"];

  it("ne dit plus « c'est prêt » : la commande attend au point de retrait", () => {
    if (pickup === undefined) {
      throw new Error("cas « pickup » manquant");
    }
    const rendered = ready({ ...pickup, reminder: true });

    expect(rendered.subject).toBe("Votre commande ORD-4812 vous attend");
    expect(rendered.html).toContain("Votre commande vous attend au point de retrait Le Labo.");
    expect(rendered.html).not.toContain("C&#39;est prêt.");
  });

  it("sans nom de point, ne laisse pas de « {site} » dans la boîte du client", () => {
    if (pickup === undefined) {
      throw new Error("cas « pickup » manquant");
    }
    const sheet = {
      ...pickup.sheet,
      fulfillment: { ...pickup.sheet.fulfillment, pickupLabel: null },
    };
    const rendered = ready({ ...pickup, sheet, reminder: true });

    expect(rendered.html).toContain("Votre commande vous attend au point de retrait.");
    expect(rendered.html).not.toContain("{site}");
  });

  it("l'annonce du colisage reste « c'est prêt »", () => {
    if (pickup === undefined) {
      throw new Error("cas « pickup » manquant");
    }
    expect(ready(pickup).subject).toBe("Votre commande ORD-4812 est prête");
  });
});
