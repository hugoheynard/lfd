import { consentConfirmedPage, consentConfirmPage } from "../consent-confirm-page.js";

describe("la page de confirmation d'un accord — neutre (pas d'oracle)", () => {
  it.each(["fr", "en", "it"] as const)(
    "le GET poste vers lui-même, sans espace nommé (%s)",
    (locale) => {
      const page = consentConfirmPage(locale);
      expect(page).toContain('<form method="post">');
      expect(page).not.toContain("action=");
      expect(page).not.toContain("La Folie Coffee");
      expect(page).toContain(`lang="${locale}"`);
    },
  );

  it("la page de fin ne dit pas si le lien valait quelque chose", () => {
    expect(consentConfirmedPage("fr")).toContain("si ce lien était encore valable");
    expect(consentConfirmedPage("fr")).not.toContain("<form");
  });
});
