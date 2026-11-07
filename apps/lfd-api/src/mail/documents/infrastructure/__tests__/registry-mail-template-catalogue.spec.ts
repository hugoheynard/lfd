import { mailKeys } from "../../../templates/specimens/mail-specimens.js";
import { RegistryMailTemplateCatalogue } from "../registry-mail-template-catalogue.js";

/*
 * La sonde de déploiement est un contrôle technique (Hugo, 2026-11-07) : elle
 * part comme les autres, mais l'éditeur ne la liste pas et ne l'ouvre pas.
 */
describe("le registre des e-mails de l'éditeur", () => {
  const catalogue = new RegistryMailTemplateCatalogue();

  it("ne liste pas la sonde de déploiement, et liste tous les autres", () => {
    const listed = catalogue.list().map((entry) => entry.template);

    expect(listed).not.toContain("ops.deploy-check");
    expect(listed).toEqual(mailKeys().filter((mail) => mail !== "ops.deploy-check"));
  });

  it("ne trouve pas la sonde de déploiement — l'ouvrir est un 404 nommé", () => {
    expect(catalogue.find("ops.deploy-check")).toBeNull();
  });

  it("trouve un e-mail ordinaire", () => {
    expect(catalogue.find("customer.order-placed")?.template).toBe("customer.order-placed");
  });
});
