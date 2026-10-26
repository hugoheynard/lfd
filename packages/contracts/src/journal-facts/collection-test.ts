import { z } from "zod";

import { cents, day, fact, named, payload, subjectLabel } from "./fact.js";

/**
 * **Le prélèvement d'essai et nos établissements** (plan
 * `documentation/comptabilite/prelevement/plan-prelevement-d-essai.md`) —
 * rangés dans la famille `accounting`, où l'étale `accounting.ts`.
 *
 * Sujet : la SOCIÉTÉ (`company`), nommée par sa raison sociale — un essai se
 * reconnaît à son débiteur et à son `MsgId` (`ESS-…`). Jamais un IBAN ni une
 * RUM en clair ici.
 */

const establishment = { subjectLabel: subjectLabel() };

const test = {
  subjectLabel: subjectLabel(),
  /** `ESS-<ULID>` — la référence que la banque renverra. */
  messageId: z.string().min(1),
  amountCents: cents(),
};

export const COLLECTION_TEST_FACTS = {
  /** La société est déclarée parmi nos établissements (Q1) : on peut l'essayer. */
  "collection.own_establishment_declared": fact(payload(establishment)),
  /** Elle n'en est plus : aucun essai ne la vise désormais. */
  "collection.own_establishment_withdrawn": fact(payload(establishment)),
  /** Un fichier d'essai est généré et gardé — il se télécharge, il ne se dépose pas. */
  "collection.test_generated": fact(
    payload({
      ...test,
      legalEntity: named("legal_entity"),
      scheme: z.enum(["CORE", "B2B"]),
      sequence: z.enum(["RCUR", "FRST", "OOFF"]),
      collectionDay: day(),
    }),
  ),
  /** « Marqué remboursé » (Q4) : le jour du virement rendu à l'établissement. */
  "collection.test_refunded": fact(payload({ ...test, refundedOn: day() })),
  /** La banque a rejeté ou retourné l'essai : son retour lui est rattaché. */
  "collection.test_returned": fact(
    payload({
      ...test,
      kind: z.enum(["reject", "return", "refund_request"]),
      reasonCode: z.string(),
      reason: z.string(),
      returnedOn: day(),
      source: z.enum(["manual", "pain002", "camt054"]),
    }),
  ),
  /**
   * Le RIB de l'établissement est sorti, en clair, dans le fichier des comptes
   * destinataires — depuis l'essai, sans figer aucun export (2026-10-26).
   */
  "collection.test_bank_account_exported": fact(
    payload({ subjectLabel: subjectLabel(), legalEntity: named("legal_entity") }),
  ),
} as const;
