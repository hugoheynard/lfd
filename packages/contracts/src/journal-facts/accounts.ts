import { z } from "zod";

import { deferredTermSchema } from "../company.js";
import { fulfillmentMethodSchema } from "../order.js";
import { recurrenceSchema, subscriptionStatusSchema } from "../subscription.js";
import {
  count,
  day,
  empty,
  fact,
  instant,
  payload,
  ref,
  retired,
  type JournalFactFamily,
} from "./fact.js";

/**
 * **Les comptes et les paniers** — une société, les personnes qui y entrent,
 * leurs paniers récurrents, leurs demandes de contact, et les accès aux
 * fonctionnalités. Écrits par `publishTraced` (actes du staff et gestes du
 * client) ou par les abonnés de la croissance (parcours d'inscription).
 */

/** Une adresse, réduite à ce qui la reconnaît sans ses coordonnées. */
const place = { ville: z.string(), codePostal: z.string() };

/** Qui a agi sur le RIB ou le mandat : un agent, ou le client lui-même. */
const actorChannel = () => z.enum(["staff", "customer"]);

/** Un RIB se reconnaît à ses quatre derniers caractères et son titulaire — jamais l'IBAN. */
const bankAccountTrace = () => payload({ last4: z.string(), holder: z.string() });

/** Le geste fait sur une procédure de livraison — pas ce qui a été écrit. */
const procedureAction = () => z.enum(["step_added", "step_revised", "step_removed", "reordered"]);

/** Une échéance dérogée : sautée, ou livrée avec d'autres lignes. */
const occurrenceOverride = () =>
  payload({
    skipped: z.boolean(),
    lines: z.array(payload({ sku: z.string(), quantity: count() })),
  });

export const ACCOUNTS_AND_CARTS_FACTS = {
  /** Le client s'est déclaré — `via` dit par qui : lui-même, ou le staff. */
  "company.declared": fact(
    payload({ via: z.enum(["self", "staff"]), ownerUserId: ref("user").nullable() }),
  ),
  "company.step_reached": fact(payload({ step: z.enum(["vat", "kbis", "billing", "delivery"]) })),
  "company.activated": fact(payload({ activatedAt: instant() })),
  "company.kbis_certified": fact(payload({ at: instant() })),
  /** `suspended` : le compte, actif, a été coupé par le retrait. */
  "company.kbis_revoked": fact(payload({ at: instant(), suspended: z.boolean() })),
  "company.kbis_uploaded": fact(payload({ fileName: z.string() })),
  /**
   * Renommé `company.kbis_uploaded` le 2026-09-19 (`d62134a8`) sans migration :
   * les lignes d'avant gardent ce nom.
   */
  "company.kbis_uploaded_by_staff": retired(payload({ fileName: z.string() })),
  "company.identity_corrected": fact(
    payload({
      raisonSociale: z.string(),
      formeJuridique: z.string(),
      siret: z.string(),
      siren: z.string(),
    }),
  ),
  "company.identity_edited": fact(payload({ fields: z.array(z.string()) })),
  "company.payment_terms_granted": fact(payload({ terms: z.array(deferredTermSchema) })),
  "company.payment_term_requested": fact(
    payload({ before: deferredTermSchema.nullable(), after: deferredTermSchema.nullable() }),
  ),
  "company.status_changed": fact(
    payload({ action: z.enum(["suspend", "reactivate", "terminate"]) }),
  ),
  "company.billing_address_saved": fact(payload(place)),
  "company.delivery_address_added": fact(payload({ addressId: ref("delivery_address"), ...place })),
  "company.delivery_address_updated": fact(
    payload({ addressId: ref("delivery_address"), ...place }),
  ),
  "company.delivery_address_removed": fact(payload({ addressId: ref("delivery_address") })),
  "company.default_delivery_set": fact(payload({ addressId: ref("delivery_address") })),
  "company.delivery_procedure_edited": fact(
    payload({
      companyId: ref("company"),
      addressId: ref("delivery_address"),
      action: procedureAction(),
    }),
  ),
  /**
   * Renommé `company.delivery_procedure_edited` le 2026-09-19 (`d62134a8`) sans
   * migration : les lignes d'avant gardent ce nom.
   */
  "company.delivery_procedure_edited_by_staff": retired(
    payload({
      companyId: ref("company"),
      addressId: ref("delivery_address"),
      action: procedureAction(),
    }),
  ),
  "company.fulfillment_preference_set": fact(
    payload({
      method: fulfillmentMethodSchema.nullable(),
      pickupAddressId: ref("pickup_address").nullable(),
      deliveryAddressId: ref("delivery_address").nullable(),
      signatureRequired: z.boolean(),
    }),
  ),
  "company.contact_added": fact(payload({ contactId: ref("company_contact"), role: z.string() })),
  "company.contact_updated": fact(payload({ contactId: ref("company_contact"), role: z.string() })),
  "company.contact_removed": fact(payload({ contactId: ref("company_contact") })),
  "company.primary_contact_changed": fact(empty()),
  "company.access_opened": fact(payload({ userId: ref("user"), role: z.string() })),
  "company.bank_account_changed": fact(
    payload({
      bankAccountId: ref("company_bank_account"),
      /** `null` sur un premier dépôt. */
      before: bankAccountTrace().nullable(),
      after: bankAccountTrace(),
      via: actorChannel(),
    }),
  ),
  "company.client_note_edited_by_staff": fact(
    payload({
      companyId: ref("company"),
      /** Absente pour un réordonnancement : il touche toutes les notes. */
      noteId: ref("client_note").optional(),
      action: z.enum(["note_added", "note_revised", "note_removed", "notes_reordered"]),
    }),
  ),

  "user.registered": fact(payload({ email: z.string() })),
  /** Les champs modifiés, jamais leurs valeurs. */
  "user.profile_updated": fact(payload({ fields: z.array(z.string()) })),
  "user.password_link_issued": fact(empty()),

  "subscription.created": fact(
    payload({ subscriptionId: ref("subscription"), recurrence: recurrenceSchema }),
  ),
  "subscription.status_changed": fact(
    payload({ before: subscriptionStatusSchema, after: subscriptionStatusSchema }),
  ),
  "subscription.occurrence_overridden": fact(
    payload({
      date: day(),
      before: occurrenceOverride().nullable(),
      after: occurrenceOverride(),
    }),
  ),
  /** Ce que le panier décidait, sans coordonnée ni texte libre. */
  "subscription.deleted": fact(
    payload({
      recurrence: recurrenceSchema,
      status: subscriptionStatusSchema,
      startDate: day(),
      endDate: day().nullable(),
      fulfillmentMethod: fulfillmentMethodSchema,
      pickupAddressId: ref("pickup_address").nullable(),
      lines: z.array(payload({ sku: z.string(), quantity: count() })),
    }),
  ),

  "support.requested": fact(
    payload({ supportRequestId: ref("support_request"), channel: z.string() }),
  ),
  "support.handled": fact(payload({ supportRequestId: ref("support_request") })),

  /** Le sujet est la clé de la fonctionnalité. */
  "feature_access.override_set": fact(
    payload({ value: z.string(), previousValue: z.string().nullable() }),
  ),
  "feature_access.override_cleared": fact(payload({ previousValue: z.string() })),
  "feature_access.exemption_added": fact(
    payload({ exemptionId: ref("feature_exemption"), email: z.string() }),
  ),
  "feature_access.exemption_removed": fact(
    payload({ exemptionId: ref("feature_exemption"), email: z.string() }),
  ),
} as const satisfies JournalFactFamily;
