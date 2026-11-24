import type { SubscriptionStatus } from "@lfd/contracts";
import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { BasketDecision } from "../entities/basket.js";

/** Un point de retrait cité : `null` sans point, `{ id, name }` nommé, l'id seul s'il est inconnu. */
export type PickupPointRef = { readonly id: string; readonly name: string } | string | null;

/** Le point désigné par `id`, cité avec `name` s'il en a un. */
export function pickupPointRef(id: string | null, name: string | null): PickupPointRef {
  if (id === null) {
    return null;
  }
  return name === null ? id : { id, name };
}

/** Une dérogation d'échéance, telle que le journal la décrit. */
export interface OccurrenceOverride {
  readonly skipped: boolean;
  readonly lines: readonly { readonly sku: string; readonly quantity: number }[];
}

/**
 * **Les faits des paniers récurrents au journal** : suspendre, reprendre,
 * déroger à une échéance, arrêter. Leurs types restent `subscription.*` : ce
 * sont des valeurs écrites.
 *
 * Un panier récurrent décide de ce qu'on fabriquera et facturera, semaine après
 * semaine, sans qu'une commande soit repassée : « je l'avais mis en pause »,
 * « j'avais sauté cette livraison » se tranchent ici, et nulle part ailleurs.
 *
 * Le sujet est le **panier**, l'auteur est dans la ligne (l'id `users` du
 * client). Aucune charge ne porte l'adresse de livraison ni la note : une
 * coordonnée, et du texte libre qui peut en contenir une.
 *
 * L'ouverture (`subscription.created`) n'est pas ici : elle est écrite par
 * l'abonné de la croissance, sur la PERSONNE, et le score des leads la lit
 * sous cette forme.
 */
export const SUBSCRIPTION_FACTS = {
  statusChanged: "subscription.status_changed",
  occurrenceOverridden: "subscription.occurrence_overridden",
  deleted: "subscription.deleted",
} as const satisfies Readonly<Record<string, JournalFactType>>;

const SUBJECT_TYPE = "subscription";

/** Une dérogation telle qu'elle décide — sans sa note, pour la même raison. */
function overrideOf(override: OccurrenceOverride): Record<string, unknown> {
  return {
    skipped: override.skipped,
    lines: override.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
  };
}

/** Fait : **le panier est suspendu, ou repris** — l'avant et l'après. */
export class SubscriptionStatusChangedEvent implements JournaledEvent {
  constructor(
    readonly subscriptionId: string,
    readonly before: SubscriptionStatus,
    readonly after: SubscriptionStatus,
  ) {}

  journalFact(): JournalFact {
    return {
      type: SUBSCRIPTION_FACTS.statusChanged,
      subjectType: SUBJECT_TYPE,
      subjectId: this.subscriptionId,
      payload: { before: this.before, after: this.after },
    };
  }
}

/**
 * Fait : **une échéance est modifiée ou sautée**. `before` est la dérogation
 * que celle-ci remplace sur la même date, `null` s'il n'y en avait pas.
 */
export class SubscriptionOccurrenceOverriddenEvent implements JournaledEvent {
  constructor(
    readonly subscriptionId: string,
    /** L'échéance visée, `AAAA-MM-JJ`. */
    readonly date: string,
    readonly before: OccurrenceOverride | null,
    readonly after: OccurrenceOverride,
  ) {}

  journalFact(): JournalFact {
    return {
      type: SUBSCRIPTION_FACTS.occurrenceOverridden,
      subjectType: SUBJECT_TYPE,
      subjectId: this.subscriptionId,
      payload: {
        date: this.date,
        before: this.before === null ? null : overrideOf(this.before),
        after: overrideOf(this.after),
      },
    };
  }
}

/**
 * Fait : **le panier est arrêté**. La charge est ce qu'il décidait : le
 * journal garde la décision telle qu'elle était au moment de l'arrêt.
 */
export class SubscriptionDeletedEvent implements JournaledEvent {
  constructor(
    readonly subscriptionId: string,
    readonly decision: BasketDecision,
    /** Le point de retrait cité avec son nom du moment : `null` sans point, l'id seul s'il est inconnu. */
    readonly pickupAddress: PickupPointRef,
  ) {}

  journalFact(): JournalFact {
    const { pickupAddressId: _id, ...decided } = this.decision;
    return {
      type: SUBSCRIPTION_FACTS.deleted,
      subjectType: SUBJECT_TYPE,
      subjectId: this.subscriptionId,
      payload: {
        ...decided,
        pickupAddress: citedCopy(this.pickupAddress),
        lines: this.decision.lines.map((line) => ({ ...line })),
      },
    };
  }
}

/** Une copie de la citation : la charge ne partage rien avec l'appelant. */
function citedCopy(cited: PickupPointRef): PickupPointRef {
  return cited === null || typeof cited === "string" ? cited : { ...cited };
}
