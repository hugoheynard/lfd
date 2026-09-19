import { z } from "zod";

import { mandateStatusSchema } from "../payment-mandate.js";
import { day, days, empty, fact, payload, ref, type JournalFactFamily } from "./fact.js";

/**
 * **La comptabilité** — notre entité émettrice et les mandats SEPA qui nous
 * autorisent à prélever. Jamais une coordonnée bancaire : un compte se
 * reconnaît à ses quatre derniers caractères, un mandat à sa RUM.
 */

const sepaScheme = () => z.enum(["CORE", "B2B"]);

/** Qui a agi : un agent, ou le client lui-même. */
const actorChannel = () => z.enum(["staff", "customer"]);

/** Le mandat, et la société qu'il engage. */
const mandate = {
  companyId: ref("company"),
  /** La RUM — la référence que le débiteur a sur son papier. */
  reference: z.string(),
};

export const ACCOUNTING_FACTS = {
  "legal_entity.declared": fact(payload({ name: z.string(), siren: z.string() })),
  /** Le nom APRÈS correction : les documents émis ont pris copie de l'ancien. */
  "legal_entity.corrected": fact(payload({ name: z.string() })),
  /** L'ICS — donnée publique, attribuée une seule fois. */
  "legal_entity.creditor_identifier_assigned": fact(payload({ ics: z.string() })),
  "legal_entity.creditor_account_changed": fact(payload({ last4: z.string() })),
  "legal_entity.pre_notification_changed": fact(payload({ days: days() })),
  "legal_entity.mandate_scheme_changed": fact(payload({ from: sepaScheme(), to: sepaScheme() })),
  "legal_entity.archived": fact(empty()),
  "legal_entity.restored": fact(empty()),

  "payment_mandate.minted": fact(payload({ ...mandate, via: actorChannel() })),
  "payment_mandate.proof_attached": fact(
    payload({ ...mandate, fileName: z.string(), via: actorChannel() }),
  ),
  "payment_mandate.signed": fact(
    payload({
      ...mandate,
      /** La date du PAPIER ; l'instant de la saisie est celui de la ligne. */
      signedAt: day(),
      /** Le mandat actif révoqué dans la même transaction, s'il y en avait un. */
      replacedMandateId: ref("payment_mandate").nullable(),
    }),
  ),
  /** L'identifiant du fournisseur d'e-mail ; `null` en mode à blanc. */
  "payment_mandate.sent": fact(payload({ ...mandate, providerId: z.string().nullable() })),
  "payment_mandate.revoked": fact(
    payload({ ...mandate, previousStatus: mandateStatusSchema, via: z.literal("staff") }),
  ),
  "payment_mandate.draft_voided": fact(
    payload({
      ...mandate,
      cause: z.enum([
        "bank_account_changed",
        "mandate_options_changed",
        "mandate_scheme_changed",
        "mandate_defaults_changed",
      ]),
      via: actorChannel(),
    }),
  ),
  /** Le sujet est le RIB (`company_bank_account`) : les zones 14 et 19 vivent sur sa ligne. */
  "payment_mandate.options_changed": fact(
    payload({
      companyId: ref("company"),
      debtorReference: z.string(),
      contractNumber: z.string(),
      via: actorChannel(),
    }),
  ),
  "payment_mandate.proof_purged": fact(
    payload({ ...mandate, cause: z.enum(["proof_replaced", "draft_voided"]) }),
  ),
} as const satisfies JournalFactFamily;
