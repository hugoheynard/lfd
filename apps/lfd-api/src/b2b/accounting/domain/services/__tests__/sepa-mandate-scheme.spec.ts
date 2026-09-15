import type { CreditorSnapshot } from "../../creditor-snapshot.js";
import type { DebtorSnapshot } from "../../debtor-snapshot.js";
import type { MandatePaymentType } from "../../value-objects/mandate-defaults.js";
import type { SepaScheme } from "../../value-objects/sepa-scheme.js";
import { type MandateIssuance, renderSepaMandatePdf } from "../sepa-mandate-pdf.js";
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
  mandateScheme: "B2B",
};

const DEBTOR: DebtorSnapshot = {
  companyName: "SARL Refuge du Col",
  siren: "812456789",
  holder: "Refuge du Col SARL",
  addressLine1: "12 rue des Alpages",
  addressLine2: "",
  postalCode: "73150",
  city: "Val d'Isere",
  countryCode: "FR",
  iban: "FR1420041010050500013M02606",
  bic: "CEPAFRPP751",
  debtorReference: "CODE-RELEVE-77",
  contractNumber: "CT-42",
};

const RUM = "LFC-9P2X4B-260912-K7M3QT";
const SCHEMES: readonly SepaScheme[] = ["CORE", "B2B"];

/**
 * Le texte dessiné, sans aucun blanc. `pdfkit` coupe les paragraphes en lignes
 * et l'extracteur les recolle sans séparateur : comparer sans les blancs est la
 * seule façon d'affirmer un paragraphe ENTIER sans dépendre de la largeur.
 */
function compact(text: string): string {
  return text.replace(/\s/gu, "");
}

function render(
  scheme: SepaScheme,
  options: {
    readonly debtor?: DebtorSnapshot | null;
    readonly issuance?: MandateIssuance | null;
    readonly paymentType?: MandatePaymentType;
  } = {},
) {
  return renderSepaMandatePdf(
    { scheme, paymentType: options.paymentType ?? "recurrent" },
    CREDITOR,
    null,
    options.debtor ?? null,
    options.issuance ?? null,
  );
}

async function textOf(scheme: SepaScheme, issued = true): Promise<string> {
  return drawnText(
    await render(scheme, issued ? { debtor: DEBTOR, issuance: { reference: RUM } } : {}),
  );
}

/**
 * 🔴 Le schéma choisit le DOCUMENT depuis le 2026-09-15 : un mandat CORE promet
 * un remboursement de 8 semaines, un mandat interentreprises le refuse. Un papier
 * qui dirait l'un sous le titre de l'autre serait opposable contre nous — ces
 * instantanés sont écrits EN CLAIR, jamais relus depuis la constante qu'on rend.
 */
describe("renderSepaMandatePdf — chaque schéma dit SON texte", () => {
  it("CORE imprime la phrase (A)/(B) et le droit au remboursement, complets", async () => {
    const text = compact(await textOf("CORE"));

    for (const paragraph of [
      "MANDAT DE PRÉLÈVEMENT SEPA",
      "En signant ce formulaire de mandat, vous autorisez (A) (CRAZEATIVITY) à envoyer des " +
        "instructions à votre banque pour débiter votre compte, et (B) votre banque à " +
        "débiter votre compte conformément aux instructions de (CRAZEATIVITY).",
      "Vous bénéficiez du droit d'être remboursé par votre banque selon les conditions " +
        "décrites dans la convention que vous avez passée avec elle.",
      "Une demande de remboursement doit être présentée :",
      "- dans les 8 semaines suivant la date de débit de votre compte pour un prélèvement autorisé,",
      "- sans tarder et au plus tard dans les 13 mois en cas de prélèvement non autorisé.",
    ]) {
      expect(text).toContain(compact(paragraph));
    }
    expect(text).not.toContain("INTERENTREPRISES");
  });

  it("l'interentreprises imprime le texte du gabarit, au nom du créancier", async () => {
    const text = compact(await textOf("B2B"));

    for (const paragraph of [
      "MANDAT DE PRÉLÈVEMENT SEPA INTERENTREPRISES",
      "Vous devez compléter et signer ce mandat puis le transmettre à votre établissement " +
        "bancaire. Assurez-vous que votre établissement bancaire a enregistré la RUM " +
        "ci-dessous avant tout premier paiement sur le compte désigné.",
      "En signant ce formulaire de mandat, vous autorisez CRAZEATIVITY à envoyer des " +
        "instructions à votre banque pour débiter votre compte, et votre banque à débiter " +
        "votre compte conformément aux instructions de CRAZEATIVITY.",
      "Ce mandat est dédié aux prélèvements SEPA interentreprises. Vous n'êtes pas en droit " +
        "de demander à votre banque le remboursement d'un prélèvement SEPA interentreprises " +
        "une fois que le montant est débité de votre compte. Vous pouvez cependant demander " +
        "à votre banque de ne pas débiter votre compte jusqu'au jour de l'échéance.",
      "Veuillez obligatoirement compléter les champs marqués *.",
    ]) {
      expect(text).toContain(compact(paragraph));
    }
  });

  it("CORE contient « 8 semaines » et « 13 mois » ; l'interentreprises ni l'un ni l'autre", async () => {
    const [core, b2b] = [await textOf("CORE"), await textOf("B2B")];

    expect(core).toContain("8 semaines");
    expect(core).toContain("13 mois");
    for (const text of [b2b, await textOf("B2B", false)]) {
      expect(text).not.toContain("8 semaines");
      expect(text).not.toContain("13 mois");
      expect(text).not.toContain("droit d'être remboursé");
    }
  });

  it("l'interentreprises porte la mention RGPD au nom du créancier imprimé", async () => {
    expect(compact(await textOf("B2B"))).toContain(
      compact(
        "Les informations de ce mandat sont traitées par CRAZEATIVITY, responsable du " +
          "traitement, pour la gestion de vos prélèvements SEPA",
      ),
    );
    expect(await textOf("B2B")).toContain("CNIL");
  });
});

/**
 * Le gabarit est celui de la DGFiP : tout ce qui la désigne en est retiré, et
 * l'IBAN du créancier n'a pas plus sa place ici qu'en CORE.
 */
describe("renderSepaMandatePdf — l'interentreprises, adapté du gabarit DGFiP", () => {
  it("ne nomme ni la DGFiP, ni son service, ni la loi de 1978", async () => {
    for (const text of [await textOf("B2B"), await textOf("B2B", false)]) {
      expect(text).not.toContain("Direction Générale");
      expect(text.toUpperCase()).not.toContain("DGFIP");
      expect(text).not.toContain("service gestionnaire");
      expect(text).not.toContain("78-17");
    }
  });

  it("n'imprime JAMAIS l'IBAN du créancier — et imprime bien celui du débiteur", async () => {
    const text = compact(await textOf("B2B"));

    // La présence de l'IBAN débiteur prouve que l'extracteur lit les peignes.
    expect(text).toContain(DEBTOR.iban);
    expect(text).not.toContain(CREDITOR.creditorIban);
  });

  it("imprime le SIREN, la raison sociale du débiteur ET le titulaire du compte", async () => {
    const text = await textOf("B2B");

    expect(compact(text)).toContain("812456789");
    expect(text).toContain("SARL Refuge du Col");
    expect(text).toContain("Refuge du Col SARL");
  });

  /** Décision Q2 : le gabarit n'a pas de zones 14, 19, 20. */
  it("n'imprime ni le code débiteur, ni le numéro, ni la description du contrat", async () => {
    const text = await textOf("B2B");

    // Pas un fragment de la RUM : « C-9P2X4B » y figure, et le test passait faux.
    expect(text).not.toContain("CODE-RELEVE-77");
    expect(text).not.toContain("CT-42");
    expect(text).not.toContain("Fourniture de pains et viennoiseries");
    // Et CORE, lui, les imprime toujours.
    expect(await textOf("CORE")).toContain("CT-42");
  });

  it("écrit le type de paiement DU MANDAT en toutes lettres", async () => {
    const recurrent = drawnText(await render("B2B", { paymentType: "recurrent" }));
    const oneOff = drawnText(await render("B2B", { paymentType: "one_off" }));

    expect(recurrent).toContain("Paiement récurrent");
    expect(recurrent).not.toContain("Paiement ponctuel");
    expect(oneOff).toContain("Paiement ponctuel");
    expect(oneOff).not.toContain("Paiement récurrent");
  });

  it("imprime la RUM entière dans son peigne de 35 cases", async () => {
    const reference = `LFC-${"9".repeat(31)}`;

    expect(compact(drawnText(await render("B2B", { issuance: { reference } })))).toContain(
      reference,
    );
  });
});

describe.each(SCHEMES)("renderSepaMandatePdf — %s, ce qui vaut pour les deux", (scheme) => {
  it("tient sur UNE page, émis et débiteur rempli", async () => {
    const pdf = await render(scheme, { debtor: DEBTOR, issuance: { reference: RUM } });

    expect(pdf.toString("latin1").match(/\/Type \/Page\b(?!s)/gu)).toHaveLength(1);
  });

  /**
   * 🔴 Un seul paramètre commande la RUM et le filigrane : sans émission, la
   * mention EXEMPLE est là, avec ou sans débiteur ; avec, elle tombe.
   */
  it("porte le filigrane EXEMPLE sans émission, et le perd avec", async () => {
    expect(await textOf(scheme, false)).toContain("EXEMPLE");
    expect(drawnText(await render(scheme, { debtor: DEBTOR }))).toContain("EXEMPLE");
    expect(await textOf(scheme)).not.toContain("EXEMPLE");
  });

  it("rend les MÊMES octets deux fois sans émission", async () => {
    const [first, second] = await Promise.all([render(scheme), render(scheme)]);

    expect(first.equals(second)).toBe(true);
  });
});

it("les deux schémas ne rendent pas le même document", async () => {
  expect((await render("CORE")).equals(await render("B2B"))).toBe(false);
});
