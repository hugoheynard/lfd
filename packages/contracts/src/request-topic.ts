import { z } from "zod";

import { appointmentPurposeSchema } from "./appointment.js";
import type { AppointmentPurpose } from "./appointment.js";

/**
 * La **liste officielle des types de demande** — le vocabulaire commun aux trois
 * chemins de contact (rendez-vous daté, rappel au plus vite, e-mail).
 *
 * Deux niveaux, et pas un de plus :
 * - la **famille** (`AppointmentPurpose`) — de quoi on parle : découverte, devis,
 *   commande, panier récurrent, facturation, compte, autre. C'est ce qui rend la
 *   file du commercial lisible en colonne ;
 * - le **sujet** (`RequestTopic`) — ce qu'on veut faire : « changer la
 *   fréquence », « sauter une échéance », « annuler une commande ». C'est ce qui
 *   permet de préparer le rendez-vous avant de décrocher.
 *
 * Le troisième apport est l'**attachement** : chaque sujet déclare *sur quoi* il
 * porte — un panier récurrent, une échéance, une commande, ou rien. C'est de là
 * que vient l'association automatique : « changer la fréquence » ne se demande
 * que si l'on a au moins un panier récurrent, et se rattache tout seul quand il
 * n'y en a qu'un.
 *
 * Ici le **vocabulaire** seul ; la façon de l'écrire à l'écran vit dans
 * `@lfd/b2b-ui` (`purpose-labels`), comme pour les familles.
 */

/**
 * Ce sur quoi une demande peut porter. Chaque valeur correspond à une entité qui
 * existe vraiment et qu'on sait retrouver — on n'annonce pas un attachement
 * qu'on ne saurait pas résoudre.
 */
export const attachableKindSchema = z.enum(["order", "subscription", "subscription_occurrence"]);
export type AttachableKind = z.infer<typeof attachableKindSchema>;

/** Les sujets de demande, préfixés par leur famille — lisible tel quel dans un journal. */
export const requestTopicSchema = z.enum([
  // Découverte
  "discover.offer",
  "discover.pricing",
  "discover.delivery",
  // Devis
  "quote.new",
  "quote.followup",
  // Commande
  "order.status",
  "order.change",
  "order.cancel",
  "order.issue",
  // Panier récurrent
  "recurring.create",
  "recurring.frequency",
  "recurring.content",
  "recurring.occurrence",
  "recurring.pause",
  "recurring.cancel",
  // Facturation
  "billing.invoice",
  "billing.payment",
  "billing.terms",
  // Compte
  "account.activation",
  "account.users",
  "account.addresses",
  // Fourre-tout
  "other.request",
]);
export type RequestTopic = z.infer<typeof requestTopicSchema>;

/** Ce qu'un sujet déclare de lui-même : sa famille, et ce sur quoi il porte. */
interface TopicDefinition {
  readonly family: AppointmentPurpose;
  /** L'entité concernée, ou `null` quand la demande ne porte sur rien de précis. */
  readonly attaches: AttachableKind | null;
}

/** La table — ce que chaque sujet déclare. L'**ordre** d'affichage, lui, vient de l'énuméré. */
const TOPICS: Readonly<Record<RequestTopic, TopicDefinition>> = {
  "discover.offer": { family: "discover", attaches: null },
  "discover.pricing": { family: "discover", attaches: null },
  "discover.delivery": { family: "discover", attaches: null },

  "quote.new": { family: "quote", attaches: null },
  "quote.followup": { family: "quote", attaches: null },

  "order.status": { family: "order", attaches: "order" },
  "order.change": { family: "order", attaches: "order" },
  "order.issue": { family: "order", attaches: "order" },
  "order.cancel": { family: "order", attaches: "order" },

  "recurring.create": { family: "recurring", attaches: null },
  "recurring.frequency": { family: "recurring", attaches: "subscription" },
  "recurring.content": { family: "recurring", attaches: "subscription" },
  "recurring.occurrence": { family: "recurring", attaches: "subscription_occurrence" },
  "recurring.pause": { family: "recurring", attaches: "subscription" },
  "recurring.cancel": { family: "recurring", attaches: "subscription" },

  "billing.invoice": { family: "billing", attaches: "order" },
  "billing.payment": { family: "billing", attaches: "order" },
  "billing.terms": { family: "billing", attaches: null },

  "account.activation": { family: "account", attaches: null },
  "account.users": { family: "account", attaches: null },
  "account.addresses": { family: "account", attaches: null },

  "other.request": { family: "other", attaches: null },
};

/**
 * Tous les sujets, dans l'ordre où on les propose — du plus fréquent au
 * fourre-tout. L'ordre vient de l'**énuméré**, pas des clés de la table : c'est
 * lui le contrat, et il ne dépend d'aucune convention d'itération d'objet.
 */
export const REQUEST_TOPICS: readonly RequestTopic[] = requestTopicSchema.options;

/** La famille d'un sujet — jamais déduite du préfixe, toujours lue dans la table. */
export function familyOf(topic: RequestTopic): AppointmentPurpose {
  return TOPICS[topic].family;
}

/** Ce sur quoi le sujet porte, ou `null`. */
export function attachmentOf(topic: RequestTopic): AttachableKind | null {
  return TOPICS[topic].attaches;
}

/** Les sujets d'une famille, dans l'ordre où on les propose. */
export function topicsOf(family: AppointmentPurpose): readonly RequestTopic[] {
  return REQUEST_TOPICS.filter((topic) => TOPICS[topic].family === family);
}

/**
 * L'**objet concerné** par la demande, quand le client sait le désigner.
 *
 * Il reste facultatif partout : un client peut vouloir parler d'une commande
 * sans savoir laquelle, et lui refuser sa demande pour ça serait absurde. Ce
 * qu'on interdit, c'est l'**incohérence** — désigner un panier récurrent sur un
 * sujet qui parle d'une commande.
 */
export const requestSubjectSchema = z.object({
  kind: attachableKindSchema,
  id: z.string().trim().min(1, "identifiant de l'objet concerné manquant"),
});
export type RequestSubject = z.infer<typeof requestSubjectSchema>;

/** La partie « type de demande » d'une charge utile, commune aux trois chemins. */
export interface RequestClassification {
  readonly purpose: AppointmentPurpose;
  readonly topic: RequestTopic | null;
  readonly subject: RequestSubject | null;
}

/** Un défaut de cohérence, tel qu'on le remonte au champ fautif. */
export interface ClassificationIssue {
  readonly path: "topic" | "subject";
  readonly message: string;
}

/**
 * Vérifie que famille, sujet et objet se tiennent. Partagé par les trois charges
 * utiles : une règle écrite une fois ne peut pas diverger entre deux chemins.
 *
 * Le sujet lui-même reste **facultatif** — la famille suffit à router une
 * demande, et exiger un sous-motif ferait abandonner des formulaires. Ce qui est
 * refusé : un sujet d'une autre famille, et un objet qui ne correspond pas à ce
 * que le sujet concerne.
 */
export function classificationIssue(value: RequestClassification): ClassificationIssue | null {
  const { purpose, topic, subject } = value;
  if (topic === null) {
    // Sans sujet déclaré, rien ne permet de savoir sur quoi l'objet porterait.
    return subject === null
      ? null
      : { path: "subject", message: "précisez le type de demande avant de désigner un objet" };
  }
  if (familyOf(topic) !== purpose) {
    return { path: "topic", message: "ce type de demande n'appartient pas au motif choisi" };
  }
  if (subject === null) {
    return null;
  }
  const expected = attachmentOf(topic);
  if (expected === null) {
    return { path: "subject", message: "ce type de demande ne porte sur aucun objet" };
  }
  if (expected !== subject.kind) {
    return { path: "subject", message: "l'objet désigné ne correspond pas au type de demande" };
  }
  return null;
}

/**
 * L'**association automatique** : parmi les objets que le client possède du bon
 * type, on ne pré-sélectionne que s'il n'y a **aucune ambiguïté**. Deux paniers
 * récurrents, c'est au client de dire lequel — deviner, c'est se tromper une
 * fois sur deux et l'écrire dans la fiche du commercial.
 */
export function autoAttach(
  topic: RequestTopic,
  candidates: readonly RequestSubject[],
): RequestSubject | null {
  const expected = attachmentOf(topic);
  if (expected === null) {
    return null;
  }
  const matching = candidates.filter((candidate) => candidate.kind === expected);
  return matching.length === 1 ? (matching[0] ?? null) : null;
}

/**
 * Les sujets **proposables** à ce client : on retire ceux qui portent sur un
 * objet qu'il n'a pas. « Changer la fréquence » n'a rien à dire à qui n'a aucun
 * panier récurrent, et le lui proposer donne un formulaire qui ne mène nulle
 * part.
 */
export function offerableTopics(
  family: AppointmentPurpose,
  candidates: readonly RequestSubject[],
): readonly RequestTopic[] {
  const available = new Set(candidates.map((candidate) => candidate.kind));
  return topicsOf(family).filter((topic) => {
    const expected = attachmentOf(topic);
    return expected === null || available.has(expected);
  });
}

/** Le schéma de famille, ré-exporté ici pour que la classification tienne en un import. */
export const requestFamilySchema = appointmentPurposeSchema;
