import { instantToLocal } from "@lfd/contracts";

import type { CreditorSnapshot } from "../creditor-snapshot.js";
import type { MandatePaymentType } from "../value-objects/mandate-defaults.js";
import type { SepaScheme } from "../value-objects/sepa-scheme.js";
import { CreditorBicMissingError } from "../errors/accounting-errors.js";
import { SepaIdentifierTooLongError } from "../errors/collection-errors.js";
import { periodTagOf } from "./invoicing-closures.js";
import { SEPA_MAX140_TEXT, SEPA_MAX35_TEXT, SEPA_NAME_MAX, sepa, sepaText } from "./sepa-text.js";

/** Réexporté : les lecteurs historiques l'importent d'ici. */
export { sepa };

/**
 * **Le corps d'un `pain.008`**, quels que soient ses identifiants.
 *
 * Sorti de `pain008.ts` le 2026-10-05 (plan `lot-de-prelevement-fige.md`) : le brouillon du cycle en cours et le lot figé rendent le MÊME message,
 * et ne diffèrent que par trois choses — d'où viennent `MsgId` et
 * `EndToEndId`, ce que dit `RmtInf`, et le bandeau. Deux rendus du même
 * format finiraient par diverger ; ils partagent donc celui-ci, et chacun ne
 * décide que de ce qui lui appartient.
 *
 * Déterministe : aucune horloge lue ici, l'instant de création est donné.
 */

/** Ce qu'on écrit dans `DbtrAgt` quand le BIC du débiteur est inconnu. */
export const BIC_NOT_PROVIDED = "NOTPROVIDED";

/** La séquence d'un LOT réel : `FRST` et `FNAL` y sont inexprimables. */
export type SequenceType = "RCUR" | "OOFF";

/**
 * La séquence d'un **prélèvement d'essai** (plan `plan-prelevement-d-essai.md`,
 * §4 et Q7, Hugo 2026-10-22) : `FRST` en plus, pour éprouver ce que la banque
 * accepte. `FNAL` reste inexprimable — il peut faire clore la série du mandat.
 */
export type TestSequence = "RCUR" | "FRST" | "OOFF";

/** Toute séquence que le rendu sait écrire dans `SeqTp`. */
export type PaymentSequence = SequenceType | TestSequence;

/** L'ordre des blocs `PmtInf` quand plusieurs séquences sont présentes. */
const BLOCK_ORDER: readonly PaymentSequence[] = ["FRST", "RCUR", "OOFF"];

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

/**
 * Une ligne du fichier : un débiteur, son montant, son mandat — et sa
 * séquence, donnée par l'appelant (§4 de vitruve) : le lot réel la tire de
 * `sequenceTypeOf`, l'essai de son paramètre. Le rendu ne la déduit plus.
 */
export interface DocumentDebit<S extends PaymentSequence = SequenceType> {
  readonly sequence: S;
  readonly endToEndId: string;
  readonly debtorName: string;
  readonly amountCents: number;
  readonly mandate: DocumentMandate;
  /** Le texte de `RmtInf`, avant passage au jeu SEPA et coupe à `SEPA_MAX140_TEXT`. */
  readonly remittance: string;
}

export interface Pain008Document<S extends PaymentSequence = SequenceType> {
  readonly creditor: CreditorSnapshot;
  readonly scheme: SepaScheme;
  readonly messageId: string;
  /** `PmtInfId` d'un bloc, à partir de sa séquence. */
  readonly paymentInfoIdOf: (sequence: S) => string;
  /**
   * La séquence du bloc d'un fichier SANS ligne (il en garde un, cf.
   * `paymentBlocks`) — ignorée dès qu'il y a une ligne.
   */
  readonly emptySequence: S;
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
  readonly debits: readonly DocumentDebit<S>[];
}

/** Rend le XML. Déterministe : mêmes entrées, même fichier. */
export function renderPain008Document<S extends PaymentSequence>(
  document: Pain008Document<S>,
): string {
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
    `      <MsgId>${identifier(document.messageId, "MsgId", "en-tête")}</MsgId>`,
    // Sans décalage horaire : beaucoup de banques françaises refusent l'offset.
    `      <CreDtTm>${localDateTime(document.createdAt)}</CreDtTm>`,
    `      <NbOfTxs>${String(debits.length)}</NbOfTxs>`,
    `      <CtrlSum>${euros(sumOf(debits))}</CtrlSum>`,
    `      <InitgPty><Nm>${sepaText(creditor.name, SEPA_NAME_MAX)}</Nm></InitgPty>`,
    `    </GrpHdr>`,
    ...paymentBlocks(document, creditorBic),
    `  </CstmrDrctDbtInitn>`,
    `</Document>`,
    ``,
  ].join("\n");
}

/**
 * Un `PmtInf` par séquence présente, dans un ordre fixe (`FRST`, `RCUR`,
 * `OOFF`) — un lot réel n'a jamais de `FRST`, il garde donc `RCUR` puis `OOFF`.
 *
 * ⚠️ Un fichier SANS ligne garde un bloc, à `emptySequence` (le réglage de
 * l'entité pour un lot) : il n'est pas déposable (bandeau), mais il sert encore
 * à relire notre bloc créancier avec un conseiller.
 */
function paymentBlocks<S extends PaymentSequence>(
  document: Pain008Document<S>,
  creditorBic: string,
): readonly string[] {
  const { debits } = document;
  if (debits.length === 0) {
    return paymentBlock(document, creditorBic, document.emptySequence, []);
  }
  return BLOCK_ORDER.flatMap((order) => {
    const block = debits.filter((debit) => debit.sequence === order);
    const first = block[0];
    return first === undefined ? [] : paymentBlock(document, creditorBic, first.sequence, block);
  });
}

function paymentBlock<S extends PaymentSequence>(
  document: Pain008Document<S>,
  creditorBic: string,
  sequence: S,
  debits: readonly DocumentDebit<S>[],
): readonly string[] {
  const { creditor, scheme } = document;
  return [
    `    <PmtInf>`,
    `      <PmtInfId>${identifier(document.paymentInfoIdOf(sequence), "PmtInfId", `bloc ${sequence}`)}</PmtInfId>`,
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
    `      <Cdtr><Nm>${sepaText(creditor.name, SEPA_NAME_MAX)}</Nm></Cdtr>`,
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
function transaction(debit: DocumentDebit<PaymentSequence>): string {
  const { mandate } = debit;
  const line = `débiteur « ${sepa(debit.debtorName)} »`;
  return [
    `      <DrctDbtTxInf>`,
    `        <PmtId><EndToEndId>${identifier(debit.endToEndId, "EndToEndId", line)}</EndToEndId></PmtId>`,
    `        <InstdAmt Ccy="EUR">${euros(debit.amountCents)}</InstdAmt>`,
    `        <DrctDbtTx><MndtRltdInf>`,
    `          <MndtId>${identifier(mandate.reference, "MndtId", line)}</MndtId>`,
    // Le jour du PAPIER, en heure de Paris : minuit local vaut 22h ou 23h UTC
    // la veille, et un jour lu en UTC daterait le consentement d'un jour trop tôt.
    `          <DtOfSgntr>${localDay(mandate.signedAt)}</DtOfSgntr>`,
    `          <AmdmntInd>false</AmdmntInd>`,
    `        </MndtRltdInf></DrctDbtTx>`,
    `        <DbtrAgt><FinInstnId>${debtorAgent(mandate.bic)}</FinInstnId></DbtrAgt>`,
    `        <Dbtr><Nm>${sepaText(debit.debtorName, SEPA_NAME_MAX)}</Nm></Dbtr>`,
    `        <DbtrAcct><Id><IBAN>${mandate.iban}</IBAN></Id></DbtrAcct>`,
    // 140 caractères au maximum : les commandes se résument, elles ne se listent pas.
    `        <RmtInf><Ustrd>${sepaText(debit.remittance, SEPA_MAX140_TEXT)}</Ustrd></RmtInf>`,
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
 * Un identifiant ne se COUPE jamais : la banque rapproche un rejet par lui, et
 * une RUM tronquée désignerait un autre mandat. Au-delà de `Max35Text`, refus.
 */
function identifier(value: string, field: string, line: string): string {
  if (value.length > SEPA_MAX35_TEXT) {
    throw new SepaIdentifierTooLongError(field, value, line, SEPA_MAX35_TEXT);
  }
  return value;
}

/** « du 1 au 30 » : la période d'un cycle, dernier jour COMPRIS. */
export function cyclePeriod(cycleStart: Date, cycleEnd: Date): string {
  return `${localDay(cycleStart)} au ${localDay(dayBefore(cycleEnd))}`;
}

/**
 * L'étiquette du cycle — `20260930` pour un cycle clos le 1er octobre
 * (`AAAAMM` jusqu'à R5, qui confondait deux semaines d'un même mois).
 *
 * 🔴 Dérivée du **dernier jour COMPRIS**, pas de l'instant de clôture : la borne
 * haute est exclusive.
 *
 * ⚠️ Elle n'entre dans AUCUN identifiant figé : le `MsgId`, les `PmtInfId` et
 * les `EndToEndId` d'un lot sont tirés de son ULID (`collection-identifiers.ts`),
 * et son XML est stocké, jamais re-rendu (`lot-de-prelevement-fige.md`, vérifié
 * le 2026-10-12). Elle ne nomme que le brouillon (re-rendu à chaque appel), les
 * noms de fichiers et les libellés de lot — ceux déjà écrits au journal gardent
 * l'ancienne forme.
 */
export function cycleTagOf(cycleEnd: Date): string {
  return periodTagOf(cycleEnd);
}

/** Un nom dans un commentaire XML : jeu SEPA, et jamais `--`, qui le fermerait. */
export function commentSafe(raw: string): string {
  return sepa(raw).replace(/-{2,}/gu, "-");
}

function sumOf(debits: readonly DocumentDebit<PaymentSequence>[]): number {
  return debits.reduce((sum, debit) => sum + debit.amountCents, 0);
}

/**
 * Le jour de Paris d'un instant (`AAAA-MM-JJ`) — celui de `DtOfSgntr`.
 * Exporté pour l'export des mandats, qui doit dater la signature du MÊME jour
 * que le `pain.008` : la banque rapproche ses deux fichiers.
 */
export function localDay(instant: Date): string {
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
