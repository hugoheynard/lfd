import { contentLocales } from "@lfd/contracts";
import { MAIL_LOCALES, startingMailDocument, validateMailDocument } from "@lfd/mail-blocks";

import { b2bMailTemplates, type B2bMails } from "../../mail-templates.js";
import { mailFollowsLocale, mailKeys, specimenDataOf } from "../../specimens/mail-specimens.js";
import { mailBlockDeclarationOf } from "../mail-block-declarations.js";
import { MAIL_LAYOUTS } from "../mail-layouts.js";

const REGISTRY = b2bMailTemplates({
  supportEmail: "admin@lfc.test",
  backOfficeUrl: "https://bo.test",
});

function renderedHtml<K extends keyof B2bMails>(mail: K): string {
  const render = REGISTRY[mail];
  return render(specimenDataOf(mail, "fr")).html;
}

const BRAND_OF_CHARTER = { lfc: "La Folie Coffee", lfd: "La Folie Douce", internal: null };
const BRANDS = ["La Folie Coffee", "La Folie Douce"];

/**
 * L'enseigne du bandeau d'en-tête (`layout-header.ts`), ou `null` sans marque.
 * Sans marque, le même gabarit de bandeau porte le surtitre : on ne retient
 * que les enseignes connues.
 */
function brandOf(html: string): string | null {
  const shown = /text-transform:uppercase;">([^<]+)<\/span>/u.exec(html)?.[1] ?? null;
  return BRANDS.find((brand) => brand === shown) ?? null;
}
const MAILS = mailKeys();

describe("les déclarations de l'éditeur par blocs (S4a)", () => {
  it("couvrent les 35 e-mails du registre", () => {
    expect(MAILS).toHaveLength(35);
    expect(new Set(MAILS)).toEqual(new Set(Object.keys(MAIL_LAYOUTS)));
  });

  it("parlent les langues de la vitrine, ni plus ni moins", () => {
    expect([...MAIL_LOCALES]).toEqual([...contentLocales]);
  });

  it.each(MAILS)("%s : ses langues sont celles dans lesquelles il part", (mail) => {
    const expected = mailFollowsLocale(mail) ? [...MAIL_LOCALES] : ["fr"];

    expect([...mailBlockDeclarationOf(mail).locales]).toEqual(expected);
  });

  it("21 e-mails partent en français seul", () => {
    const frenchOnly = MAILS.filter((mail) => mailBlockDeclarationOf(mail).locales.length === 1);

    expect(frenchOnly).toHaveLength(21);
  });

  it.each(MAILS)("%s : sa charte est celle de la coquille qui le rend", (mail) => {
    const charter = mailBlockDeclarationOf(mail).charter;

    expect(brandOf(renderedHtml(mail))).toBe(BRAND_OF_CHARTER[charter]);
  });

  it("quatre e-mails internes, sans marque", () => {
    const internal = MAILS.filter((mail) => mailBlockDeclarationOf(mail).charter === "internal");

    expect([...internal].sort()).toEqual([
      "ops.deploy-check",
      "staff.account-alert",
      "staff.appointment-booked",
      "staff.support-requested",
    ]);
  });

  it.each(MAILS)(
    "%s : ses blocs du modèle sont ses sections, lien secondaire rangé au bouton",
    (mail) => {
      const sections = MAIL_LAYOUTS[mail].sections.map((section) =>
        section.id === "secondaryLink" ? "cta" : section.id,
      );

      expect([...mailBlockDeclarationOf(mail).modelBlocks]).toEqual([...new Set(sections)]);
    },
  );

  it.each(MAILS)("%s : son document de départ passe les règles du serveur", (mail) => {
    const declaration = mailBlockDeclarationOf(mail);
    const document = startingMailDocument(mail, declaration);

    expect(validateMailDocument(document, declaration, mail)).toEqual([]);
  });

  it("le lien secondaire n'existe jamais sans son bouton", () => {
    const orphans = MAILS.filter((mail) => {
      const ids = MAIL_LAYOUTS[mail].sections.map((section) => section.id);
      return ids.includes("secondaryLink") && !ids.includes("cta");
    });

    expect(orphans).toEqual([]);
  });

  it.each(MAILS)("%s : déclare où mène son bouton si et seulement s'il en a un (§ 23)", (mail) => {
    const hasButton = MAIL_LAYOUTS[mail].sections.some((section) => section.id === "cta");
    const destination = mailBlockDeclarationOf(mail).ctaDestination;

    if (hasButton) {
      expect(destination?.trim()).toBeTruthy();
    } else {
      expect(destination).toBeUndefined();
    }
  });

  // Seize depuis `customer.marketing-confirm` (C1 du plan de désinscription, 2026-11-08),
  // dix-sept depuis `customer.order-revised` (2026-11-10).
  it("dix-sept e-mails ont un bouton du modèle", () => {
    const withButton = MAILS.filter(
      (mail) => mailBlockDeclarationOf(mail).ctaDestination !== undefined,
    );

    expect(withButton).toHaveLength(17);
  });
});
