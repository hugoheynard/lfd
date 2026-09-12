/**
 * **Le contrôle du lot** — un CSV lu DEPUIS le fichier XML, jamais à côté.
 *
 * ## Pourquoi il relit le fichier au lieu de recalculer
 *
 * C'est toute sa valeur, et c'est fragile à préserver. Produire ce CSV à partir
 * des mêmes commandes que le XML donnerait **deux calculs parallèles** : ils
 * pourraient être faux tous les deux et s'accorder, et le contrôle attesterait
 * une erreur au lieu de la trouver.
 *
 * En relisant le XML, le CSV atteste ce que le fichier **contient réellement**.
 * Si le rendu se trompe — un montant mal formaté, une ligne oubliée, un
 * `CtrlSum` qui ne somme pas — l'écart apparaît ici.
 *
 * 🔴 Ne jamais « simplifier » ce module en lui passant les lignes de l'assiette.
 * Il deviendrait une seconde vue de la même erreur.
 *
 * ## Ce qu'il contrôle vraiment
 *
 * Deux totaux que le fichier **déclare** — `NbOfTxs` et `CtrlSum` — confrontés à
 * ce qu'on obtient en **comptant et sommant les lignes**. Ce sont les deux
 * champs dont un écart d'un centime fait rejeter le message entier par la
 * banque, et ils sont écrits par le rendu à un endroit différent des lignes :
 * c'est exactement le genre de couple qui dérive.
 *
 * ## Ce qu'il n'est PAS
 *
 * Ni un analyseur XML général, ni un validateur de schéma. Il lit les quelques
 * balises de CE message, par leur nom, en tolérant la mise en forme. Il ne dira
 * pas si le fichier est accepté par la banque — seul le portail le dira.
 */

const SEPARATOR = ";";

/**
 * Le BOM UTF-8, en séquence d'échappement et non en caractère.
 *
 * ⚠️ Écrit au naturel, il est **invisible à la relecture** — et rien ne l'attrape :
 * ni le typecheck, ni `no-irregular-whitespace` d'ESLint, qui ne le considère
 * pas comme une espace irrégulière à cette position. Un éditeur ou un outil de
 * normalisation peut alors le manger sans qu'un diff le montre, et le CSV
 * s'ouvre en Latin-1 chez le comptable. Constaté deux fois dans ce dépôt, dont
 * une le 2026-09-10 en écrivant CE fichier.
 */
const BOM = "\uFEFF";

const HEADERS = [
  "Rang",
  "Référence de bout en bout",
  "Débiteur",
  "IBAN du débiteur",
  "Référence du mandat",
  "Montant (€)",
] as const;

interface AuditedLine {
  readonly endToEndId: string;
  readonly debtor: string;
  readonly iban: string;
  readonly mandate: string;
  /** En centimes, reconverti depuis le texte du fichier. */
  readonly cents: number;
}

/** Rend le CSV de contrôle d'un `pain.008`. */
export function auditCsv(xml: string): string {
  const lines = readLines(xml);
  const summed = lines.reduce((total, line) => total + line.cents, 0);
  const declaredSum = declaredCents(xml);
  const declaredCount = declaredNumber(xml);

  const rows = [
    HEADERS.join(SEPARATOR),
    ...lines.map((line, rank) =>
      [
        String(rank + 1),
        quoted(line.endToEndId),
        quoted(line.debtor),
        quoted(line.iban),
        quoted(line.mandate),
        euros(line.cents),
      ].join(SEPARATOR),
    ),
    // Une ligne vide sépare les lignes du lot de son contrôle : un tableur
    // cesse alors de les trier ensemble, ce qui mélangerait les deux natures.
    "",
    control("Somme des lignes", euros(summed)),
    control("Total déclaré par le fichier (CtrlSum)", euros(declaredSum)),
    control("Écart", euros(declaredSum - summed)),
    control("Lignes comptées", String(lines.length)),
    control("Nombre déclaré par le fichier (NbOfTxs)", String(declaredCount)),
    // Le verdict en toutes lettres : on ne demande pas à un lecteur pressé de
    // comparer deux nombres au milieu d'un tableau.
    control(
      "Verdict",
      declaredSum === summed && declaredCount === lines.length
        ? "COHÉRENT"
        : "🔴 INCOHÉRENT — ne pas déposer",
    ),
  ];
  return BOM + rows.join("\r\n") + "\r\n";
}

function control(label: string, value: string): string {
  return ["", quoted(label), "", "", "", quoted(value)].join(SEPARATOR);
}

/**
 * Les lignes du lot, relues dans le XML.
 *
 * Le découpage se fait sur `DrctDbtTxInf` plutôt que sur chaque balise
 * séparément : cherchées globalement, un `IBAN` créancier et un `IBAN` débiteur
 * se retrouveraient dans la même liste, et les colonnes se décaleraient d'un
 * cran sans que rien ne le dise.
 */
function readLines(xml: string): readonly AuditedLine[] {
  return [...xml.matchAll(/<DrctDbtTxInf>([\s\S]*?)<\/DrctDbtTxInf>/gu)].map((match) => {
    const block = match[1] ?? "";
    return {
      endToEndId: tag(block, "EndToEndId"),
      debtor: tag(block, "Nm"),
      iban: tag(block, "IBAN"),
      mandate: tag(block, "MndtId"),
      cents: centsOf(tag(block, "InstdAmt")),
    };
  });
}

/** `<CtrlSum>` du **groupe**, c'est-à-dire le premier : c'est celui du message. */
function declaredCents(xml: string): number {
  return centsOf(tag(xml, "CtrlSum"));
}

function declaredNumber(xml: string): number {
  const raw = Number(tag(xml, "NbOfTxs"));
  return Number.isFinite(raw) ? raw : 0;
}

/** Le contenu de la première balise de ce nom, attributs tolérés. */
function tag(xml: string, name: string): string {
  return new RegExp(`<${name}(?:\\s[^>]*)?>([^<]*)</${name}>`, "u").exec(xml)?.[1]?.trim() ?? "";
}

/**
 * `1516.48` → `151648`. Point décimal, parce que c'est ce que la norme écrit.
 *
 * Passe par les chiffres du texte plutôt que par `Number` × 100 : le flottant
 * transformerait `1516.48` en `151647.99999999999`, et un centime d'écart est
 * exactement ce que ce fichier existe pour détecter.
 */
function centsOf(amount: string): number {
  const matched = /^(-?)(\d+)(?:\.(\d{1,2}))?$/u.exec(amount);
  if (matched === null) {
    return 0;
  }
  const sign = matched[1] === "-" ? -1 : 1;
  const units = Number(matched[2]);
  const decimals = Number((matched[3] ?? "").padEnd(2, "0"));
  return sign * (units * 100 + decimals);
}

/** Centimes → `1 516,48`, virgule décimale et sans symbole : le tableur somme. */
function euros(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  return `${sign}${String(Math.trunc(absolute / 100))},${String(absolute % 100).padStart(2, "0")}`;
}

/**
 * Tout est cité, y compris ce qui n'en a pas besoin.
 *
 * Une référence de mandat peut contenir le `;` du jeu SEPA ? Non — mais une
 * raison sociale, oui, et un tableur décalerait alors toute la ligne. Citer
 * partout coûte deux caractères et supprime la question.
 */
function quoted(value: string): string {
  return `"${value.replace(/"/gu, '""')}"`;
}
