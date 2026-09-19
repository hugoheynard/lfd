import { z } from "zod";

import { mandateStatusSchema } from "../payment-mandate.js";
import {
  day,
  days,
  fact,
  named,
  payload,
  ref,
  subjectLabel,
  type JournalFactFamily,
} from "./fact.js";

/**
 * **La comptabilité** — notre entité émettrice et les mandats SEPA qui nous
 * autorisent à prélever. Jamais une coordonnée bancaire : un compte se
 * reconnaît à ses quatre derniers caractères, un mandat à sa RUM.
 *
 * Lot B du plan des phrases (2026-09-19) : chaque fait porte le nom de son
 * sujet au moment du fait (`subjectLabel`, D6) — le nom de l'entité, la RUM du
 * mandat, le titulaire du RIB — et la société qu'un mandat engage y est citée
 * avec son nom du moment (D5). Les formes d'avant restent dans `history`.
 */

/**
 * Ajoute le nom du sujet à une charge, et garde la forme d'avant en historique :
 * la plupart des charges de la famille ont changé de cette seule façon.
 */
function labelled<S extends z.ZodRawShape>(shape: S) {
  return fact(payload({ subjectLabel: subjectLabel(), ...shape }), [payload(shape)]);
}

const sepaScheme = () => z.enum(["CORE", "B2B"]);

/** Qui a agi : un agent, ou le client lui-même. */
const actorChannel = () => z.enum(["staff", "customer"]);

/**
 * Le mandat, et la société qu'il engage — citée avec son nom du moment.
 * `subjectLabel` : la RUM, le nom que le débiteur a sur son papier.
 */
const mandate = {
  subjectLabel: subjectLabel(),
  company: named("company"),
  /** La RUM — la référence que le débiteur a sur son papier. */
  reference: z.string(),
};

/** La forme d'avant le lot B : la société par son seul identifiant. */
const mandateBefore = {
  companyId: ref("company"),
  reference: z.string(),
};

const draftVoidingCause = () =>
  z.enum([
    "bank_account_changed",
    "mandate_options_changed",
    "mandate_scheme_changed",
    "mandate_defaults_changed",
  ]);

export const ACCOUNTING_FACTS = {
  /** `subjectLabel` : le nom de l'entité — le même que `name` à sa déclaration. */
  "legal_entity.declared": labelled({ name: z.string(), siren: z.string() }),
  /** Le nom APRÈS correction : les documents émis ont pris copie de l'ancien. */
  "legal_entity.corrected": labelled({ name: z.string() }),
  /** L'ICS — donnée publique, attribuée une seule fois. */
  "legal_entity.creditor_identifier_assigned": labelled({ ics: z.string() }),
  "legal_entity.creditor_account_changed": labelled({ last4: z.string() }),
  "legal_entity.pre_notification_changed": labelled({ days: days() }),
  "legal_entity.mandate_scheme_changed": labelled({ from: sepaScheme(), to: sepaScheme() }),
  "legal_entity.archived": labelled({}),
  "legal_entity.restored": labelled({}),

  "payment_mandate.minted": fact(payload({ ...mandate, via: actorChannel() }), [
    payload({ ...mandateBefore, via: actorChannel() }),
  ]),
  "payment_mandate.proof_attached": fact(
    payload({ ...mandate, fileName: z.string(), via: actorChannel() }),
    [payload({ ...mandateBefore, fileName: z.string(), via: actorChannel() })],
  ),
  "payment_mandate.signed": fact(
    payload({
      ...mandate,
      /** La date du PAPIER ; l'instant de la saisie est celui de la ligne. */
      signedAt: day(),
      /** Le mandat actif révoqué dans la même transaction, s'il y en avait un — nommé par sa RUM. */
      replacedMandate: named("payment_mandate").nullable(),
    }),
    [
      payload({
        ...mandateBefore,
        signedAt: day(),
        replacedMandateId: ref("payment_mandate").nullable(),
      }),
    ],
  ),
  /** L'identifiant du fournisseur d'e-mail ; `null` en mode à blanc. */
  "payment_mandate.sent": fact(payload({ ...mandate, providerId: z.string().nullable() }), [
    payload({ ...mandateBefore, providerId: z.string().nullable() }),
  ]),
  "payment_mandate.revoked": fact(
    payload({ ...mandate, previousStatus: mandateStatusSchema, via: z.literal("staff") }),
    [payload({ ...mandateBefore, previousStatus: mandateStatusSchema, via: z.literal("staff") })],
  ),
  "payment_mandate.draft_voided": fact(
    payload({ ...mandate, cause: draftVoidingCause(), via: actorChannel() }),
    [payload({ ...mandateBefore, cause: draftVoidingCause(), via: actorChannel() })],
  ),
  /**
   * Le sujet est le RIB (`company_bank_account`) : les zones 14 et 19 vivent sur
   * sa ligne. `subjectLabel` : son titulaire, le nom sous lequel l'écran le montre.
   */
  "payment_mandate.options_changed": fact(
    payload({
      subjectLabel: subjectLabel(),
      company: named("company"),
      debtorReference: z.string(),
      contractNumber: z.string(),
      via: actorChannel(),
    }),
    [
      payload({
        companyId: ref("company"),
        debtorReference: z.string(),
        contractNumber: z.string(),
        via: actorChannel(),
      }),
    ],
  ),
  "payment_mandate.proof_purged": fact(
    payload({ ...mandate, cause: z.enum(["proof_replaced", "draft_voided"]) }),
    [payload({ ...mandateBefore, cause: z.enum(["proof_replaced", "draft_voided"]) })],
  ),
} as const satisfies JournalFactFamily;
