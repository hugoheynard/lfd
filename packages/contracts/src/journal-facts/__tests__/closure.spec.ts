import { z } from "zod";

import { JOURNAL_FACT_TYPES, JOURNAL_FACTS } from "../index.js";
import type { JournalValueMeta } from "../fact.js";

/**
 * **La boucle fermée du lot B** (plan `plan-phrases-du-journal.md`, D5 et D6,
 * 2026-09-19) — sur le catalogue ENTIER, et non famille par famille.
 *
 * Trois règles, chacune avec ses exemptions écrites et leur raison :
 *
 * 1. chaque type actif nomme son sujet (`subjectLabel`, obligatoire ou
 *    facultatif) ;
 * 2. aucun objet n'est cité par son seul identifiant ;
 * 3. aucune forme courante ne porte de clé `email` — la règle « jamais de
 *    coordonnées au journal ».
 *
 * Les listes se vident, elles ne grandissent pas : un type neuf qui n'y
 * satisfait pas échoue ici, et l'exempter demande d'écrire pourquoi.
 */

/** Les types actifs SANS `subjectLabel`, et pourquoi. */
const UNNAMED_SUBJECTS: Readonly<Record<string, string>> = {
  "product.ingredients_saved":
    "écrit par le contexte des ingrédients, qui ne lit pas les fiches, par construction",
  "subscription.status_changed": "un panier récurrent n'a pas de nom",
  "subscription.occurrence_overridden": "un panier récurrent n'a pas de nom",
  "subscription.deleted": "un panier récurrent n'a pas de nom",
  "catalog_delivery.accepted": "une arrivée de catalogue n'a pas de nom ; ses ids la disent",
  "order_cutoff.created": "une règle d'heure limite se dit par son contenu (point, jour, heure)",
  "order_cutoff.updated": "une règle d'heure limite se dit par son contenu (point, jour, heure)",
  "order_cutoff.removed": "une règle d'heure limite se dit par son contenu (point, jour, heure)",
  "order_cutoff_waiver.granted": "une dérogation se dit par son client (nommé) et sa journée",
  "order_cutoff_waiver.revoked": "une dérogation se dit par son client (nommé) et sa journée",
  "order_late_fee.set": "réglage unique : son sujet n'a pas d'autre nom que son type",
  "order_late_fee.cleared": "réglage unique : son sujet n'a pas d'autre nom que son type",
  "delivery_availability.updated": "réglage unique : son sujet n'a pas d'autre nom que son type",
};

/**
 * Les identifiants qui restent nus (`type:chemin`), et pourquoi. Un `id` à
 * côté de son nom (`{ id, name }`, ou `{ id, ville, codePostal }` pour une
 * adresse) n'est pas nu.
 */
const BARE_REFS: Readonly<Record<string, string>> = {
  "company.bank_account_changed:bankAccountId": "le RIB est décrit par `before` / `after`",
  "company.fulfillment_preference_set:pickupAddressId":
    "les comptes ne lisent pas les points de retrait, rangés dans leur contexte",
  "company.client_note_edited_by_staff:noteId":
    "le nom d'une note est son titre, c'est-à-dire du contenu",
  "subscription.created:subscriptionId": "un panier récurrent n'a pas de nom",
  "subscription.deleted:pickupAddressId": "les paniers ne lisent pas les points de retrait",
  "support.requested:supportRequestId": "une demande de contact n'a pas de nom",
  "support.handled:supportRequestId": "une demande de contact n'a pas de nom",
  "feature_access.exemption_added:exemptionId":
    "une exemption n'a pour nom que l'adresse qu'elle ouvre — todo-derogations-d-acces.md",
  "feature_access.exemption_removed:exemptionId":
    "une exemption n'a pour nom que l'adresse qu'elle ouvre — todo-derogations-d-acces.md",
  "catalog_delivery.accepted:deliveryId": "une arrivée de catalogue n'a pas de nom",
  "catalog_delivery.accepted:revisionId": "une arrivée de catalogue n'a pas de nom",
  "catalog_delivery.accepted:versionId": "une arrivée de catalogue n'a pas de nom",
  "lead.converted:linkedUserId":
    "à l'inscription, la personne n'a pas d'autre nom que son e-mail, qui n'entre pas",
  "appointment.requested:appointmentId": "un rendez-vous n'a pas de nom ; son sujet est nommé",
  "appointment.confirmed:appointmentId": "un rendez-vous n'a pas de nom ; son sujet est nommé",
  "appointment.cancelled:appointmentId": "un rendez-vous n'a pas de nom ; son sujet est nommé",
  "appointment.honored:appointmentId": "un rendez-vous n'a pas de nom ; son sujet est nommé",
  "appointment.no_show:appointmentId": "un rendez-vous n'a pas de nom ; son sujet est nommé",
  "order.placed:orderId": "voisine son nom figé (`orderNumber`)",
  "order.placed:companyId": "voisine son nom figé (`clientName`), et la croissance la lit",
  "order.ready:orderId": "voisine son nom figé (`orderNumber`)",
  "order.ready:readyBy": "une fiche staff que l'annuaire ne nomme pas se cite par son id",
  "order.handed_over:orderId": "voisine son nom figé (`orderNumber`)",
  "order.handed_over:handedOverBy":
    "une fiche staff que l'annuaire ne nomme pas se cite par son id",
  "order_cutoff.created:pickupAddress": "un point de retrait disparu se cite par son id",
  "order_cutoff.updated:pickupAddress": "un point de retrait disparu se cite par son id",
  "order_cutoff.removed:pickupAddress": "un point de retrait disparu se cite par son id",
  "volume_commitment.signed:company":
    "aucune clé étrangère n'attache un engagement à une société : inconnue, elle se cite par son id",
  "volume_commitment.closed:company":
    "aucune clé étrangère n'attache un engagement à une société : inconnue, elle se cite par son id",
};

/**
 * Les types dont la forme courante porte encore un e-mail, et pourquoi.
 * Ceux-là seulement : tout autre échoue. Les dérogations d'accès sont la
 * SEULE exception, mise de côté par Hugo le 2026-09-19 (`8bef9b98`) — voir
 * `documentation/journalisation/todo-derogations-d-acces.md`.
 */
const EMAIL_CARRIERS: Readonly<Record<string, string>> = {
  "feature_access.exemption_added":
    "mis de côté par Hugo : documentation/journalisation/todo-derogations-d-acces.md",
  "feature_access.exemption_removed":
    "mis de côté par Hugo : documentation/journalisation/todo-derogations-d-acces.md",
};

function activeTypes(): readonly [string, z.ZodType][] {
  return JOURNAL_FACT_TYPES.flatMap((type): [string, z.ZodType][] => {
    const entry = JOURNAL_FACTS[type];
    return entry.retired ? [] : [[type, entry.payload]];
  });
}

describe("la boucle fermée des noms du journal (lot B)", () => {
  it("donne un `subjectLabel` à chaque type actif, hors exemptions écrites", () => {
    const unnamed = activeTypes()
      .filter(([, schema]) => !hasSubjectLabel(schema))
      .map(([type]) => type);

    expect(unnamed.sort()).toEqual(Object.keys(UNNAMED_SUBJECTS).sort());
  });

  it("ne cite aucun objet par son seul identifiant, hors exemptions écrites", () => {
    const bare = activeTypes().flatMap(([type, schema]) =>
      bareRefs(schema).map((path) => `${type}:${path}`),
    );

    expect([...new Set(bare)].sort()).toEqual(Object.keys(BARE_REFS).sort());
  });

  it("n'écrit aucun e-mail, à aucune profondeur, hors exemptions écrites", () => {
    const carriers = activeTypes()
      .filter(([, schema]) => keysOf(schema).includes("email"))
      .map(([type]) => type);

    expect(carriers.sort()).toEqual(Object.keys(EMAIL_CARRIERS).sort());
  });

  it("donne une raison à chaque exemption", () => {
    const reasons = [
      ...Object.values(UNNAMED_SUBJECTS),
      ...Object.values(BARE_REFS),
      ...Object.values(EMAIL_CARRIERS),
    ];

    expect(reasons.filter((reason) => reason.trim().length < 10)).toEqual([]);
  });
});

function hasSubjectLabel(schema: z.ZodType): boolean {
  if (schema instanceof z.ZodObject) {
    return "subjectLabel" in schema.shape;
  }
  if (schema instanceof z.ZodUnion) {
    return schema.options.every((option: z.ZodType) => hasSubjectLabel(option));
  }
  return false;
}

/** Les chemins des identifiants nus (`ref`) qui ne sont pas l'`id` d'un objet cité. */
function bareRefs(schema: z.ZodType, path = ""): string[] {
  const meta: JournalValueMeta | undefined = schema.meta();
  if (meta?.ref !== undefined) {
    return [path];
  }
  if (schema instanceof z.ZodObject) {
    const shape: Record<string, z.ZodType> = schema.shape;
    if (isCited(shape)) {
      return [];
    }
    return Object.entries(shape).flatMap(([key, child]) =>
      bareRefs(child, path === "" ? key : `${path}.${key}`),
    );
  }
  return childrenOf(schema).flatMap(({ suffix, child }) => bareRefs(child, `${path}${suffix}`));
}

/** Toutes les clés d'objet d'un schéma, à toute profondeur. */
function keysOf(schema: z.ZodType): string[] {
  if (schema instanceof z.ZodObject) {
    const shape: Record<string, z.ZodType> = schema.shape;
    return Object.entries(shape).flatMap(([key, child]) => [key, ...keysOf(child)]);
  }
  return childrenOf(schema).flatMap(({ child }) => keysOf(child));
}

/** Les schémas qu'un conteneur (optionnel, tableau, union…) enveloppe. */
function childrenOf(schema: z.ZodType): { suffix: string; child: z.ZodType }[] {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return [{ suffix: "", child: schema.unwrap() }];
  }
  if (schema instanceof z.ZodArray) {
    return [{ suffix: "[]", child: schema.element }];
  }
  if (schema instanceof z.ZodRecord) {
    return [{ suffix: "{}", child: schema.valueType }];
  }
  if (schema instanceof z.ZodUnion) {
    return schema.options.map((option: z.ZodType) => ({ suffix: "", child: option }));
  }
  return [];
}

/**
 * Un objet cité : son `id` à côté de ce qui le reconnaît — son nom (facultatif
 * pour une personne), ou sa ville et son code postal pour une adresse.
 */
function isCited(shape: Record<string, z.ZodType>): boolean {
  const keys = Object.keys(shape).sort().join(",");
  return keys === "id,name" || keys === "codePostal,id,ville";
}
