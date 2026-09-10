import type { CreditorSnapshot } from "../../creditor-snapshot.js";
import type { BillableCompany } from "../../ports/billable-orders.reader.js";
import { auditCsv } from "../pain008-audit.js";
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
  creditorIban: "FR7630006000011234567890189",
  preNotificationDays: 14,
};

const LINES: readonly BillableCompany[] = [
  { companyId: "c1", companyName: "SAS Les Tommeuses", orderCount: 8, totalCents: 151_648 },
  { companyId: "c2", companyName: "Boulangerie Émile & Fils", orderCount: 3, totalCents: 42_050 },
];

const XML = renderPain008({
  creditor: CREDITOR,
  cycleStart: new Date("2026-08-31T22:00:00.000Z"),
  cycleEnd: new Date("2026-09-30T22:00:00.000Z"),
  createdAt: new Date("2026-09-30T21:05:00.000Z"),
  lines: LINES,
});

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
    expect(csv).toContain('"IBAN-INCONNU"');
    expect(csv).not.toContain(CREDITOR.creditorIban);
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
    const xml = renderPain008({
      creditor: CREDITOR,
      cycleStart: new Date("2026-08-31T22:00:00.000Z"),
      cycleEnd: new Date("2026-09-30T22:00:00.000Z"),
      createdAt: new Date("2026-09-30T21:05:00.000Z"),
      lines: centimes,
    });
    const csv = auditCsv(xml);
    expect(csv).toContain("COHÉRENT");
    expect(csv).toContain(";0,01");
  });

  it("ne s'effondre pas sur un fichier vide de transactions", () => {
    const xml = renderPain008({
      creditor: CREDITOR,
      cycleStart: new Date("2026-08-31T22:00:00.000Z"),
      cycleEnd: new Date("2026-09-30T22:00:00.000Z"),
      createdAt: new Date("2026-09-30T21:05:00.000Z"),
      lines: [],
    });
    expect(auditCsv(xml)).toContain("COHÉRENT");
  });
});
