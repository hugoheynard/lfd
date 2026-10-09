import { b2bMailTemplates } from "../mail-templates.js";

/*
 * L'invitation d'un client (2026-10-09) : le code e-mail d'abord, le mot de
 * passe en lien secondaire — et l'ancien e-mail quand la boutique n'a pas de
 * racine publique.
 */

const REGISTRY = b2bMailTemplates({
  supportEmail: "admin@lfc.test",
  backOfficeUrl: "https://bo.lfc.test",
});
const opened = REGISTRY["customer.access-opened"];

function render(overrides: Partial<Parameters<typeof opened>[0]> = {}) {
  return opened({
    firstName: "Camille",
    companyName: "Café des Halles",
    email: "camille@halles.fr",
    signInUrl: "https://boutique.lfc.test/connexion/code",
    passwordSetupUrl: "https://auth.lfc.test/ticket?t=abc",
    ...overrides,
  });
}

describe("le courriel d'invitation d'un client", () => {
  it("dit de se connecter avec l'adresse, par code, et propose le bouton vers la boutique", () => {
    const { subject, html } = render();

    expect(subject).toBe("Votre accès à l'espace pro Café des Halles");
    expect(html).toContain("Connectez-vous avec votre adresse camille@halles.fr");
    expect(html).toContain("vous recevrez un code par e-mail");
    expect(html).toContain('href="https://boutique.lfc.test/connexion/code"');
    expect(html).toContain("Me connecter");
  });

  it("garde le mot de passe en lien secondaire, après le bouton", () => {
    const { html } = render();

    expect(html).toContain("Ou choisissez un mot de passe");
    expect(html).toContain("https://auth.lfc.test/ticket?t=abc");
    expect(html.indexOf("Me connecter")).toBeLessThan(html.indexOf("Ou choisissez"));
    expect(html).not.toContain("Choisir mon mot de passe");
  });

  it("sans entrée par code, retombe sur le seul lien de mot de passe", () => {
    const { html } = render({ signInUrl: null });

    expect(html).toContain("Choisir mon mot de passe");
    expect(html).toContain("https://auth.lfc.test/ticket?t=abc");
    expect(html).not.toContain("Me connecter");
    expect(html).not.toContain("vous recevrez un code");
  });
});
