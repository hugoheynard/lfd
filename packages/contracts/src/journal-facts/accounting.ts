import { z } from "zod";

import { mandateStatusSchema } from "../payment-mandate.js";
import {
  cents,
  count,
  day,
  days,
  fact,
  instant,
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

  /**
   * Un lien de paiement libre est créé (plan liens de paiement §2b). Sujet :
   * la société à qui il s'adresse (`subjectLabel` = son nom) ; le lien est
   * cité par son libellé, celui que le client lit sur la page Stripe.
   */
  "payment_link.created": fact(
    payload({
      subjectLabel: subjectLabel(),
      paymentLink: named("payment_link"),
      amountCents: cents(),
    }),
  ),
  /** Le staff l'a retiré avant règlement. */
  "payment_link.cancelled": fact(
    payload({
      subjectLabel: subjectLabel(),
      paymentLink: named("payment_link"),
      amountCents: cents(),
    }),
  ),
  /**
   * Le plafond d'un lien libre, posé par la comptabilité (Hugo, 2026-09-25).
   * `null` = aucun plafond. `subjectLabel` : le nom du réglage — une ligne
   * unique n'en a pas d'autre.
   */
  "accounting_settings.payment_link_cap_set": fact(
    payload({
      subjectLabel: subjectLabel(),
      from: cents().nullable(),
      to: cents().nullable(),
    }),
  ),

  // ─── La fidélité (plan `plan-points-de-fidelite.md`, lot A, 2026-09-26) ───
  // Sujet : le TITULAIRE — la société (`company`) ou la personne (`user`),
  // `subjectLabel` = son nom, omis plutôt qu'inventé quand une personne n'en a
  // pas (même règle que les faits d'une personne). Un bon se cite par un nom
  // qui dit son montant : il n'en a pas d'autre.

  /**
   * Le réglage du programme, posé en entier par la comptabilité. Sujet :
   * `loyalty_settings`, `subjectLabel` = le nom du réglage.
   */
  "loyalty_settings.set": fact(
    payload({
      subjectLabel: subjectLabel(),
      pointsPerStep: count(),
      stepValueCents: cents(),
      openToPublic: z.boolean(),
      openToPro: z.boolean(),
      voucherValidityDays: days(),
    }),
  ),
  /** Une commande remise et réglée a rapporté des points (lot D). */
  "loyalty.points_earned": fact(
    payload({ subjectLabel: subjectLabel().optional(), points: count(), order: named("order") }),
  ),
  /**
   * Un geste motivé du staff sur le livre — signé. `voucher` cite le bon dont
   * l'annulation a recrédité les points ; `null` pour un ajustement libre.
   */
  "loyalty.points_adjusted": fact(
    payload({
      subjectLabel: subjectLabel().optional(),
      points: z.number().int(),
      reason: z.string(),
      voucher: named("loyalty_voucher").nullable(),
    }),
  ),
  /** Des points convertis en bon de fidélité : son montant, son coût, sa date limite. */
  "loyalty.voucher_issued": fact(
    payload({
      subjectLabel: subjectLabel().optional(),
      voucher: named("loyalty_voucher"),
      valueCents: cents(),
      pointsCost: count(),
      expiresAt: instant(),
    }),
  ),
  /** Un bon disponible a passé sa date limite. */
  "loyalty.voucher_expired": fact(
    payload({
      subjectLabel: subjectLabel().optional(),
      voucher: named("loyalty_voucher"),
      valueCents: cents(),
    }),
  ),
  /** Le staff a annulé un bon disponible ; ses points sont recrédités à part. */
  "loyalty.voucher_cancelled": fact(
    payload({
      subjectLabel: subjectLabel().optional(),
      voucher: named("loyalty_voucher"),
      valueCents: cents(),
      pointsCost: count(),
      reason: z.string(),
    }),
  ),
  /**
   * Le reliquat d'un bon consommé (lot C) : un nouveau bon du même titulaire,
   * sans coût en points, qui garde la date limite de `parent`.
   */
  "loyalty.voucher_remainder_issued": fact(
    payload({
      subjectLabel: subjectLabel().optional(),
      voucher: named("loyalty_voucher"),
      parent: named("loyalty_voucher"),
      order: named("order"),
      valueCents: cents(),
      expiresAt: instant(),
    }),
  ),
  /**
   * Le reliquat d'un bon s'est éteint : sa date limite était passée quand la
   * commande est devenue définitive (plan des points, §11 bis B2). Le montant
   * dit ce qui s'est perdu, comme l'aurait fait l'expiration du bon inutilisé.
   */
  "loyalty.voucher_remainder_lapsed": fact(
    payload({
      subjectLabel: subjectLabel().optional(),
      voucher: named("loyalty_voucher"),
      order: named("order"),
      remainderCents: cents(),
    }),
  ),
} as const satisfies JournalFactFamily;
