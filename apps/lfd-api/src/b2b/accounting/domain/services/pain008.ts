import type { CreditorSnapshot } from "../creditor-snapshot.js";
import type { SepaScheme } from "../value-objects/sepa-scheme.js";
import type { DebtorMandate } from "../ports/debtor-mandate.reader.js";
import type { BillableCompany } from "../ports/billable-orders.reader.js";
import {
  SEQUENCE_ORDER,
  commentSafe,
  cyclePeriod,
  cycleTagOf,
  renderPain008Document,
  sequenceTypeOf,
  type DocumentDebit,
} from "./pain008-document.js";

/**
 * **Le `pain.008`** — le message ISO 20022 qui demande les prélèvements.
 *
 * C'est le fichier qu'on dépose au portail de la banque, et la seule pièce du
 * système dont une erreur se paie en argent réel plutôt qu'en écran faux. Le
 * format, ses pièges et les questions encore ouvertes vivent dans
 * [`prelevement-sepa.md`](../../../../../../documentation/comptabilite/prelevement-sepa.md).
 *
 * ## UN FICHIER PAR SCHÉMA — 2026-09-15
 *
 * Le schéma n'est plus une constante : chaque mandat fige le sien à la frappe
 * (plan `documentation/comptabilite/plan-mandat-deux-schemas.md`, §10.2). Un cycle rend
 * donc un fichier `CORE` et un fichier `B2B`, et chacun ne porte QUE les lignes
 * dont le mandat a ce schéma. Mélanger les deux dans un message ferait rejeter
 * le tout par la banque du débiteur qui n'a rien déclaré.
 *
 * 🔴 **Le caractère déposable se calcule sur TOUT le cycle, avant la découpe.**
 * Une société sans mandat actif n'a pas de schéma, donc n'appartient à aucun
 * fichier : calculé par fichier, chacun des deux se serait dit complet en
 * l'omettant en silence. Elle retire le caractère déposable des deux, et le
 * bandeau de chacun la NOMME (objection 3 de vitruve).
 *
 * ## La séquence suit le TYPE DE PAIEMENT DU MANDAT
 *
 * `RCUR` pour un mandat `recurrent`, `OOFF` pour un `one_off` — la case cochée
 * sur SON papier, figée à la frappe, et non le réglage courant de l'entité : un
 * réglage changé après signature ferait prélever sous un régime que le papier
 * n'autorise pas. Un `PmtInf` par séquence présente : la norme veut un bloc par
 * couple (séquence, date), et un bloc mélangé se fait rejeter en entier.
 *
 * ⚠️ **Pas de `FRST`.** Le CFONB le recommande après un changement d'IBAN, avec
 * `OrgnlDbtrAgt = SMNDA` si la banque change ; nous ne gardons pas l'historique
 * des comptes que cela demande. Un mandat ponctuel ne sert qu'à UN débit, et
 * rien ici ne refuse le second (`todo-mandat-core-contre-b2b.md`).
 *
 * ## Déterministe
 *
 * Aucune horloge lue ici : l'instant de création est donné. Deux rendus des
 * mêmes entrées donnent le même fichier, ce qui le rend comparable en test.
 *
 * ## 🔴 C'est l'APERÇU, non déposable par nature (2026-10-05)
 *
 * Ce module rend le cycle EN COURS, recalculé à chaque appel, avec des
 * identifiants tirés du cycle. Le fichier qu'on dépose est celui d'un LOT
 * constitué (`collection-batch-file.ts`), dont les identifiants dérivent de
 * l'id du lot. Le corps du message est commun (`pain008-document.ts`).
 */

export { BIC_NOT_PROVIDED, cycleTagOf } from "./pain008-document.js";

export interface Pain008Input {
  readonly creditor: CreditorSnapshot;
  /** Le schéma du fichier rendu : seules les lignes dont le MANDAT l'a y entrent. */
  readonly scheme: SepaScheme;
  /** Les mandats prélevables, par société. Une société absente garde le bandeau. */
  readonly mandates: ReadonlyMap<string, DebtorMandate>;
  /** Bornes du cycle — la seconde est **exclusive**. */
  readonly cycleStart: Date;
  readonly cycleEnd: Date;
  /** L'instant de fabrication du fichier, venu du port `Clock`. */
  readonly createdAt: Date;
  /** TOUTES les lignes du cycle, tous schémas confondus. */
  readonly lines: readonly BillableCompany[];
}

/**
 * Le **cycle** est-il prélevable en entier ? Chaque ligne porte son mandat, et il
 * y a au moins une ligne.
 *
 * 🔴 `lines.length > 0` et pas seulement `every` — corrigé le 2026-09-13 : sur
 * un lot vide, `every` rend `true` par vacuité, et un cycle sans rien à prélever
 * sortait « déposable » avec `NbOfTxs` à zéro.
 */
export function isDepositable(
  lines: readonly BillableCompany[],
  mandates: ReadonlyMap<string, DebtorMandate>,
): boolean {
  return lines.length > 0 && lines.every((line) => mandates.has(line.companyId));
}

/**
 * Le FICHIER d'un schéma est-il déposable ? Le cycle entier doit l'être, et le
 * fichier doit contenir au moins une ligne — la même vacuité qu'au-dessus, un
 * cran plus bas : un cycle tout en B2B rendrait sinon un fichier CORE vide et
 * « déposable ».
 *
 * Exposé pour que le NOM du fichier ne puisse pas contredire son contenu.
 */
export function isSchemeFileDepositable(
  lines: readonly BillableCompany[],
  mandates: ReadonlyMap<string, DebtorMandate>,
  scheme: SepaScheme,
): boolean {
  return isDepositable(lines, mandates) && linesOfScheme(lines, mandates, scheme).length > 0;
}

/** Une ligne du fichier : la dette et le mandat qui l'autorise, jamais l'un sans l'autre. */
interface Debit {
  readonly line: BillableCompany;
  readonly mandate: DebtorMandate;
}

function linesOfScheme(
  lines: readonly BillableCompany[],
  mandates: ReadonlyMap<string, DebtorMandate>,
  scheme: SepaScheme,
): readonly Debit[] {
  return lines.flatMap((line) => {
    const mandate = mandates.get(line.companyId);
    return mandate?.scheme === scheme ? [{ line, mandate }] : [];
  });
}

/** Rend le XML du fichier d'un schéma. Déterministe : mêmes entrées, même fichier. */
export function renderPain008(input: Pain008Input): string {
  const { lines, mandates, scheme } = input;
  const debits = linesOfScheme(lines, mandates, scheme);
  const complete = isSchemeFileDepositable(lines, mandates, scheme);
  const cycleTag = cycleTagOf(input.cycleEnd);
  const messageId = `${complete ? "" : "BROUILLON-"}${cycleTag}-${scheme}`;
  const unmandated = lines.filter((line) => !mandates.has(line.companyId));
  const period = cyclePeriod(input.cycleStart, input.cycleEnd);

  return renderPain008Document({
    creditor: input.creditor,
    scheme,
    messageId,
    paymentInfoIdOf: (sequence) => `${messageId}-${sequence}`,
    createdAt: input.createdAt,
    cycleEnd: input.cycleEnd,
    banner: complete
      ? null
      : draftBanner(
          unmandated.map((line) => line.companyName),
          debits.length === 0,
        ),
    debits: rankedDebits(debits, `${cycleTag}-${scheme}`, period),
  });
}

/**
 * Le rang de bout en bout court sur tout le fichier, pas par bloc : deux blocs
 * du même message ne doivent pas partager une référence. Les débits sont donc
 * rangés par séquence (`RCUR` puis `OOFF`, ordre stable) AVANT d'être numérotés.
 *
 * 🔴 `EndToEndId` = `<cycle>-<schéma>-<rang>`, borné à 35 caractères. Le RANG et
 * non l'identifiant de la société : préfixé, un cuid dépasse et se fait tronquer,
 * et deux débiteurs partageraient la référence. Le schéma y entre parce que les
 * deux fichiers du même cycle numérotent chacun à partir de 1 (objection 4).
 */
function rankedDebits(
  debits: readonly Debit[],
  endToEndPrefix: string,
  period: string,
): readonly DocumentDebit[] {
  const ordered = SEQUENCE_ORDER.flatMap((sequence) =>
    debits.filter((debit) => sequenceTypeOf(debit.mandate.paymentType) === sequence),
  );
  return ordered.map(({ line, mandate }, index) => ({
    endToEndId: `${endToEndPrefix}-${String(index + 1).padStart(3, "0")}`,
    debtorName: line.companyName,
    amountCents: line.totalCents,
    mandate,
    remittance: `Commandes du ${period} (${String(line.orderCount)})`,
  }));
}

/**
 * L'avertissement, en tête du fichier et en toutes lettres. Il NOMME chaque
 * société du cycle sans mandat prélevable, et il est le même dans les deux
 * fichiers : ce qui manque manque au cycle, pas à un schéma.
 *
 * Exporté : le lot figé non déposable (Q2) porte le même.
 */
export function draftBanner(unmandated: readonly string[], empty: boolean): string {
  return [
    `<!--`,
    `  BROUILLON — CE FICHIER NE PEUT PAS ETRE DEPOSE.`,
    ...(unmandated.length === 0
      ? []
      : [
          ``,
          `  Societes du cycle sans mandat actif (ou sans compte recopie), absentes de`,
          `  ce fichier comme de l'autre schema :`,
          ...unmandated.map((name) => `  - ${commentSafe(name)}`),
        ]),
    ...(empty ? [``, `  Ce fichier ne contient aucune ligne a prelever.`] : []),
    ``,
    `  Le bloc creancier et les montants sont REELS. Voir`,
    `  documentation/comptabilite/prelevement-sepa.md.`,
    `-->`,
  ].join("\n");
}
