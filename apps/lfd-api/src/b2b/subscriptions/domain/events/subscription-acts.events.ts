import type { SubscriptionStatus } from "@lfd/contracts";

import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { OccurrenceOverride, SubscriptionDecision } from "../entities/subscription.js";

/**
 * **Les faits des paniers récurrents** (plan
 * `documentation/journalisation/plan-journal-d-activite.md`, lot 1, tranche (c),
 * 2026-09-19) : suspendre, reprendre, déroger à une échéance, supprimer.
 *
 * Un panier récurrent décide de ce qu'on fabriquera et facturera, semaine après
 * semaine, sans qu'une commande soit repassée : « je l'avais mis en pause »,
 * « j'avais sauté cette livraison » se tranchent ici, et nulle part ailleurs.
 *
 * Le sujet est le **panier**, l'auteur est dans la ligne (l'id `users` du
 * client). Aucune charge ne porte l'adresse de livraison ni la note : une
 * coordonnée, et du texte libre qui peut en contenir une.
 *
 * ⚠️ L'ouverture (`subscription.created`) n'est PAS ici : elle est écrite par
 * l'abonné de la croissance, sur la PERSONNE, en best-effort — et le score des
 * leads la lit sous cette forme (vérifié le 2026-09-19). Elle le reste, comme
 * les faits de commande (décidé le 2026-09-19).
 */
export const SUBSCRIPTION_FACTS = {
  statusChanged: "subscription.status_changed",
  occurrenceOverridden: "subscription.occurrence_overridden",
  deleted: "subscription.deleted",
} as const;

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
 * Fait : **le panier est supprimé**. La suppression est physique (dette notée
 * au plan, §4) : la charge est donc ce qu'il décidait, sans quoi la décision
 * disparaîtrait avec la ligne.
 */
export class SubscriptionDeletedEvent implements JournaledEvent {
  constructor(
    readonly subscriptionId: string,
    readonly decision: SubscriptionDecision,
  ) {}

  journalFact(): JournalFact {
    return {
      type: SUBSCRIPTION_FACTS.deleted,
      subjectType: SUBJECT_TYPE,
      subjectId: this.subscriptionId,
      payload: {
        ...this.decision,
        lines: this.decision.lines.map((line) => ({ ...line })),
      },
    };
  }
}
