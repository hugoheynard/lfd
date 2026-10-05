import { CSV_BOM, CSV_SEPARATOR, csvEuros, csvQuoted } from "./csv-cells.js";

/** Ce que le CSV de contrôle lit d'une ligne de lot. Jamais l'IBAN entier. */
export interface BatchCsvLine {
  readonly rank: number;
  readonly endToEndId: string;
  readonly debtorName: string;
  readonly debtorIbanLast4: string;
  readonly mandateReference: string;
  readonly sequence: string;
  readonly amountCents: number;
  readonly orderCount: number;
  readonly priorOrderCount: number;
  /** Les numéros des commandes prélevées par cette ligne. */
  readonly orderNumbers: readonly string[];
}

const HEADERS = [
  "Rang",
  "Référence de bout en bout",
  "Débiteur",
  "Compte du débiteur",
  "Référence du mandat",
  "Séquence",
  "Montant (€)",
  "Commandes",
  "Dont reprises",
  "Numéros de commande",
] as const;

/**
 * **Le contrôle d'un lot figé**, rendu depuis `collection_batch_line` (plan
 * §2) — et non relu du XML comme le contrôle de l'aperçu (`pain008-audit.ts`).
 *
 * ⚠️ Ce choix est celui du plan, et il change la nature du contrôle : il ne
 * TROUVE plus un défaut de rendu, il ATTESTE ce que le lot a figé — notamment
 * quelles commandes chaque ligne prélève, ce que le XML ne dit pas. La
 * cohérence du fichier stocké, elle, est tenue par son empreinte, vérifiée à
 * chaque téléchargement.
 */
export function batchAuditCsv(lines: readonly BatchCsvLine[]): string {
  const total = lines.reduce((sum, line) => sum + line.amountCents, 0);
  const rows = [
    HEADERS.map(csvQuoted).join(CSV_SEPARATOR),
    ...lines.map((line) =>
      [
        String(line.rank),
        csvQuoted(line.endToEndId),
        csvQuoted(line.debtorName),
        csvQuoted(`••••${line.debtorIbanLast4}`),
        csvQuoted(line.mandateReference),
        line.sequence,
        csvEuros(line.amountCents),
        String(line.orderCount),
        String(line.priorOrderCount),
        csvQuoted(line.orderNumbers.join(" ")),
      ].join(CSV_SEPARATOR),
    ),
    [
      "",
      "",
      csvQuoted("TOTAL"),
      "",
      "",
      "",
      csvEuros(total),
      String(lines.reduce((sum, line) => sum + line.orderCount, 0)),
      "",
      "",
    ].join(CSV_SEPARATOR),
  ];
  return `${CSV_BOM}${rows.join("\r\n")}\r\n`;
}
