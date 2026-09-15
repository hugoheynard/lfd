import { addDays, instantToLocal } from "@lfd/contracts";

import type { CreditorSnapshot } from "../creditor-snapshot.js";
import type { MandatePaymentType } from "../value-objects/mandate-defaults.js";
import type { SepaScheme } from "../value-objects/sepa-scheme.js";
import type { DebtorMandate } from "../ports/debtor-mandate.reader.js";
import type { BillableCompany } from "../ports/billable-orders.reader.js";
import { CreditorBicMissingError } from "../errors/accounting-errors.js";

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
 */

/** Ce que la norme accepte dans un texte SEPA : ni accent, ni symbole exotique. */
const SEPA_ALLOWED = /[^A-Za-z0-9/\-?:().,'+ ]/gu;
/** Ce qu'on écrit dans `DbtrAgt` quand le BIC du débiteur est inconnu. */
export const BIC_NOT_PROVIDED = "NOTPROVIDED";

type SequenceType = "RCUR" | "OOFF";

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
  const { creditor, lines, mandates, scheme } = input;

  // 🔴 Le BIC du créancier est exigé ICI, et nulle part avant : le mandat n'en
  // porte pas, le lot si. Le refus nomme l'entité plutôt que d'écrire un
  // `CdtrAgt` vide que la banque rejetterait sans dire lequel manquait.
  if (creditor.creditorBic === null || creditor.creditorBic === "") {
    throw new CreditorBicMissingError(creditor.name);
  }

  const debits = linesOfScheme(lines, mandates, scheme);
  const complete = isSchemeFileDepositable(lines, mandates, scheme);
  const cycleTag = cycleTagOf(input.cycleEnd);
  const messageId = `${complete ? "" : "BROUILLON-"}${cycleTag}-${scheme}`;
  const unmandated = lines.filter((line) => !mandates.has(line.companyId));
  const context: BlockContext = {
    input,
    creditorBic: creditor.creditorBic,
    messageId,
    endToEndPrefix: `${cycleTag}-${scheme}`,
  };

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    ...(complete ? [] : [draftBanner(unmandated, debits.length === 0)]),
    `<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02">`,
    `  <CstmrDrctDbtInitn>`,
    `    <GrpHdr>`,
    `      <MsgId>${messageId}</MsgId>`,
    // Sans décalage horaire : beaucoup de banques françaises refusent l'offset.
    `      <CreDtTm>${localDateTime(input.createdAt)}</CreDtTm>`,
    `      <NbOfTxs>${String(debits.length)}</NbOfTxs>`,
    `      <CtrlSum>${euros(sumOf(debits))}</CtrlSum>`,
    `      <InitgPty><Nm>${sepa(creditor.name)}</Nm></InitgPty>`,
    `    </GrpHdr>`,
    ...paymentBlocks(context, debits),
    `  </CstmrDrctDbtInitn>`,
    `</Document>`,
    ``,
  ].join("\n");
}

interface BlockContext {
  readonly input: Pain008Input;
  readonly creditorBic: string;
  readonly messageId: string;
  readonly endToEndPrefix: string;
}

/**
 * Un `PmtInf` par séquence présente, dans un ordre fixe (`RCUR` puis `OOFF`).
 * Le rang de bout en bout court sur tout le fichier, pas par bloc : deux blocs
 * du même message ne doivent pas partager une référence.
 *
 * ⚠️ Un fichier SANS ligne garde un bloc, à la séquence du réglage de l'entité :
 * il n'est pas déposable (bandeau), mais il sert encore à relire notre bloc
 * créancier avec un conseiller — c'est l'usage du brouillon.
 */
function paymentBlocks(context: BlockContext, debits: readonly Debit[]): readonly string[] {
  if (debits.length === 0) {
    return paymentBlock(context, sequenceTypeOf(context.input.creditor.mandatePaymentType), [], 0);
  }
  let rank = 0;
  return SEQUENCE_ORDER.flatMap((sequence) => {
    const block = debits.filter((debit) => sequenceTypeOf(debit.mandate.paymentType) === sequence);
    if (block.length === 0) {
      return [];
    }
    const rendered = paymentBlock(context, sequence, block, rank);
    rank += block.length;
    return rendered;
  });
}

function paymentBlock(
  context: BlockContext,
  sequence: SequenceType,
  debits: readonly Debit[],
  firstRank: number,
): readonly string[] {
  const { creditor, scheme } = context.input;
  const period = `${localDay(context.input.cycleStart)} au ${localDay(dayBefore(context.input.cycleEnd))}`;
  return [
    `    <PmtInf>`,
    `      <PmtInfId>${context.messageId}-${sequence}</PmtInfId>`,
    `      <PmtMtd>DD</PmtMtd>`,
    `      <NbOfTxs>${String(debits.length)}</NbOfTxs>`,
    `      <CtrlSum>${euros(sumOf(debits))}</CtrlSum>`,
    `      <PmtTpInf>`,
    `        <SvcLvl><Cd>SEPA</Cd></SvcLvl>`,
    // Le schéma du fichier, c'est-à-dire celui de CHAQUE mandat qu'il contient.
    `        <LclInstrm><Cd>${scheme}</Cd></LclInstrm>`,
    `        <SeqTp>${sequence}</SeqTp>`,
    `      </PmtTpInf>`,
    `      <ReqdColltnDt>${requestedCollectionDay(context.input.cycleEnd, creditor.preNotificationDays)}</ReqdColltnDt>`,
    `      <Cdtr><Nm>${sepa(creditor.name)}</Nm></Cdtr>`,
    `      <CdtrAcct><Id><IBAN>${creditor.creditorIban}</IBAN></Id></CdtrAcct>`,
    `      <CdtrAgt><FinInstnId><BIC>${context.creditorBic}</BIC></FinInstnId></CdtrAgt>`,
    `      <ChrgBr>SLEV</ChrgBr>`,
    `      <CdtrSchmeId><Id><PrvtId><Othr>`,
    `        <Id>${creditor.ics}</Id>`,
    `        <SchmeNm><Prtry>SEPA</Prtry></SchmeNm>`,
    `      </Othr></PrvtId></Id></CdtrSchmeId>`,
    ...debits.map((debit, index) =>
      transaction(debit, `${context.endToEndPrefix}-${rankOf(firstRank + index)}`, period),
    ),
    `    </PmtInf>`,
  ];
}

/**
 * Une ligne = **un débiteur**, jamais une commande. Un client à trente commandes
 * voit un seul prélèvement sur son relevé, et nous payons un seul frais
 * d'opération (décision de Hugo, 2026-09-10).
 *
 * 🔴 `EndToEndId` = `<cycle>-<schéma>-<rang>`, borné à 35 caractères. Le RANG et
 * non l'identifiant de la société : préfixé, un cuid dépasse et se fait tronquer,
 * et deux débiteurs partageraient la référence. Le schéma y entre parce que les
 * deux fichiers du même cycle numérotent chacun à partir de 1 (objection 4).
 */
function transaction(debit: Debit, endToEndId: string, period: string): string {
  const { line, mandate } = debit;
  return [
    `      <DrctDbtTxInf>`,
    `        <PmtId><EndToEndId>${endToEndId}</EndToEndId></PmtId>`,
    `        <InstdAmt Ccy="EUR">${euros(line.totalCents)}</InstdAmt>`,
    `        <DrctDbtTx><MndtRltdInf>`,
    `          <MndtId>${mandate.reference}</MndtId>`,
    // Le jour du PAPIER, en heure de Paris : minuit local vaut 22h ou 23h UTC
    // la veille, et un jour lu en UTC daterait le consentement d'un jour trop tôt.
    `          <DtOfSgntr>${localDay(mandate.signedAt)}</DtOfSgntr>`,
    `          <AmdmntInd>false</AmdmntInd>`,
    `        </MndtRltdInf></DrctDbtTx>`,
    `        <DbtrAgt><FinInstnId>${debtorAgent(mandate.bic)}</FinInstnId></DbtrAgt>`,
    `        <Dbtr><Nm>${sepa(line.companyName)}</Nm></Dbtr>`,
    `        <DbtrAcct><Id><IBAN>${mandate.iban}</IBAN></Id></DbtrAcct>`,
    // 140 caractères au maximum : les commandes se résument, elles ne se listent pas.
    `        <RmtInf><Ustrd>${sepa(`Commandes du ${period} (${String(line.orderCount)})`).slice(0, 140)}</Ustrd></RmtInf>`,
    `      </DrctDbtTxInf>`,
  ].join("\n");
}

/**
 * La banque du débiteur. ⚠️ `NOTPROVIDED` sans BIC : c'est la valeur que les
 * guides de mise en œuvre EPC donnent quand le BIC n'est pas exigé — que la
 * Caisse d'Épargne l'accepte reste à confirmer (objection 10, non vérifié).
 */
function debtorAgent(bic: string | null): string {
  return bic === null ? `<Othr><Id>${BIC_NOT_PROVIDED}</Id></Othr>` : `<BIC>${bic}</BIC>`;
}

/**
 * Exhaustive sur `MandatePaymentType` : un troisième type ne compile pas tant
 * qu'il n'a pas sa séquence. `FRST`/`FNAL` décrivent un RANG dans une série, que
 * rien ne mémorise encore (cf. l'en-tête).
 */
const SEQUENCE_TYPES: Readonly<Record<MandatePaymentType, SequenceType>> = {
  recurrent: "RCUR",
  one_off: "OOFF",
};
const SEQUENCE_ORDER: readonly SequenceType[] = ["RCUR", "OOFF"];

function sequenceTypeOf(paymentType: MandatePaymentType): SequenceType {
  return SEQUENCE_TYPES[paymentType];
}

/**
 * L'avertissement, en tête du fichier et en toutes lettres. Il NOMME chaque
 * société du cycle sans mandat prélevable, et il est le même dans les deux
 * fichiers : ce qui manque manque au cycle, pas à un schéma.
 */
function draftBanner(unmandated: readonly BillableCompany[], empty: boolean): string {
  return [
    `<!--`,
    `  BROUILLON — CE FICHIER NE PEUT PAS ETRE DEPOSE.`,
    ...(unmandated.length === 0
      ? []
      : [
          ``,
          `  Societes du cycle sans mandat actif (ou sans compte recopie), absentes de`,
          `  ce fichier comme de l'autre schema :`,
          ...unmandated.map((line) => `  - ${commentSafe(line.companyName)}`),
        ]),
    ...(empty ? [``, `  Ce fichier ne contient aucune ligne a prelever.`] : []),
    ``,
    `  Le bloc creancier et les montants sont REELS. Voir`,
    `  documentation/comptabilite/prelevement-sepa.md.`,
    `-->`,
  ].join("\n");
}

/** Un nom dans un commentaire XML : jeu SEPA, et jamais `--`, qui le fermerait. */
function commentSafe(raw: string): string {
  return sepa(raw).replace(/-{2,}/gu, "-");
}

/**
 * L'étiquette du cycle — `202609` pour un cycle clos le 1er octobre.
 *
 * 🔴 Dérivée du **dernier jour COMPRIS**, pas de l'instant de clôture : la borne
 * haute est exclusive. Exportée pour que le NOM du fichier vienne d'ici aussi.
 */
export function cycleTagOf(cycleEnd: Date): string {
  return localDay(dayBefore(cycleEnd)).slice(0, 7).replace("-", "");
}

/**
 * La clôture plus le délai de pré-notification. ⚠️ Sans jours ouvrés ni délai de
 * présentation de la banque (questions 3 et 8 de `prelevement-sepa.md`).
 */
function requestedCollectionDay(cycleEnd: Date, preNotificationDays: number): string {
  return addDays(localDay(cycleEnd), preNotificationDays);
}

function sumOf(debits: readonly Debit[]): number {
  return debits.reduce((sum, debit) => sum + debit.line.totalCents, 0);
}

function rankOf(index: number): string {
  return String(index + 1).padStart(3, "0");
}

function localDay(instant: Date): string {
  return instantToLocal(instant).day;
}

/** La borne haute du cycle est exclusive : le dernier jour compté est la veille. */
function dayBefore(instant: Date): Date {
  return new Date(instant.getTime() - 1);
}

/** `2026-09-30T23:05:00` — sans `Z` ni décalage, ce que les banques attendent. */
function localDateTime(instant: Date): string {
  const local = instantToLocal(instant);
  return `${local.day}T${local.time}:00`;
}

/** Centimes → `1234.56`. Point décimal, deux décimales, toujours. */
function euros(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  return `${sign}${String(Math.trunc(absolute / 100))}.${String(absolute % 100).padStart(2, "0")}`;
}

/**
 * Le jeu restreint SEPA — et l'échappement XML par la même occasion. Les accents
 * sont décomposés puis retirés (« Isère » → « Isere »), le reste hors du jeu
 * devient une espace, jamais rien.
 */
function sepa(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036F]/gu, "")
    .replace(SEPA_ALLOWED, " ")
    .replace(/\s+/gu, " ")
    .trim();
}
