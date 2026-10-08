import { instantToLocal } from "@lfd/contracts";

import type { CreditorSnapshot } from "../creditor-snapshot.js";
import type { MandatePaymentType } from "../value-objects/mandate-defaults.js";
import type { SepaScheme } from "../value-objects/sepa-scheme.js";
import { CreditorBicMissingError } from "../errors/accounting-errors.js";

/**
 * **Le corps d'un `pain.008`**, quels que soient ses identifiants.
 *
 * Sorti de `pain008.ts` le 2026-10-05 (plan `plan-lot-de-prelevement-fige.md`,
 * §1) : le brouillon du cycle en cours et le lot figé rendent le MÊME message,
 * et ne diffèrent que par trois choses — d'où viennent `MsgId` et
 * `EndToEndId`, ce que dit `RmtInf`, et le bandeau. Deux rendus du même
 * format finiraient par diverger ; ils partagent donc celui-ci, et chacun ne
 * décide que de ce qui lui appartient.
 *
 * Déterministe : aucune horloge lue ici, l'instant de création est donné.
 */

/** Ce qu'on écrit dans `DbtrAgt` quand le BIC du débiteur est inconnu. */
export const BIC_NOT_PROVIDED = "NOTPROVIDED";

/** Ce que la norme accepte dans un texte SEPA : ni accent, ni symbole exotique. */
const SEPA_ALLOWED = /[^A-Za-z0-9/\-?:().,'+ ]/gu;

export type SequenceType = "RCUR" | "OOFF";

/**
 * Exhaustive sur `MandatePaymentType` : un troisième type ne compile pas tant
 * qu'il n'a pas sa séquence. `FRST`/`FNAL` décrivent un RANG dans une série, que
 * rien ne mémorise encore.
 */
const SEQUENCE_TYPES: Readonly<Record<MandatePaymentType, SequenceType>> = {
  recurrent: "RCUR",
  one_off: "OOFF",
};

/** L'ordre des blocs `PmtInf` dans un fichier — et donc celui des rangs. */
export const SEQUENCE_ORDER: readonly SequenceType[] = ["RCUR", "OOFF"];

export function sequenceTypeOf(paymentType: MandatePaymentType): SequenceType {
  return SEQUENCE_TYPES[paymentType];
}

/** Le mandat d'une ligne, tel qu'il s'imprime. */
export interface DocumentMandate {
  readonly reference: string;
  readonly iban: string;
  readonly bic: string | null;
  readonly signedAt: Date;
  readonly paymentType: MandatePaymentType;
}

/** Une ligne du fichier : un débiteur, son montant, son mandat. */
export interface DocumentDebit {
  readonly endToEndId: string;
  readonly debtorName: string;
  readonly amountCents: number;
  readonly mandate: DocumentMandate;
  /** Le texte de `RmtInf`, avant passage au jeu SEPA et coupe à 140. */
  readonly remittance: string;
}

export interface Pain008Document {
  readonly creditor: CreditorSnapshot;
  readonly scheme: SepaScheme;
  readonly messageId: string;
  /** `PmtInfId` d'un bloc, à partir de sa séquence. */
  readonly paymentInfoIdOf: (sequence: SequenceType) => string;
  /** L'instant de fabrication du fichier — `CreDtTm`. */
  readonly createdAt: Date;
  /**
   * `ReqdColltnDt` (`AAAA-MM-JJ`) — l'échéance du calendrier
   * (`collectionCalendar`), jamais recalculée ici : le lot la fige, l'aperçu
   * la tire du même calcul.
   */
  readonly requestedCollectionDay: string;
  /** Le commentaire de tête, ou `null` pour un fichier déposable. */
  readonly banner: string | null;
  /** Dans l'ordre des rangs — `RCUR` d'abord, puis `OOFF`. */
  readonly debits: readonly DocumentDebit[];
}

/** Rend le XML. Déterministe : mêmes entrées, même fichier. */
export function renderPain008Document(document: Pain008Document): string {
  const { creditor, debits } = document;

  // 🔴 Le BIC du créancier est exigé ICI, et nulle part avant : le mandat n'en
  // porte pas, le lot si. Le refus nomme l'entité plutôt que d'écrire un
  // `CdtrAgt` vide que la banque rejetterait sans dire lequel manquait.
  if (creditor.creditorBic === null || creditor.creditorBic === "") {
    throw new CreditorBicMissingError(creditor.name);
  }
  const creditorBic = creditor.creditorBic;

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    ...(document.banner === null ? [] : [document.banner]),
    `<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02">`,
    `  <CstmrDrctDbtInitn>`,
    `    <GrpHdr>`,
    `      <MsgId>${document.messageId}</MsgId>`,
    // Sans décalage horaire : beaucoup de banques françaises refusent l'offset.
    `      <CreDtTm>${localDateTime(document.createdAt)}</CreDtTm>`,
    `      <NbOfTxs>${String(debits.length)}</NbOfTxs>`,
    `      <CtrlSum>${euros(sumOf(debits))}</CtrlSum>`,
    `      <InitgPty><Nm>${sepa(creditor.name)}</Nm></InitgPty>`,
    `    </GrpHdr>`,
    ...paymentBlocks(document, creditorBic),
    `  </CstmrDrctDbtInitn>`,
    `</Document>`,
    ``,
  ].join("\n");
}

/**
 * Un `PmtInf` par séquence présente, dans un ordre fixe (`RCUR` puis `OOFF`).
 *
 * ⚠️ Un fichier SANS ligne garde un bloc, à la séquence du réglage de l'entité :
 * il n'est pas déposable (bandeau), mais il sert encore à relire notre bloc
 * créancier avec un conseiller.
 */
function paymentBlocks(document: Pain008Document, creditorBic: string): readonly string[] {
  const { debits } = document;
  if (debits.length === 0) {
    return paymentBlock(
      document,
      creditorBic,
      sequenceTypeOf(document.creditor.mandatePaymentType),
      [],
    );
  }
  return SEQUENCE_ORDER.flatMap((sequence) => {
    const block = debits.filter((debit) => sequenceTypeOf(debit.mandate.paymentType) === sequence);
    return block.length === 0 ? [] : paymentBlock(document, creditorBic, sequence, block);
  });
}

function paymentBlock(
  document: Pain008Document,
  creditorBic: string,
  sequence: SequenceType,
  debits: readonly DocumentDebit[],
): readonly string[] {
  const { creditor, scheme } = document;
  return [
    `    <PmtInf>`,
    `      <PmtInfId>${document.paymentInfoIdOf(sequence)}</PmtInfId>`,
    `      <PmtMtd>DD</PmtMtd>`,
    `      <NbOfTxs>${String(debits.length)}</NbOfTxs>`,
    `      <CtrlSum>${euros(sumOf(debits))}</CtrlSum>`,
    `      <PmtTpInf>`,
    `        <SvcLvl><Cd>SEPA</Cd></SvcLvl>`,
    // Le schéma du fichier, c'est-à-dire celui de CHAQUE mandat qu'il contient.
    `        <LclInstrm><Cd>${scheme}</Cd></LclInstrm>`,
    `        <SeqTp>${sequence}</SeqTp>`,
    `      </PmtTpInf>`,
    `      <ReqdColltnDt>${document.requestedCollectionDay}</ReqdColltnDt>`,
    `      <Cdtr><Nm>${sepa(creditor.name)}</Nm></Cdtr>`,
    `      <CdtrAcct><Id><IBAN>${creditor.creditorIban}</IBAN></Id></CdtrAcct>`,
    `      <CdtrAgt><FinInstnId><BIC>${creditorBic}</BIC></FinInstnId></CdtrAgt>`,
    `      <ChrgBr>SLEV</ChrgBr>`,
    `      <CdtrSchmeId><Id><PrvtId><Othr>`,
    `        <Id>${creditor.ics}</Id>`,
    `        <SchmeNm><Prtry>SEPA</Prtry></SchmeNm>`,
    `      </Othr></PrvtId></Id></CdtrSchmeId>`,
    ...debits.map(transaction),
    `    </PmtInf>`,
  ];
}

/** Une ligne = **un débiteur**, jamais une commande (décision de Hugo, 2026-09-10). */
function transaction(debit: DocumentDebit): string {
  const { mandate } = debit;
  return [
    `      <DrctDbtTxInf>`,
    `        <PmtId><EndToEndId>${debit.endToEndId}</EndToEndId></PmtId>`,
    `        <InstdAmt Ccy="EUR">${euros(debit.amountCents)}</InstdAmt>`,
    `        <DrctDbtTx><MndtRltdInf>`,
    `          <MndtId>${mandate.reference}</MndtId>`,
    // Le jour du PAPIER, en heure de Paris : minuit local vaut 22h ou 23h UTC
    // la veille, et un jour lu en UTC daterait le consentement d'un jour trop tôt.
    `          <DtOfSgntr>${localDay(mandate.signedAt)}</DtOfSgntr>`,
    `          <AmdmntInd>false</AmdmntInd>`,
    `        </MndtRltdInf></DrctDbtTx>`,
    `        <DbtrAgt><FinInstnId>${debtorAgent(mandate.bic)}</FinInstnId></DbtrAgt>`,
    `        <Dbtr><Nm>${sepa(debit.debtorName)}</Nm></Dbtr>`,
    `        <DbtrAcct><Id><IBAN>${mandate.iban}</IBAN></Id></DbtrAcct>`,
    // 140 caractères au maximum : les commandes se résument, elles ne se listent pas.
    `        <RmtInf><Ustrd>${sepa(debit.remittance).slice(0, 140)}</Ustrd></RmtInf>`,
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

/** « du 1 au 30 » : la période d'un cycle, dernier jour COMPRIS. */
export function cyclePeriod(cycleStart: Date, cycleEnd: Date): string {
  return `${localDay(cycleStart)} au ${localDay(dayBefore(cycleEnd))}`;
}

/**
 * L'étiquette du cycle — `202609` pour un cycle clos le 1er octobre.
 *
 * 🔴 Dérivée du **dernier jour COMPRIS**, pas de l'instant de clôture : la borne
 * haute est exclusive.
 */
export function cycleTagOf(cycleEnd: Date): string {
  return localDay(dayBefore(cycleEnd)).slice(0, 7).replace("-", "");
}

/** Un nom dans un commentaire XML : jeu SEPA, et jamais `--`, qui le fermerait. */
export function commentSafe(raw: string): string {
  return sepa(raw).replace(/-{2,}/gu, "-");
}

function sumOf(debits: readonly DocumentDebit[]): number {
  return debits.reduce((sum, debit) => sum + debit.amountCents, 0);
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
export function sepa(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .replace(SEPA_ALLOWED, " ")
    .replace(/\s+/gu, " ")
    .trim();
}
