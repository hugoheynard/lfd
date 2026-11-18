import { z } from "zod";

import { cents, day, fact, named, payload, subjectLabel } from "./fact.js";

/**
 * **Le prélèvement d'essai et nos établissements** (plan
 * `documentation/comptabilite/prelevement/plan-prelevement-d-essai.md`) —
 * rangés dans la famille `accounting`, où l'étale `accounting.ts`.
 *
 * Sujet : la SOCIÉTÉ (`company`), nommée par sa raison sociale — un essai se
 * reconnaît à son débiteur, au `MsgId` de son envoi et à son `EndToEndId`
 * (`ESS-…`). Jamais un IBAN ni une RUM en clair ici.
 */

const establishment = { subjectLabel: subjectLabel() };

/** La forme d'avant l'envoi à plusieurs débiteurs : un fichier par essai. */
const singleFileTest = {
  subjectLabel: subjectLabel(),
  /** `ESS-<ULID de l'essai>` — `MsgId` et `EndToEndId` étaient égaux. */
  messageId: z.string().min(1),
  amountCents: cents(),
};

const test = {
  ...singleFileTest,
  /** `ESS-<ULID de l'envoi>` — le `MsgId` du fichier déposé. */
  messageId: z.string().min(1),
  /** `ESS-<ULID de l'essai>` — la ligne, que le retour de la banque cite. */
  endToEndId: z.string().min(1),
};

const generatedShape = {
  legalEntity: named("legal_entity"),
  scheme: z.enum(["CORE", "B2B"]),
  sequence: z.enum(["RCUR", "FRST", "OOFF"]),
  collectionDay: day(),
};

const returnedShape = {
  kind: z.enum(["reject", "return", "refund_request"]),
  reasonCode: z.string(),
  reason: z.string(),
  returnedOn: day(),
  source: z.enum(["manual", "pain002", "camt054"]),
};

export const COLLECTION_TEST_FACTS = {
  /** La société est déclarée parmi nos établissements (Q1) : on peut l'essayer. */
  "collection.own_establishment_declared": fact(payload(establishment)),
  /** Elle n'en est plus : aucun essai ne la vise désormais. */
  "collection.own_establishment_withdrawn": fact(payload(establishment)),
  /**
   * Un essai est généré, ligne d'un envoi dont le fichier est gardé — il se
   * télécharge, il ne se dépose pas. Un fait par ligne ; `fileId` nomme l'envoi.
   */
  "collection.test_generated": fact(
    payload({ ...test, fileId: z.string().min(1), ...generatedShape }),
    [payload({ ...singleFileTest, ...generatedShape })],
  ),
  /** « Marqué remboursé » (Q4) : le jour du virement rendu à l'établissement. */
  "collection.test_refunded": fact(payload({ ...test, refundedOn: day() }), [
    payload({ ...singleFileTest, refundedOn: day() }),
  ]),
  /** La banque a rejeté ou retourné l'essai : son retour lui est rattaché. */
  "collection.test_returned": fact(payload({ ...test, ...returnedShape }), [
    payload({ ...singleFileTest, ...returnedShape }),
  ]),
  /**
   * Le RIB de l'établissement est sorti, en clair, dans le fichier des comptes
   * destinataires — depuis l'essai, sans figer aucun export (2026-10-26).
   */
  "collection.test_bank_account_exported": fact(
    payload({ subjectLabel: subjectLabel(), legalEntity: named("legal_entity") }),
  ),
} as const;
