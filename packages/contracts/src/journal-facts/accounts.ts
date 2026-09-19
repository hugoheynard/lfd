import { z } from "zod";

import { deferredTermSchema } from "../company.js";
import { companyMemberRoleSchema } from "../company-member.js";
import { fulfillmentMethodSchema } from "../order.js";
import { recurrenceSchema, subscriptionStatusSchema } from "../subscription.js";
import { supportChannelSchema } from "../support.js";
import {
  count,
  day,
  empty,
  fact,
  instant,
  payload,
  ref,
  retired,
  subjectLabel,
  type JournalFactFamily,
} from "./fact.js";

/**
 * **Les comptes et les paniers** — une société, les personnes qui y entrent,
 * leurs paniers récurrents, leurs demandes de contact, et les accès aux
 * fonctionnalités. Écrits par `publishTraced` (actes du staff et gestes du
 * client) ou par les abonnés de la croissance (parcours d'inscription).
 *
 * Lot B du plan des phrases (2026-09-19) : un fait sur une société porte le
 * nom de la société au moment du fait (`subjectLabel`, D6) ; une adresse, un
 * contact ou une personne cités le sont avec leur nom du moment (D5). Les
 * formes d'avant restent dans `history` — le journal ne se réécrit pas.
 */

/**
 * Ajoute le nom du sujet à une charge, et garde la forme d'avant en historique :
 * la plupart des charges de la famille ont changé de cette seule façon.
 */
function labelled<S extends z.ZodRawShape>(shape: S) {
  return fact(payload({ subjectLabel: subjectLabel(), ...shape }), [payload(shape)]);
}

/**
 * Une **personne** citée (contact, membre, détenteur) : son id, et son nom du
 * moment **quand il est connu**. Un profil ou un contact peut n'en porter aucun
 * — le nom est facultatif dans le domaine — et l'e-mail n'en tient jamais lieu :
 * c'est une coordonnée. Écrit ici plutôt que dans `fact.ts` (lot B) : `named`
 * y exige un nom, et seule cette famille cite des personnes sans nom garanti.
 */
const person = (target: string) =>
  z.strictObject({ id: ref(target), name: z.string().min(1).optional() });

/** Une adresse, réduite à ce qui la reconnaît sans ses coordonnées. */
const place = { ville: z.string(), codePostal: z.string() };

/** Qui a agi sur le RIB ou le mandat : un agent, ou le client lui-même. */
const actorChannel = () => z.enum(["staff", "customer"]);

/** Un RIB se reconnaît à ses quatre derniers caractères et son titulaire — jamais l'IBAN. */
const bankAccountTrace = () => payload({ last4: z.string(), holder: z.string() });

/** Le geste fait sur une procédure de livraison — pas ce qui a été écrit. */
const procedureAction = () => z.enum(["step_added", "step_revised", "step_removed", "reordered"]);

/**
 * Une adresse de livraison **citée** : son id, sa ville et son code postal —
 * comme le staff la journalise (décision de Hugo du 2026-09-19, `a151ccee`,
 * `address-place.ts`). Jamais son libellé : c'est un texte libre, saisi par
 * le client, et rien ne garantit qu'il ne porte pas une coordonnée (un nom de
 * personne, un étage, un digicode). Ni le numéro ni la rue.
 */
const deliveryAddress = () =>
  z.strictObject({ id: ref("delivery_address"), ville: z.string(), codePostal: z.string() });

/**
 * Un geste sur une adresse de livraison, citée par son lieu ; l'id seul avant
 * le lot B. La ville et le code postal que les formes d'avant portaient à plat
 * (`...place`) sont désormais DANS l'adresse citée : une seule place pour eux.
 */
function addressCited(before: z.ZodRawShape) {
  return fact(payload({ subjectLabel: subjectLabel(), address: deliveryAddress() }), [
    payload({ addressId: ref("delivery_address"), ...before }),
  ]);
}

/** Un geste sur un contact, cité nommé quand il a un nom ; l'id seul avant le lot B. */
function contactCited<S extends z.ZodRawShape>(rest: S) {
  return fact(
    payload({ subjectLabel: subjectLabel(), contact: person("company_contact"), ...rest }),
    [payload({ contactId: ref("company_contact"), ...rest })],
  );
}

/**
 * Un geste sur un contact qui porte son rôle. Le rôle est un `CompanyMemberRole`
 * depuis le lot D (2026-09-19) ; il était typé `z.string()` avant, et les deux
 * formes d'alors restent lisibles en `history`. Les écrivains n'ont jamais
 * passé qu'un rôle du domaine (`AssignableRole`, `ContactAdded*Event`, vérifié
 * le 2026-09-19) — l'histoire n'est gardée que parce que le schéma, lui,
 * admettait plus.
 */
function contactWithRole() {
  const loose = contactCited({ role: z.string() });
  return fact(contactCited({ role: companyMemberRoleSchema }).payload, [
    loose.payload,
    ...loose.history,
  ]);
}

/**
 * Les champs d'identité qu'une société édite elle-même
 * (`update-company-identity.handler.ts`, `IDENTITY_FIELDS`, vérifié le
 * 2026-09-19).
 */
const companyIdentityField = () =>
  z.enum(["enseigne", "vatNumber", "raisonSociale", "formeJuridique", "siret", "siren"]);

/** Les champs d'un profil (`UserProfile.changedFieldsSince`, vérifié le 2026-09-19). */
const profileField = () => z.enum(["firstName", "lastName", "email", "phone"]);

/** Le geste fait sur le carnet de notes d'un client — jamais son contenu. */
const clientNoteAction = () =>
  z.enum(["note_added", "note_revised", "note_removed", "notes_reordered"]);

/** Une échéance dérogée : sautée, ou livrée avec d'autres lignes. */
const occurrenceOverride = () =>
  payload({
    skipped: z.boolean(),
    lines: z.array(payload({ sku: z.string(), quantity: count() })),
  });

export const ACCOUNTS_AND_CARTS_FACTS = {
  /**
   * Le client s'est déclaré — `via` dit par qui : lui-même, ou le staff.
   * `owner` : le détenteur, `null` quand le staff ouvre sans lui.
   */
  "company.declared": fact(
    payload({
      subjectLabel: subjectLabel(),
      via: z.enum(["self", "staff"]),
      owner: person("user").nullable(),
    }),
    [payload({ via: z.enum(["self", "staff"]), ownerUserId: ref("user").nullable() })],
  ),
  "company.step_reached": labelled({ step: z.enum(["vat", "kbis", "billing", "delivery"]) }),
  "company.activated": labelled({ activatedAt: instant() }),
  "company.kbis_certified": labelled({ at: instant() }),
  /** `suspended` : le compte, actif, a été coupé par le retrait. */
  "company.kbis_revoked": labelled({ at: instant(), suspended: z.boolean() }),
  "company.kbis_uploaded": labelled({ fileName: z.string() }),
  /**
   * Renommé `company.kbis_uploaded` le 2026-09-19 (`d62134a8`) sans migration :
   * les lignes d'avant gardent ce nom.
   */
  "company.kbis_uploaded_by_staff": retired(payload({ fileName: z.string() })),
  "company.identity_corrected": labelled({
    raisonSociale: z.string(),
    formeJuridique: z.string(),
    siret: z.string(),
    siren: z.string(),
  }),
  /**
   * Les champs, jamais leurs valeurs. Resserrés en énumération au lot D
   * (2026-09-19) : les formes où `fields` était une chaîne libre restent en
   * `history` — l'équipe y a figé des LIBELLÉS avant le 2026-09-18.
   */
  "company.identity_edited": fact(
    payload({ subjectLabel: subjectLabel(), fields: z.array(companyIdentityField()) }),
    [
      payload({ subjectLabel: subjectLabel(), fields: z.array(z.string()) }),
      payload({ fields: z.array(z.string()) }),
    ],
  ),
  "company.payment_terms_granted": labelled({ terms: z.array(deferredTermSchema) }),
  "company.payment_term_requested": labelled({
    before: deferredTermSchema.nullable(),
    after: deferredTermSchema.nullable(),
  }),
  "company.status_changed": labelled({
    action: z.enum(["suspend", "reactivate", "terminate"]),
  }),
  "company.billing_address_saved": labelled(place),
  "company.delivery_address_added": addressCited(place),
  "company.delivery_address_updated": addressCited(place),
  "company.delivery_address_removed": addressCited({}),
  "company.default_delivery_set": addressCited({}),
  /** La société est le sujet : la forme d'avant la répétait en `companyId`. */
  "company.delivery_procedure_edited": fact(
    payload({
      subjectLabel: subjectLabel(),
      address: deliveryAddress(),
      action: procedureAction(),
    }),
    [
      payload({
        companyId: ref("company"),
        addressId: ref("delivery_address"),
        action: procedureAction(),
      }),
    ],
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
  /**
   * ⚠️ `pickupAddressId` reste un identifiant nu : les comptes ne lisent pas les
   * points de retrait, qui vivent dans leur propre contexte (lot B, 2026-09-19).
   */
  "company.fulfillment_preference_set": fact(
    payload({
      subjectLabel: subjectLabel(),
      method: fulfillmentMethodSchema.nullable(),
      pickupAddressId: ref("pickup_address").nullable(),
      deliveryAddress: deliveryAddress().nullable(),
      signatureRequired: z.boolean(),
    }),
    [
      payload({
        method: fulfillmentMethodSchema.nullable(),
        pickupAddressId: ref("pickup_address").nullable(),
        deliveryAddressId: ref("delivery_address").nullable(),
        signatureRequired: z.boolean(),
      }),
    ],
  ),
  "company.contact_added": contactWithRole(),
  "company.contact_updated": contactWithRole(),
  /** Le retrait ne relit pas la fiche qu'il efface : le contact y est cité par son seul id. */
  "company.contact_removed": contactCited({}),
  "company.primary_contact_changed": labelled({}),
  /** Le rôle resserré au lot D (2026-09-19) : les formes à chaîne libre restent en `history`. */
  "company.access_opened": fact(
    payload({
      subjectLabel: subjectLabel(),
      person: person("user"),
      role: companyMemberRoleSchema,
    }),
    [
      payload({ subjectLabel: subjectLabel(), person: person("user"), role: z.string() }),
      payload({ userId: ref("user"), role: z.string() }),
    ],
  ),
  "company.bank_account_changed": labelled({
    bankAccountId: ref("company_bank_account"),
    /** `null` sur un premier dépôt. */
    before: bankAccountTrace().nullable(),
    after: bankAccountTrace(),
    via: actorChannel(),
  }),
  /**
   * La société est le sujet : la forme d'avant la répétait en `companyId`.
   * ⚠️ `noteId` reste un identifiant nu : le nom d'une note est son titre, et
   * aucun contenu de note n'entre au journal (plan des notes photo, D6).
   */
  "company.client_note_edited_by_staff": fact(
    payload({
      subjectLabel: subjectLabel(),
      /** Absente pour un réordonnancement : il touche toutes les notes. */
      noteId: ref("client_note").optional(),
      action: clientNoteAction(),
    }),
    [
      payload({
        companyId: ref("company"),
        noteId: ref("client_note").optional(),
        action: clientNoteAction(),
      }),
    ],
  ),

  /**
   * Une personne s'est inscrite. `subjectLabel` : son nom si l'inscription le
   * porte — ce qui n'arrive pas aujourd'hui, la fiche naît de la seule
   * identité du jeton —, sinon absent. **Jamais son e-mail** : il en est sorti
   * le 2026-09-19 (lot B), et la file des prospects le lit désormais dans la
   * table des personnes (`CustomerEmailReader`). Les lignes d'avant le portent
   * encore : leur forme est dans l'histoire, et la file s'en sert en dernier
   * recours pour une personne que la table ne connaît plus.
   */
  "user.registered": fact(payload({ subjectLabel: subjectLabel().optional() }), [
    payload({ email: z.string() }),
  ]),
  /**
   * Les champs modifiés, jamais leurs valeurs. `subjectLabel` : le nom de la
   * personne APRÈS le geste, absent si son profil n'en porte pas.
   */
  "user.profile_updated": fact(
    payload({ subjectLabel: subjectLabel().optional(), fields: z.array(profileField()) }),
    [
      payload({ subjectLabel: subjectLabel().optional(), fields: z.array(z.string()) }),
      payload({ fields: z.array(z.string()) }),
    ],
  ),
  /** `subjectLabel` absent si le profil de la personne ne porte pas de nom. */
  "user.password_link_issued": fact(payload({ subjectLabel: subjectLabel().optional() }), [
    empty(),
  ]),

  /**
   * Le sujet est la PERSONNE qui ouvre le panier. `subjectLabel` : son nom,
   * absent si sa fiche n'en porte pas — jamais son adresse.
   */
  "subscription.created": fact(
    payload({
      subjectLabel: subjectLabel().optional(),
      subscriptionId: ref("subscription"),
      recurrence: recurrenceSchema,
    }),
    [payload({ subscriptionId: ref("subscription"), recurrence: recurrenceSchema })],
  ),
  /** ⚠️ Sans `subjectLabel` : un panier récurrent n'a pas de nom. */
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
  /**
   * Ce que le panier décidait, sans coordonnée ni texte libre. ⚠️
   * `pickupAddressId` reste un identifiant nu : les paniers ne lisent pas les
   * points de retrait (lot B, 2026-09-19).
   */
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

  /**
   * Le sujet est la société, à défaut la personne. `subjectLabel` : le nom de
   * la société, ou celui de la personne — absent si elle n'en porte pas.
   */
  "support.requested": fact(
    payload({
      subjectLabel: subjectLabel().optional(),
      supportRequestId: ref("support_request"),
      channel: supportChannelSchema,
    }),
    [
      payload({
        subjectLabel: subjectLabel().optional(),
        supportRequestId: ref("support_request"),
        channel: z.string(),
      }),
      payload({ supportRequestId: ref("support_request"), channel: z.string() }),
    ],
  ),
  "support.handled": fact(
    payload({ subjectLabel: subjectLabel().optional(), supportRequestId: ref("support_request") }),
    [payload({ supportRequestId: ref("support_request") })],
  ),

  /** Le sujet est la clé de la fonctionnalité ; son libellé, celui du catalogue fermé. */
  "feature_access.override_set": labelled({
    value: z.string(),
    previousValue: z.string().nullable(),
  }),
  "feature_access.override_cleared": labelled({ previousValue: z.string() }),
  /**
   * 🔴 Porte encore l'adresse exemptée en clair, contre la règle « jamais de
   * coordonnées au journal » : l'exemption retirée est SUPPRIMÉE de sa table,
   * et le journal est alors la seule mémoire de l'adresse qu'elle ouvrait.
   * Mis de côté par Hugo le 2026-09-19 (`8bef9b98`) :
   * `documentation/journalisation/todo-derogations-d-acces.md`.
   */
  "feature_access.exemption_added": labelled({
    exemptionId: ref("feature_exemption"),
    email: z.string(),
  }),
  "feature_access.exemption_removed": labelled({
    exemptionId: ref("feature_exemption"),
    email: z.string(),
  }),
} as const satisfies JournalFactFamily;
