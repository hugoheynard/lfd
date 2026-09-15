import { renderSepaMandatePdf } from "../sepa-mandate-pdf.js";
import { MandateFieldTooLongError } from "../../errors/accounting-errors.js";
import type { CreditorSnapshot } from "../../creditor-snapshot.js";

const CREDITOR: CreditorSnapshot = {
  legalEntityId: "ent_1",
  name: "Crazeativity",
  legalForm: "SAS",
  siren: "900000001",
  vatNumber: "",
  rcs: "Chambéry",
  shareCapitalCents: 1_000_000,
  addressLines: ["Route de la Balme", "73150 Val d'Isère", "France"],
  ics: "FR00ZZZ900001",
  creditorIban: "FR7630006000011234567890189",
  creditorBic: "CEPAFRPP751",
  accountHolder: "CRAZEATIVITY",
  accountAddressLines: ["Route de la Balme", "73150 Val d'Isère", "FR"],
  preNotificationDays: 14,
  mandateContractDescription: "Fourniture de pains",
  mandatePaymentType: "recurrent",
  mandateScheme: "B2B",
};

const CORE = { scheme: "CORE", paymentType: "recurrent" } as const;
const B2B = { scheme: "B2B", paymentType: "recurrent" } as const;

const RUM = "LFC-9P2X4B-260912-K7M3QT";

/**
 * Ces tests portent sur ce qui est observable SANS décompresser le PDF : les
 * métadonnées, la taille, et le refus. Le texte dessiné, lui, se lit avec
 * `pdf-drawn-text.ts` (depuis le 2026-09-14) — c'est `sepa-mandate-scheme.spec.ts`
 * qui l'éprouve. Ce que le peigne dessine au pixel s'éprouve toujours à l'œil.
 */
describe("renderSepaMandatePdf — l'émission", () => {
  it("nomme le document par sa RUM dans ses métadonnées", async () => {
    const pdf = await renderSepaMandatePdf(CORE, CREDITOR, null, null, { reference: RUM });

    expect(pdf.toString("latin1")).toContain(RUM);
  });

  it("reste un EXEMPLE sans référence", async () => {
    const pdf = await renderSepaMandatePdf(CORE, CREDITOR, null, null, null);

    expect(pdf.toString("latin1")).toContain("exemple");
  });

  /**
   * 🔴 L'invariant de tout ce chantier : le filigrane et la RUM sont liés par
   * construction — un seul paramètre les commande, donc il est INEXPRIMABLE de
   * retirer l'avertissement sans donner de référence, c'est-à-dire de produire
   * le seul document dangereux que ce rendu puisse fabriquer.
   *
   * Ce niveau ne peut pas lire le filigrane : pdfkit compresse ses flux. Ce
   * qu'il éprouve, c'est que les deux rendus DIFFÈRENT et que le sous-titre
   * « exemple » ne survit pas à l'émission — la trace observable de la bascule.
   */
  it("produit un document différent, sans la mention « exemple »", async () => {
    const [vierge, emis] = await Promise.all([
      renderSepaMandatePdf(CORE, CREDITOR, null, null, null),
      renderSepaMandatePdf(CORE, CREDITOR, null, null, { reference: RUM }),
    ]);

    expect(emis.equals(vierge)).toBe(false);
    expect(emis.toString("latin1")).not.toContain("exemple");
  });

  /**
   * Le peigne du mandat CORE fait 26 cases. Une RUM plus longue serait tronquée
   * en SILENCE par le dessin — donc imprimée fausse sur un papier signé.
   */
  it("CORE refuse une référence qui déborde de ses 26 cases, plutôt que de la tronquer", async () => {
    await expect(
      renderSepaMandatePdf(CORE, CREDITOR, null, null, { reference: "X".repeat(27) }),
    ).rejects.toThrow(MandateFieldTooLongError);
  });

  /** Le gabarit interentreprises a 35 cases : la borne EPC d'une RUM. */
  it("l'interentreprises accepte 35 caractères et refuse le 36e", async () => {
    await expect(
      renderSepaMandatePdf(B2B, CREDITOR, null, null, { reference: "X".repeat(35) }),
    ).resolves.toBeDefined();
    await expect(
      renderSepaMandatePdf(B2B, CREDITOR, null, null, { reference: "X".repeat(36) }),
    ).rejects.toThrow(MandateFieldTooLongError);
  });
});
