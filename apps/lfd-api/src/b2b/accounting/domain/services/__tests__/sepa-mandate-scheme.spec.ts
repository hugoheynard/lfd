import type { CreditorSnapshot } from "../../creditor-snapshot.js";
import type { DebtorMandate } from "../../ports/debtor-mandate.reader.js";
import { SEPA_SCHEME } from "../../value-objects/sepa-scheme.js";
import { renderPain008 } from "../pain008.js";
import { renderSepaMandatePdf } from "../sepa-mandate-pdf.js";
import { SEPA_MANDATE_WORDING } from "../sepa-mandate-wording.js";
import { drawnText } from "./pdf-drawn-text.js";

const CREDITOR: CreditorSnapshot = {
  legalEntityId: "01JBQ0000000000000000000",
  name: "Crazeativity",
  legalForm: "SAS",
  siren: "900000001",
  vatNumber: "",
  rcs: "Chambéry",
  shareCapitalCents: 1_000_000,
  addressLines: ["Route de la Balme", "73150 Val d'Isère", "France"],
  ics: "FR00ZZZ900001",
  accountHolder: "CRAZEATIVITY",
  accountAddressLines: ["Route de la Balme", "73150 Val d'Isère", "FR"],
  creditorBic: "CEPAFRPP751",
  creditorIban: "FR7630006000011234567890189",
  preNotificationDays: 14,
  mandateContractDescription: "Fourniture de pains et viennoiseries",
  mandatePaymentType: "recurrent",
};

const RUM = "LFC-9P2X4B-260912-K7M3QT";

/**
 * Le texte dessiné, sans aucun blanc. `pdfkit` coupe les paragraphes en lignes
 * et l'extracteur les recolle sans séparateur : comparer sans les blancs est la
 * seule façon d'affirmer un paragraphe ENTIER sans dépendre de la largeur.
 */
function compact(text: string): string {
  return text.replace(/\s/gu, "");
}

function pain008For(creditor: CreditorSnapshot): string {
  return renderPain008({
    creditor,
    cycleStart: new Date("2026-08-31T22:00:00.000Z"),
    cycleEnd: new Date("2026-09-30T22:00:00.000Z"),
    createdAt: new Date("2026-09-30T21:05:00.000Z"),
    mandates: new Map<string, DebtorMandate>([
      ["cmp_1", { reference: RUM, iban: "FR7630004000031234567890143" }],
    ]),
    lines: [{ companyId: "cmp_1", companyName: "SAS Test", orderCount: 1, totalCents: 1_000 }],
  });
}

async function issuedText(): Promise<string> {
  return drawnText(await renderSepaMandatePdf(CREDITOR, null, null, { reference: RUM }));
}

async function sampleText(): Promise<string> {
  return drawnText(await renderSepaMandatePdf(CREDITOR, null));
}

/**
 * 🔴 Le lot déclarait `B2B` pendant que le formulaire imprimait le texte CORE,
 * et rien ne les obligeait à s'accorder (constaté le 2026-09-13). Ces tests
 * rendent LES DEUX documents et comparent ce qu'ils disent réellement : un
 * retour du `B2B` en dur dans le lot, ou d'un titre en dur dans le formulaire,
 * les fait diverger ici.
 */
describe("le lot et le mandat déclarent le MÊME schéma", () => {
  it("le `pain.008` écrit le schéma de la constante", () => {
    const xml = pain008For(CREDITOR);

    const declared = /<LclInstrm><Cd>([A-Z0-9]+)<\/Cd><\/LclInstrm>/u.exec(xml)?.[1];

    expect(declared).toBe(SEPA_SCHEME);
  });

  it("le mandat imprime le titre du schéma que le lot déclare", async () => {
    const wording = SEPA_MANDATE_WORDING[SEPA_SCHEME];

    expect(await issuedText()).toContain(wording.issuedTitle);
    expect(await sampleText()).toContain(wording.sampleTitle);
  });

  /**
   * L'ancre littérale : sans elle, le lot et le formulaire pourraient basculer
   * ENSEMBLE vers un schéma dont le texte serait faux, et les deux tests
   * ci-dessus resteraient verts. Changer de schéma doit faire rougir celui-ci —
   * c'est une décision de contrat bancaire, pas un réglage.
   */
  it("le schéma est l'interentreprises, tranché le 2026-09-14", () => {
    expect(SEPA_SCHEME).toBe("B2B");
  });
});

describe("renderSepaMandatePdf — le formulaire INTERENTREPRISES", () => {
  it("porte « interentreprises » dans le titre du mandat émis ET de l'exemplaire", async () => {
    expect(await issuedText()).toContain("MANDAT DE PRÉLÈVEMENT SEPA INTERENTREPRISES");
    expect(await sampleText()).toContain(
      "MANDAT SEPA INTERENTREPRISES (exemple - document non contractuel)",
    );
  });

  /**
   * Le paragraphe CORE retiré EN ENTIER : un texte à moitié CORE serait encore
   * un mandat qui promet un remboursement que le schéma du lot refuse.
   */
  it("ne contient plus rien du paragraphe CORE — ni 8 semaines, ni 13 mois", async () => {
    for (const text of [await issuedText(), await sampleText()]) {
      expect(text).not.toContain("8 semaines");
      expect(text).not.toContain("13 mois");
      expect(text).not.toContain("droit d'être remboursé");
      expect(text).not.toContain("demande de remboursement");
    }
  });

  /**
   * Instantané du texte d'autorisation, écrit EN CLAIR et non relu depuis la
   * constante : un test qui comparerait le rendu à la constante qu'il rend
   * resterait vert sur n'importe quel texte.
   */
  it("imprime le texte d'autorisation interentreprises complet", async () => {
    const text = compact(await issuedText());

    for (const paragraph of [
      "En signant ce formulaire de mandat, vous autorisez (A) (CRAZEATIVITY) à envoyer des " +
        "instructions à votre banque pour débiter votre compte, et (B) votre banque à " +
        "débiter votre compte conformément aux instructions de (CRAZEATIVITY).",
      "Ce mandat est destiné uniquement à des transactions interentreprises.",
      "Vous ne bénéficiez d'aucun droit à remboursement par votre banque une fois votre " +
        "compte débité, mais vous pouvez demander à votre banque de ne pas débiter " +
        "votre compte jusqu'au jour où le paiement est dû.",
    ]) {
      expect(text).toContain(compact(paragraph));
    }
  });

  it("dit au débiteur de déclarer le mandat à sa banque avant le premier prélèvement", async () => {
    const consigne =
      "Important : avant le premier prélèvement, déclarez ce mandat à votre " +
      "banque en lui communiquant la référence unique du mandat et l'identifiant du " +
      "créancier. Sans cette déclaration, votre banque refusera le prélèvement.";

    expect(compact(await issuedText())).toContain(compact(consigne));
    expect(compact(await sampleText())).toContain(compact(consigne));
  });

  /** Le paragraphe a grandi d'une ligne : le modèle tient en une page, et doit. */
  it("tient toujours sur UNE page", async () => {
    const pdf = await renderSepaMandatePdf(CREDITOR, null, null, { reference: RUM });

    expect(pdf.toString("latin1").match(/\/Type \/Page\b(?!s)/gu)).toHaveLength(1);
  });
});

/**
 * 🔴 Le lot écrivait `RCUR` en dur pendant que le formulaire cochait la zone 12
 * selon le réglage de l'entité : une entité réglée en ponctuel aurait fait
 * signer « Paiement ponctuel » et prélevé en récurrent (tranché par Hugo le
 * 2026-09-14). Les deux lisent désormais `mandatePaymentType`, et rien d'autre.
 *
 * ⚠️ La case cochée est DESSINÉE (deux traits), pas écrite : l'extracteur de
 * texte ne la voit pas. Ce qu'on éprouve côté formulaire, c'est que le réglage
 * change le document — et côté lot, la séquence exacte.
 */
describe("le lot et le mandat suivent le MÊME type de paiement", () => {
  const recurrent: CreditorSnapshot = { ...CREDITOR, mandatePaymentType: "recurrent" };
  const oneOff: CreditorSnapshot = { ...CREDITOR, mandatePaymentType: "one_off" };

  it("prélève en RCUR une entité réglée en récurrent", () => {
    const xml = pain008For(recurrent);

    expect(xml).toContain("<SeqTp>RCUR</SeqTp>");
    expect(xml).toContain("-RCUR</PmtInfId>");
    expect(xml).not.toContain("OOFF");
  });

  it("prélève en OOFF une entité réglée en ponctuel — et plus jamais en RCUR", () => {
    const xml = pain008For(oneOff);

    expect(xml).toContain("<SeqTp>OOFF</SeqTp>");
    expect(xml).toContain("-OOFF</PmtInfId>");
    expect(xml).not.toContain("RCUR");
  });

  it("le formulaire change avec le même réglage que le lot", async () => {
    const [recurrentPdf, oneOffPdf] = await Promise.all([
      renderSepaMandatePdf(recurrent, null),
      renderSepaMandatePdf(oneOff, null),
    ]);

    expect(recurrentPdf.equals(oneOffPdf)).toBe(false);
    // Et rien d'autre que ce réglage ne les distingue : deux rendus du même
    // réglage sont identiques octet pour octet.
    expect(recurrentPdf.equals(await renderSepaMandatePdf(recurrent, null))).toBe(true);
  });
});
