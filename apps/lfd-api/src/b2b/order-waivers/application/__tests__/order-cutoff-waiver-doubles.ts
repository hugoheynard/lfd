import type { OrderCutoffWaiverPayload, OrderCutoffWaiverView } from "@lfd/contracts";

import {
  OpenWaiverAlreadyExistsError,
  OrderCutoffWaiverNotFoundError,
} from "../../domain/order-cutoff-waiver-errors.js";
import type { CutoffWaiverDecision } from "../../domain/order-cutoff-waiver.events.js";
import { OrderCutoffWaiverRepository } from "../../domain/order-cutoff-waiver.repository.js";

/**
 * Les faits des dérogations d'heure limite (plan
 * `documentation/journalisation/plan-journal-d-activite.md`, lot 1,
 * 2026-09-19). La date n'est comparée à aucune horloge : c'est une donnée
 * recopiée telle quelle au journal.
 */
export const PAYLOAD: OrderCutoffWaiverPayload = {
  companyId: "cmp_1",
  fulfillmentDate: "2026-09-21",
  reason: "Client bloqué en tournée",
};

/** Les dérogations en mémoire : ouvertes, et refusées en double comme en base. */
export class InMemoryWaivers extends OrderCutoffWaiverRepository {
  readonly open = new Map<string, CutoffWaiverDecision>();
  private count = 0;

  listFor(): Promise<readonly OrderCutoffWaiverView[]> {
    return Promise.resolve([]);
  }

  grant(payload: OrderCutoffWaiverPayload): Promise<string> {
    const taken = [...this.open.values()].some(
      (open) =>
        open.companyId === payload.companyId && open.fulfillmentDate === payload.fulfillmentDate,
    );
    if (taken) {
      return Promise.reject(new OpenWaiverAlreadyExistsError(payload.companyId));
    }
    this.count += 1;
    const id = `wvr_${String(this.count)}`;
    this.open.set(id, { ...payload });
    return Promise.resolve(id);
  }

  revoke(id: string): Promise<CutoffWaiverDecision> {
    const decision = this.open.get(id);
    if (decision === undefined) {
      return Promise.reject(new OrderCutoffWaiverNotFoundError(id));
    }
    this.open.delete(id);
    return Promise.resolve(decision);
  }
}
