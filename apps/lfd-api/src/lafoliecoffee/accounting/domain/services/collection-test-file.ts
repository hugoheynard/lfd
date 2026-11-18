import { instantToLocal } from "@lfd/contracts";

import type { CreditorSnapshot } from "../creditor-snapshot.js";
import {
  renderPain008Document,
  sepa,
  type DocumentMandate,
  type TestSequence,
} from "./pain008-document.js";
import { sha256Of } from "./collection-batch-file.js";
import { testFileSepaIdentifiers } from "./collection-test-identifiers.js";
import { businessDaysAfter } from "./target2-calendar.js";
import type { SepaScheme } from "../value-objects/sepa-scheme.js";

/** Le libellé (`RmtInf/Ustrd`) quand le staff n'en donne pas (plan §1). */
export const DEFAULT_TEST_REMITTANCE = "ESSAI PRELEVEMENT";

/**
 * Le délai minimal d'un essai, en jours ouvrés TARGET2 après le jour (Paris)
 * de la génération.
 *
 * 2 est notre hypothèse du 2026-10-22 (Hugo) : la pré-notification du
 * débiteur est levée par décision écrite pour nos établissements (Q6), il ne
 * reste que le délai de la banque, que `question-banque.md` 3.4 lui demande.
 * À ajuster ici seul quand elle aura répondu.
 */
export const TEST_COLLECTION_MIN_BUSINESS_DAYS = 2;

/**
 * L'échéance la plus proche qu'un essai admet, et celle que l'écran propose :
 * J + `TEST_COLLECTION_MIN_BUSINESS_DAYS` jours ouvrés TARGET2, comptés depuis
 * le jour de Paris de la génération.
 *
 * Ce n'est PAS le calendrier des lots (`collectionDayOf`), qui inclut le
 * délai de pré-notification : sur nos propres établissements, il est levé
 * (Q6, plan §6). Les lots réels n'en changent pas.
 */
export function earliestTestCollectionDay(at: Date): string {
  return businessDaysAfter(instantToLocal(at).day, TEST_COLLECTION_MIN_BUSINESS_DAYS);
}

/** Le jour local de Paris d'un instant — pour comparer à une échéance. */
export function parisDayOf(at: Date): string {
  return instantToLocal(at).day;
}

/** Un débit de l'envoi : sa ligne d'essai, déjà jugée. */
export interface TestFileDebit {
  readonly endToEndId: string;
  readonly sequence: TestSequence;
  readonly debtorName: string;
  readonly amountCents: number;
  readonly mandate: DocumentMandate;
}

export interface TestFileInput {
  readonly fileId: string;
  readonly creditor: CreditorSnapshot;
  readonly scheme: SepaScheme;
  /** `CreDtTm` — l'instant de la génération. */
  readonly createdAt: Date;
  readonly requestedCollectionDay: string;
  /** Déjà passé au jeu SEPA, non vide — commun à toutes les lignes. */
  readonly remittance: string;
  /** Au moins un : un fichier d'essai vide n'a rien à éprouver. */
  readonly debits: readonly [TestFileDebit, ...TestFileDebit[]];
}

export interface TestFile {
  readonly messageId: string;
  readonly xml: string;
  readonly sha256: string;
}

/**
 * **Le fichier d'un envoi d'essai** — ses débits, rendus par le MÊME rendu
 * que les lots (`renderPain008Document`, un `PmtInf` par séquence), sans
 * bandeau : il est déposable, c'est tout son objet. Seuls changent ses
 * identifiants (`ESS-…`) et ses séquences, données plutôt que déduites du
 * mandat.
 */
export function renderTestFile(input: TestFileInput): TestFile {
  const ids = testFileSepaIdentifiers(input.fileId);
  const xml = renderPain008Document<TestSequence>({
    creditor: input.creditor,
    scheme: input.scheme,
    messageId: ids.messageId,
    paymentInfoIdOf: ids.paymentInfoIdOf,
    emptySequence: input.debits[0].sequence,
    createdAt: input.createdAt,
    requestedCollectionDay: input.requestedCollectionDay,
    banner: null,
    debits: input.debits.map((debit) => ({ ...debit, remittance: input.remittance })),
  });
  return { messageId: ids.messageId, xml, sha256: sha256Of(xml) };
}

/** Le libellé tel qu'il sortira : jeu SEPA, 140 caractères, défaut si vide. */
export function testRemittanceOf(raw: string | null): string {
  const text = raw === null ? "" : sepa(raw).slice(0, REMITTANCE_MAX);
  return raw === null || raw.trim() === "" ? DEFAULT_TEST_REMITTANCE : text;
}

const REMITTANCE_MAX = 140;
