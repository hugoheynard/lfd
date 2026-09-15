import { b2bMailTemplates } from "../mail-templates.js";
import type { MandateMailScheme } from "../mandate-to-sign-wording.js";

/**
 * Le courriel qui porte le mandat à signer. Il doit dire le MÊME schéma que le
 * papier qu'il joint : un courriel « interentreprises » sur un formulaire qui
 * dirait autre chose ferait douter du papier — et c'est le papier qui fait foi.
 */

const REGISTRY = b2bMailTemplates({
  supportEmail: "admin@lfc.test",
  backOfficeUrl: "https://bo.lfc.test",
});

const RUM = "LFC-9P2X4B-260912-K7M3QT";

function render(
  scheme: MandateMailScheme,
): ReturnType<(typeof REGISTRY)["customer.mandate-to-sign"]> {
  return REGISTRY["customer.mandate-to-sign"]({
    scheme,
    companyName: "Refuge du Col",
    reference: RUM,
    creditorIdentifier: "FR00ZZZ900001",
    creditorName: "CRAZEATIVITY",
    pdfBase64: "JVBERi0=",
    fileName: `mandat-${RUM}.pdf`,
  });
}

describe("customer.mandate-to-sign — le vocabulaire interentreprises", () => {
  it("nomme le mandat interentreprises dans l'objet, avec sa RUM", () => {
    expect(render("B2B").subject).toBe(
      `Votre mandat de prélèvement SEPA interentreprises — ${RUM}`,
    );
  });

  it("nomme le mandat interentreprises dans le titre et le corps", () => {
    const { html } = render("B2B");

    expect(html).toContain("Votre mandat de prélèvement SEPA interentreprises à signer");
    expect(html).toContain("le mandat de prélèvement SEPA interentreprises établi pour");
  });

  it("dit qu'aucun remboursement n'est possible une fois le compte débité", () => {
    expect(render("B2B").html).toContain(
      "ne donne droit à aucun remboursement une fois votre compte débité",
    );
  });

  /**
   * 🔴 L'étape sans laquelle le premier prélèvement est refusé par la banque du
   * débiteur. L'apostrophe sort échappée (`&#39;`) du gabarit : on vise un
   * morceau qui n'en porte pas plutôt que de recopier l'échappement.
   */
  it("demande de déclarer le mandat à sa banque avant le premier prélèvement", () => {
    const { html } = render("B2B");

    expect(html).toContain("Avant le premier prélèvement, déclarez-le à votre banque");
    expect(html).toContain("sans cette déclaration, votre banque refusera le prélèvement");
  });

  it("ne parle plus d'aucun délai de remboursement CORE", () => {
    const { html } = render("B2B");

    expect(html).not.toContain("8 semaines");
    expect(html).not.toContain("13 mois");
  });

  it("joint le PDF du mandat", () => {
    expect(render("B2B").attachments).toEqual([
      { filename: `mandat-${RUM}.pdf`, contentBase64: "JVBERi0=", contentType: "application/pdf" },
    ]);
  });
});

/**
 * Plan mandat deux schémas §3.5 : un mandat CORE ne se déclare pas à la banque
 * et ouvre un droit au remboursement. Lui écrire le contraire ferait faire au
 * client une démarche inutile, et lui cacherait un droit qu'il a.
 */
describe("customer.mandate-to-sign — le vocabulaire CORE", () => {
  it("nomme un mandat de prélèvement SEPA dans l'objet, sans « interentreprises »", () => {
    const { subject } = render("CORE");

    expect(subject).toBe(`Votre mandat de prélèvement SEPA — ${RUM}`);
  });

  it("ne dit « interentreprises » nulle part", () => {
    const { subject, html } = render("CORE");

    expect(subject).not.toContain("interentreprises");
    expect(html).not.toContain("interentreprises");
    expect(html).toContain("Votre mandat de prélèvement SEPA à signer");
  });

  it("ne refuse aucun remboursement, et nomme le délai de 8 semaines", () => {
    const { html } = render("CORE");

    expect(html).not.toContain("aucun remboursement");
    expect(html).toContain("dans les 8 semaines suivant la date de débit");
  });

  it("ne demande aucune déclaration à la banque", () => {
    const { html } = render("CORE");

    expect(html).not.toContain("déclarez-le à votre banque");
    expect(html).not.toContain("sans cette déclaration");
  });

  it("joint le même PDF", () => {
    expect(render("CORE").attachments).toEqual(render("B2B").attachments);
  });
});
