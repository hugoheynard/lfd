import { addDays, instantToLocal } from "@lfd/contracts";

import type { CreditorSnapshot } from "../creditor-snapshot.js";
import type { BillableCompany } from "../ports/billable-orders.reader.js";

/**
 * **Le `pain.008`** — le message ISO 20022 qui demande les prélèvements.
 *
 * C'est le fichier qu'on dépose au portail de la banque, et la seule pièce du
 * système dont une erreur se paie en argent réel plutôt qu'en écran faux. Le
 * format, ses pièges et les questions encore ouvertes vivent dans
 * [`format-pain-008.md`](../../../../../../documentation/comptabilite/format-pain-008.md).
 *
 * ## 🔴 CE FICHIER EST UN BROUILLON, ET IL DOIT LE RESTER
 *
 * Deux données du bloc débiteur n'existent **nulle part** dans le système :
 * son **IBAN** et la **RUM** de son mandat. Le mandat Stripe ne porte que
 * `last4`, `bankCode` et `country` — de quoi reconnaître un compte, jamais de
 * quoi le débiter. C'est la tranche 2 qui les apportera.
 *
 * Le rendu **n'invente donc rien**. Il écrit à leur place des marqueurs
 * qu'aucun schéma n'accepte — `IBAN-INCONNU` ne passe pas le motif d'un IBAN.
 * C'est délibéré et c'est le cœur de ce fichier : **un lot incomplet qui
 * RESSEMBLE à un lot valide est exactement ce qui finit déposé un vendredi
 * soir.** Un fichier qu'aucun portail n'accepte ne peut prélever personne par
 * accident.
 *
 * Ce qui est réel, en revanche, l'est entièrement : notre bloc créancier (ICS,
 * IBAN, raison sociale), la fenêtre du cycle, et **les montants**, sommés depuis
 * les vraies commandes. C'est ce qui rend le brouillon utile — il montre ce que
 * la banque recevra, et il se relit avec un conseiller.
 *
 * ## Déterministe
 *
 * Aucune horloge lue ici : l'instant de création est donné. Deux rendus des
 * mêmes entrées donnent le même fichier, ce qui le rend comparable en test.
 */

/** Ce qu'aucun IBAN ne peut valoir — le motif du schéma le refuse. */
export const UNKNOWN_IBAN = "IBAN-INCONNU";
/** Idem pour la référence de mandat, tant qu'aucune RUM n'est frappée. */
export const UNKNOWN_MANDATE = "MANDAT-INCONNU";
/** Ce que la norme accepte dans un texte SEPA : ni accent, ni symbole exotique. */
const SEPA_ALLOWED = /[^A-Za-z0-9/\-?:().,'+ ]/gu;

export interface Pain008Input {
  readonly creditor: CreditorSnapshot;
  /** Bornes du cycle — la seconde est **exclusive**. */
  readonly cycleStart: Date;
  readonly cycleEnd: Date;
  /** L'instant de fabrication du fichier, venu du port `Clock`. */
  readonly createdAt: Date;
  readonly lines: readonly BillableCompany[];
}

/** Rend le XML. Déterministe : mêmes entrées, même fichier. */
export function renderPain008(input: Pain008Input): string {
  const { creditor, lines } = input;
  const total = lines.reduce((sum, line) => sum + line.totalCents, 0);
  const collectionDay = requestedCollectionDay(input.cycleEnd, creditor.preNotificationDays);
  const cycleTag = cycleTagOf(input.cycleEnd);
  const messageId = `BROUILLON-${cycleTag}`;
  const period = `${localDay(input.cycleStart)} au ${localDay(dayBefore(input.cycleEnd))}`;

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    draftBanner(),
    `<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02">`,
    `  <CstmrDrctDbtInitn>`,
    `    <GrpHdr>`,
    `      <MsgId>${messageId}</MsgId>`,
    // Sans décalage horaire : beaucoup de banques françaises refusent l'offset.
    `      <CreDtTm>${localDateTime(input.createdAt)}</CreDtTm>`,
    `      <NbOfTxs>${String(lines.length)}</NbOfTxs>`,
    `      <CtrlSum>${euros(total)}</CtrlSum>`,
    `      <InitgPty><Nm>${sepa(creditor.name)}</Nm></InitgPty>`,
    `    </GrpHdr>`,
    `    <PmtInf>`,
    `      <PmtInfId>${messageId}-RCUR</PmtInfId>`,
    `      <PmtMtd>DD</PmtMtd>`,
    `      <NbOfTxs>${String(lines.length)}</NbOfTxs>`,
    `      <CtrlSum>${euros(total)}</CtrlSum>`,
    `      <PmtTpInf>`,
    `        <SvcLvl><Cd>SEPA</Cd></SvcLvl>`,
    `        <LclInstrm><Cd>B2B</Cd></LclInstrm>`,
    // ⚠️ `RCUR` pour toutes les lignes, et un seul `PmtInf` par conséquent. Le
    // jour où un premier prélèvement exigera `FRST`, il faudra un SECOND bloc :
    // la norme veut un `PmtInf` par couple (SeqTp, date), et un bloc mélangé se
    // fait rejeter EN ENTIER. C'est la question 4 posée à la banque.
    `        <SeqTp>RCUR</SeqTp>`,
    `      </PmtTpInf>`,
    `      <ReqdColltnDt>${collectionDay}</ReqdColltnDt>`,
    `      <Cdtr><Nm>${sepa(creditor.name)}</Nm></Cdtr>`,
    `      <CdtrAcct><Id><IBAN>${creditor.creditorIban}</IBAN></Id></CdtrAcct>`,
    `      <ChrgBr>SLEV</ChrgBr>`,
    `      <CdtrSchmeId><Id><PrvtId><Othr>`,
    `        <Id>${creditor.ics}</Id>`,
    `        <SchmeNm><Prtry>SEPA</Prtry></SchmeNm>`,
    `      </Othr></PrvtId></Id></CdtrSchmeId>`,
    ...lines.map((line, rank) => transaction(line, cycleTag, rank, period)),
    `    </PmtInf>`,
    `  </CstmrDrctDbtInitn>`,
    `</Document>`,
    ``,
  ].join("\n");
}

/**
 * Une ligne = **un débiteur**, jamais une commande. Un client à trente commandes
 * voit un seul prélèvement sur son relevé, et nous payons un seul frais
 * d'opération (décision de Hugo, 2026-09-10).
 */
function transaction(
  line: BillableCompany,
  cycleTag: string,
  rank: number,
  period: string,
): string {
  // 🔴 Le RANG dans le lot, pas l'identifiant de la société. `EndToEndId` est
  // borné à 35 caractères : un cuid ou un ULID de société, préfixé du cycle,
  // dépasse et se fait TRONQUER — deux débiteurs pourraient alors partager la
  // même référence, et un fichier de retour deviendrait inexploitable. Le rang
  // est court, unique dans le lot, et ne contient que des chiffres (l'underscore
  // d'un identifiant n'est même pas dans le jeu SEPA).
  //
  // ⚠️ Il n'est stable que tant que la composition du lot ne change pas. Le vrai
  // `EndToEndId` devra porter le numéro de TENTATIVE pour rester traçable après
  // une re-présentation — c'est la tranche 9, et le budget de 35 caractères y
  // sera serré (voir `format-pain-008.md`).
  const endToEndId = `${cycleTag}-${String(rank + 1).padStart(3, "0")}`;
  return [
    `      <DrctDbtTxInf>`,
    `        <PmtId><EndToEndId>${endToEndId}</EndToEndId></PmtId>`,
    `        <InstdAmt Ccy="EUR">${euros(line.totalCents)}</InstdAmt>`,
    `        <DrctDbtTx><MndtRltdInf>`,
    `          <MndtId>${UNKNOWN_MANDATE}</MndtId>`,
    `          <AmdmntInd>false</AmdmntInd>`,
    `        </MndtRltdInf></DrctDbtTx>`,
    `        <Dbtr><Nm>${sepa(line.companyName)}</Nm></Dbtr>`,
    `        <DbtrAcct><Id><IBAN>${UNKNOWN_IBAN}</IBAN></Id></DbtrAcct>`,
    // 140 caractères au maximum : les commandes du cycle se résument, elles ne
    // se listent pas.
    `        <RmtInf><Ustrd>${sepa(`Commandes du ${period} (${String(line.orderCount)})`).slice(0, 140)}</Ustrd></RmtInf>`,
    `      </DrctDbtTxInf>`,
  ].join("\n");
}

/** L'avertissement, en tête du fichier et en toutes lettres. */
function draftBanner(): string {
  return [
    `<!--`,
    `  BROUILLON — CE FICHIER NE PEUT PAS ETRE DEPOSE.`,
    ``,
    `  Le bloc creancier et les montants sont REELS. Le bloc debiteur ne l'est`,
    `  pas : l'IBAN et la reference de mandat (RUM) n'existent pas encore dans`,
    `  le systeme, et ce rendu ecrit a leur place des marqueurs qu'aucun schema`,
    `  n'accepte, plutot que d'inventer des valeurs plausibles.`,
    ``,
    `  Il sert a relire notre bloc creancier et la forme du lot, avec un`,
    `  conseiller bancaire. Voir documentation/comptabilite/format-pain-008.md.`,
    `-->`,
  ].join("\n");
}

/**
 * L'étiquette du cycle — `202609` pour un cycle clos le 1er octobre.
 *
 * 🔴 Dérivée du **dernier jour COMPRIS**, pas de l'instant de clôture. La borne
 * haute est exclusive : un cycle qui ferme le 1er octobre à 00h00 est celui de
 * SEPTEMBRE. Étiqueter par la clôture donnait `202610` sur le fichier et
 * `2026-09` sur son nom — deux identifiants du même fichier qui se
 * contredisent, ce qu'on ne remarque qu'en les comparant à la main.
 *
 * Elle est exportée pour que le NOM du fichier vienne d'ici aussi : c'est la
 * seule façon qu'ils ne divergent plus.
 */
export function cycleTagOf(cycleEnd: Date): string {
  return localDay(dayBefore(cycleEnd)).slice(0, 7).replace("-", "");
}

/**
 * La date de règlement demandée : la clôture, plus le délai de pré-notification
 * annoncé au débiteur.
 *
 * ⚠️ Elle ne tient pas compte des jours ouvrés ni du délai de présentation de la
 * banque — deux inconnues de `format-pain-008.md` (questions 3 et 8). C'est une
 * raison de plus pour que ce fichier reste un brouillon.
 */
function requestedCollectionDay(cycleEnd: Date, preNotificationDays: number): string {
  return addDays(localDay(cycleEnd), preNotificationDays);
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
 * Le jeu restreint SEPA — et l'échappement XML par la même occasion.
 *
 * Les accents sont **décomposés puis retirés** plutôt que remplacés par un
 * espace : « Val d'Isère » doit rester « Val d Isere » et pas « Val d Is re ».
 * Ce qui reste hors du jeu devient une espace, jamais rien — deux mots collés
 * seraient plus faux qu'un mot amputé.
 */
function sepa(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036F]/gu, "")
    .replace(SEPA_ALLOWED, " ")
    .replace(/\s+/gu, " ")
    .trim();
}
