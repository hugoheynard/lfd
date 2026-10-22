import { instantToLocal } from "@lfd/contracts";

import type { CreditorSnapshot } from "../creditor-snapshot.js";
import {
  renderPain008Document,
  sepa,
  type DocumentMandate,
  type TestSequence,
} from "./pain008-document.js";
import { sha256Of } from "./collection-batch-file.js";
import { collectionDayOf } from "./collection-calendar.js";
import { testSepaIdentifiers } from "./collection-test-identifiers.js";
import type { SepaScheme } from "../value-objects/sepa-scheme.js";

/** Le libellé (`RmtInf/Ustrd`) quand le staff n'en donne pas (plan §1). */
export const DEFAULT_TEST_REMITTANCE = "ESSAI PRELEVEMENT";

/**
 * L'échéance la plus proche qu'un essai admet, et celle que l'écran propose :
 * le calendrier des lots réels (`collection-calendar.ts`), comme si le cycle
 * se clôturait à l'instant de la génération — même délai N (ou de
 * pré-notification), même report au jour ouvré TARGET2. Pas de règle neuve
 * (plan §4).
 */
export function earliestTestCollectionDay(at: Date, creditor: CreditorSnapshot): string {
  return collectionDayOf(at, creditor.preNotificationDays, creditor.collectionDaysAfterClosure);
}

/** Le jour local de Paris d'un instant — pour comparer à une échéance. */
export function parisDayOf(at: Date): string {
  return instantToLocal(at).day;
}

export interface TestFileInput {
  readonly testId: string;
  readonly creditor: CreditorSnapshot;
  readonly scheme: SepaScheme;
  readonly sequence: TestSequence;
  /** `CreDtTm` — l'instant de la génération. */
  readonly createdAt: Date;
  readonly requestedCollectionDay: string;
  readonly debtorName: string;
  readonly amountCents: number;
  readonly mandate: DocumentMandate;
  /** Déjà passé au jeu SEPA, non vide. */
  readonly remittance: string;
}

export interface TestFile {
  readonly messageId: string;
  readonly endToEndId: string;
  readonly xml: string;
  readonly sha256: string;
}

/**
 * **Le fichier d'un essai** — UN débit, rendu par le MÊME rendu que les lots
 * (`renderPain008Document`), sans bandeau : il est déposable, c'est tout son
 * objet. Seuls changent ses identifiants (`ESS-…`) et sa séquence, donnée
 * plutôt que déduite du mandat.
 */
export function renderTestFile(input: TestFileInput): TestFile {
  const ids = testSepaIdentifiers(input.testId);
  const xml = renderPain008Document<TestSequence>({
    creditor: input.creditor,
    scheme: input.scheme,
    messageId: ids.messageId,
    paymentInfoIdOf: ids.paymentInfoIdOf,
    emptySequence: input.sequence,
    createdAt: input.createdAt,
    requestedCollectionDay: input.requestedCollectionDay,
    banner: null,
    debits: [
      {
        sequence: input.sequence,
        endToEndId: ids.endToEndId,
        debtorName: input.debtorName,
        amountCents: input.amountCents,
        mandate: input.mandate,
        remittance: input.remittance,
      },
    ],
  });
  return { messageId: ids.messageId, endToEndId: ids.endToEndId, xml, sha256: sha256Of(xml) };
}

/** Le libellé tel qu'il sortira : jeu SEPA, 140 caractères, défaut si vide. */
export function testRemittanceOf(raw: string | null): string {
  const text = raw === null ? "" : sepa(raw).slice(0, REMITTANCE_MAX);
  return raw === null || raw.trim() === "" ? DEFAULT_TEST_REMITTANCE : text;
}

const REMITTANCE_MAX = 140;
