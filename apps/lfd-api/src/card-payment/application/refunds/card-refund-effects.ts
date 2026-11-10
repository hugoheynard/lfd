import { Injectable } from "@nestjs/common";

import type { JournalFact } from "../../../platform/journal/journal-fact.js";
import { Journal } from "../../../platform/journal/journal.js";
import type { SubjectRefundOutcomeDraft } from "../../channels/subjects/index.js";
import type { CardRefundRequest } from "../../domain/entities/card-refund-request.js";
import {
  CardRefundBell,
  type CardRefundAttentionCause,
  type CardRefundOrphanCause,
} from "./card-refund-bell.js";
import { CardRefundOutcomes } from "./card-refund-outcomes.js";
import type { LockedPayment } from "./card-refund-scope.js";

/** Une cloche à sonner pour une demande. */
interface RequestBell {
  readonly request: CardRefundRequest;
  readonly cause: CardRefundAttentionCause;
}

/** Une cloche à sonner pour un `re_…` sans demande. */
interface OrphanBell {
  readonly providerRef: string;
  readonly amountCents: number;
  readonly cause: CardRefundOrphanCause;
}

/**
 * **Ce qu'une écriture sur l'argent d'un sujet laisse derrière elle** — le
 * journal du bloc, ses cloches, et les issues à rendre au sujet. Accumulé
 * pendant la décision, sous les verrous ; écrit APRÈS les lignes, dans le
 * même ordre partout (§3.6) : journal, cloches, puis le canal.
 */
export class RefundEffects {
  readonly facts: ((label: string) => JournalFact)[] = [];
  readonly bells: RequestBell[] = [];
  readonly orphans: OrphanBell[] = [];
  readonly drafts: SubjectRefundOutcomeDraft[] = [];

  journal(fact: (label: string) => JournalFact): void {
    this.facts.push(fact);
  }

  ring(request: CardRefundRequest, cause: CardRefundAttentionCause): void {
    this.bells.push({ request, cause });
  }

  ringOrphan(providerRef: string, amountCents: number, cause: CardRefundOrphanCause): void {
    this.orphans.push({ providerRef, amountCents, cause });
  }

  outcome(draft: SubjectRefundOutcomeDraft): void {
    this.drafts.push(draft);
  }
}

/**
 * Écrit les effets accumulés : le journal de `card-payment` sous le sujet
 * `card_payment` (libellé par `describe`), les cloches, puis les issues au
 * canal avec la position recalculée. Dans l'unité de travail de l'appelant —
 * une trace qui ne part pas annule l'écriture qu'elle décrit.
 */
@Injectable()
export class CardRefundEffectsWriter {
  constructor(
    private readonly journal: Journal,
    private readonly bell: CardRefundBell,
    private readonly outcomes: CardRefundOutcomes,
  ) {}

  async flush(locked: LockedPayment, effects: RefundEffects): Promise<void> {
    const { settlement, subject } = locked;
    if (effects.facts.length > 0) {
      const { label } = await settlement.describe(subject);
      for (const fact of effects.facts) {
        await this.journal.append(fact(label));
      }
    }
    for (const { request, cause } of effects.bells) {
      await this.bell.ring({
        settlement,
        subject,
        requestId: request.id,
        generation: request.generation,
        amountCents: request.view.announcedCents,
        cause,
      });
    }
    for (const orphan of effects.orphans) {
      await this.bell.ringOrphan({ settlement, subject, ...orphan });
    }
    await this.outcomes.publish(locked, effects.drafts);
  }
}
