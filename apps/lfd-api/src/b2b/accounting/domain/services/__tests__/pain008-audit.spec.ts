import type { CreditorSnapshot } from "../../creditor-snapshot.js";
import type { BillableCompany } from "../../ports/billable-orders.reader.js";
import type { DebtorMandate } from "../../ports/debtor-mandate.reader.js";
import { TEST_ID, generated } from "../../entities/__tests__/collection-test-fixtures.js";
import { auditCsv, isAuditCoherent } from "../pain008-audit.js";
import { renderPain008 } from "../pain008.js";

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
  collectionDaysAfterClosure: null,
  // Zones 20 et 12 du mandat. Le `pain.008` ne les lit pas — elles vivent sur le
  // papier, pas dans le lot — mais elles appartiennent au snapshot de l'émetteur,
  // donc la fixture les porte plutôt que de mentir sur sa forme.
  mandateContractDescription: "Fourniture de pains et viennoiseries",
  mandatePaymentType: "recurrent",
  mandateScheme: "B2B",
};

const LINES: readonly BillableCompany[] = [
  { companyId: "c1", companyName: "SAS Les Tommeuses", orderCount: 8, totalCents: 151_648 },
  { companyId: "c2", companyName: "Boulangerie Émile & Fils", orderCount: 3, totalCents: 42_050 },
];

const DEBTOR_IBAN = "FR7630004000031234567890143";

/** Deux mandats B2B : le lot n'écrit une ligne que pour une société mandatée. */
const MANDATES = new Map<string, DebtorMandate>([
  [
    "c1",
    {
      reference: "RUM-C1",
      iban: DEBTOR_IBAN,
      bic: null,
      scheme: "B2B",
      paymentType: "recurrent",
      signedAt: new Date("2026-03-02T09:00:00.000Z"),
    },
  ],
  [
    "c2",
    {
      reference: "RUM-C2",
      iban: "FR7612548029980123456789161",
      bic: null,
      scheme: "B2B",
      paymentType: "one_off",
      signedAt: new Date("2026-04-20T09:00:00.000Z"),
    },
  ],
]);

function renderB2b(lines: readonly BillableCompany[]): string {
  return renderPain008({
    creditor: CREDITOR,
    scheme: "B2B",
    cycleStart: new Date("2026-08-31T22:00:00.000Z"),
    cycleEnd: new Date("2026-09-30T22:00:00.000Z"),
    createdAt: new Date("2026-09-30T21:05:00.000Z"),
    mandates: MANDATES,
    lines,
  });
}

const XML = renderB2b(LINES);

describe("auditCsv — ce qu'il lit dans le fichier", () => {
  it("rend une ligne par transaction, montants en virgule décimale", () => {
    const csv = auditCsv(XML);
    expect(csv).toContain('"SAS Les Tommeuses"');
    expect(csv).toContain(";1516,48");
    expect(csv).toContain(";420,50");
  });

  /**
   * 🔴 Le piège du découpage. Cherchées globalement, les balises `IBAN` du
   * créancier et du débiteur tomberaient dans la même liste, et toutes les
   * colonnes se décaleraient d'un cran sans que rien ne le dise. Le lecteur
   * découpe donc par `DrctDbtTxInf` d'abord.
   */
  it("lit l'IBAN du DÉBITEUR, jamais celui du créancier", () => {
    const csv = auditCsv(XML);
    expect(csv).toContain(`"••••${DEBTOR_IBAN.slice(-4)}"`);
    expect(csv).not.toContain(`••••${CREDITOR.creditorIban.slice(-4)}`);
  });

  /**
   * Régression : le CSV sortait l'IBAN du débiteur EN CLAIR jusqu'au
   * 2026-09-12, alors que la même donnée est scellée en base. Un fichier qui
   * recompose ce que le coffre scelle le défait par la porte de service.
   */
  it("masque l'IBAN du débiteur — jamais en clair dans un fichier qui circule", () => {
    const csv = auditCsv(XML);
    expect(csv).not.toContain(DEBTOR_IBAN);
    expect(csv).toContain("••••0143");
  });

  /**
   * Le pendant du précédent : une sentinelle masquée deviendrait `••••ONNU`,
   * c'est-à-dire un compte d'apparence normale là où le fichier dit qu'il n'en
   * a pas. Le masque ne s'applique qu'à ce qui a la forme d'un IBAN.
   */
  it("ne masque PAS la sentinelle du lot non branché", () => {
    const sentinel = XML.replace(`<IBAN>${DEBTOR_IBAN}</IBAN>`, "<IBAN>IBAN-INCONNU</IBAN>");
    expect(auditCsv(sentinel)).toContain('"IBAN-INCONNU"');
  });

  /**
   * Un cycle rend deux fichiers depuis le 2026-09-15 : le contrôle dit, ligne par
   * ligne, sous quel schéma le fichier la présente — lu sur le bloc, pas supposé.
   */
  it("dit le schéma de chaque ligne, lu dans le LclInstrm de son bloc", () => {
    const rows = auditCsv(XML).split("\r\n");

    // Les en-têtes ne sont pas cités, les valeurs si.
    expect(rows[0]).toMatch(/;Schéma$/u);
    expect(rows[1]).toMatch(/;"B2B"$/u);
    expect(rows[2]).toMatch(/;"B2B"$/u);
    expect(auditCsv(XML.replaceAll("<Cd>B2B</Cd>", "<Cd>CORE</Cd>"))).toContain(';"CORE"');
  });

  /**
   * `DtOfSgntr` entre dans `MndtRltdInf` le 2026-09-15, juste après `MndtId`. Le
   * lecteur cherche chaque balise par son nom exact : la date ne doit ni prendre
   * la place de la RUM, ni apparaître dans une colonne, ni décaler les montants.
   */
  it("ne lit pas la date de signature comme une autre colonne", () => {
    expect(XML).toContain("<DtOfSgntr>2026-03-02</DtOfSgntr>");
    const rows = auditCsv(XML).split("\r\n");

    expect(rows[0]?.split(";")).toHaveLength(7);
    expect(rows[1]).toMatch(/;"RUM-C1";1516,48;"B2B"$/u);
    expect(rows[2]).toMatch(/;"RUM-C2";420,50;"B2B"$/u);
    expect(auditCsv(XML)).not.toContain("2026-03-02");
  });

  it("s'ouvre par un BOM et se termine par des CRLF — sinon le tableur ment", () => {
    const csv = auditCsv(XML);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("\r\n");
  });
});

describe("auditCsv — ce qu'il CONTRÔLE", () => {
  it("dit COHÉRENT quand le fichier somme juste", () => {
    const csv = auditCsv(XML);
    expect(csv).toContain("1936,98");
    expect(csv).toContain("COHÉRENT");
    expect(csv).not.toContain("INCOHÉRENT");
  });

  /**
   * 🔴 **Le test qui décide si cet outil sert à quelque chose.** Un contrôle qui
   * ne rougit jamais n'est pas un contrôle. On abîme le fichier exactement comme
   * un rendu fautif le ferait — un `CtrlSum` qui ne somme plus les lignes — et
   * le CSV doit le voir.
   *
   * C'est aussi pourquoi ce module RELIT le XML au lieu de recalculer depuis
   * l'assiette : recalculé, il aurait retrouvé le bon total et attesté une
   * erreur au lieu de la trouver.
   */
  it("dit INCOHÉRENT quand le total déclaré ne somme plus les lignes", () => {
    const abime = XML.replace("<CtrlSum>1936.98</CtrlSum>", "<CtrlSum>1936.99</CtrlSum>");
    const csv = auditCsv(abime);

    expect(csv).toContain("INCOHÉRENT");
    expect(csv).toContain("ne pas déposer");
    // L'écart est NOMMÉ, pas seulement signalé : un centime, et on sait lequel.
    // Les valeurs de contrôle sont citées, contrairement aux montants de ligne.
    expect(csv).toContain('"Écart";;;;"0,01"');
  });

  it("dit INCOHÉRENT quand une ligne a disparu du lot", () => {
    const ampute = XML.replace(/ {6}<DrctDbtTxInf>[\s\S]*?<\/DrctDbtTxInf>\n/u, "");
    expect(auditCsv(ampute)).toContain("INCOHÉRENT");
  });

  /**
   * `Number("1516.48") * 100` vaut `151647.99999999999`. Un centime d'écart est
   * précisément ce que ce fichier existe pour détecter — le lire par un
   * flottant en inventerait un à chaque ligne.
   */
  it("ne perd pas un centime en relisant les montants", () => {
    const centimes: readonly BillableCompany[] = [
      { companyId: "c1", companyName: "A", orderCount: 1, totalCents: 151_648 },
      { companyId: "c2", companyName: "B", orderCount: 1, totalCents: 1 },
    ];
    const xml = renderB2b(centimes);
    const csv = auditCsv(xml);
    expect(csv).toContain("COHÉRENT");
    expect(csv).toContain(";0,01");
  });

  it("ne s'effondre pas sur un fichier vide de transactions", () => {
    const xml = renderB2b([]);
    expect(auditCsv(xml)).toContain("COHÉRENT");
  });
});

describe("le contrôle d'un prélèvement d'essai (plan `plan-prelevement-d-essai.md`)", () => {
  it.each(["RCUR", "FRST"] as const)(
    "relit un essai %s : une ligne, ESS-, COHÉRENT",
    (sequence) => {
      const xml = generated({ sequence, amountCents: 42 }).toPersistence().xml;
      const csv = auditCsv(xml);

      expect(csv).toContain(`"ESS-${TEST_ID}"`);
      expect(csv).toContain("COHÉRENT");
      expect(isAuditCoherent(xml)).toBe(true);
    },
  );

  it("un total déclaré faux rend le verdict incohérent", () => {
    const xml = generated({ amountCents: 42 }).toPersistence().xml;

    expect(isAuditCoherent(xml.replace("<CtrlSum>0.42</CtrlSum>", "<CtrlSum>0.43</CtrlSum>"))).toBe(
      false,
    );
  });
});

describe("auditCsv — un montant illisible", () => {
  /**
   * Régression (2026-10-23) : `centsOf` rendait 0 pour un montant mal formé.
   * La ligne disparaissait de la somme sans un mot, et un `CtrlSum` illisible
   * devant un lot dont les lignes l'étaient aussi se lisait « COHÉRENT ».
   */
  it("nomme le champ et la valeur d'un InstdAmt illisible, et refuse le dépôt", () => {
    const abime = XML.replace(
      '<InstdAmt Ccy="EUR">1516.48</InstdAmt>',
      '<InstdAmt Ccy="EUR">1516,48</InstdAmt>',
    );
    const csv = auditCsv(abime);

    expect(csv).toMatch(/"🔴 Montant illisible";;;;"InstdAmt de la ligne [^"]+ : « 1516,48 »"/u);
    expect(csv).toContain("ILLISIBLE « 1516,48 »");
    expect(csv).toContain("ne pas déposer");
    expect(isAuditCoherent(abime)).toBe(false);
  });

  it("nomme un CtrlSum illisible, même quand rien ne somme", () => {
    const abime = XML.replace("<CtrlSum>1936.98</CtrlSum>", "<CtrlSum>abc</CtrlSum>");
    const csv = auditCsv(abime);

    expect(csv).toContain("CtrlSum : « abc »");
    expect(csv).toContain("INCOHÉRENT");
    expect(isAuditCoherent(abime)).toBe(false);
  });

  it("un lot dont TOUS les montants sont illisibles n'est pas cohérent à zéro", () => {
    const tout = XML.replace(
      /<InstdAmt Ccy="EUR">[^<]*<\/InstdAmt>/gu,
      '<InstdAmt Ccy="EUR">x</InstdAmt>',
    ).replace("<CtrlSum>1936.98</CtrlSum>", "<CtrlSum>y</CtrlSum>");

    expect(isAuditCoherent(tout)).toBe(false);
    expect(auditCsv(tout)).toContain("INCOHÉRENT");
  });
});
