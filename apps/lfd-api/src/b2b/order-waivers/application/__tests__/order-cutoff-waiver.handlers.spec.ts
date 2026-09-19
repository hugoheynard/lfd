import type { OrderCutoffWaiverPayload, OrderCutoffWaiverView } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import {
  OpenWaiverAlreadyExistsError,
  OrderCutoffWaiverNotFoundError,
} from "../../domain/order-cutoff-waiver-errors.js";
import type { CutoffWaiverDecision } from "../../domain/order-cutoff-waiver.events.js";
import { OrderCutoffWaiverRepository } from "../../domain/order-cutoff-waiver.repository.js";
import {
  GrantOrderCutoffWaiverCommand,
  RevokeOrderCutoffWaiverCommand,
} from "../order-cutoff-waiver.commands.js";
import {
  GrantOrderCutoffWaiverHandler,
  RevokeOrderCutoffWaiverHandler,
} from "../order-cutoff-waiver.handlers.js";

/**
 * Les faits des dérogations d'heure limite (plan
 * `documentation/journalisation/plan-journal-d-activite.md`, lot 1,
 * 2026-09-19). La date n'est comparée à aucune horloge : c'est une donnée
 * recopiée telle quelle au journal.
 */
const PAYLOAD: OrderCutoffWaiverPayload = {
  companyId: "cmp_1",
  fulfillmentDate: "2026-09-21",
  reason: "Client bloqué en tournée",
};

/** Les dérogations en mémoire : ouvertes, et refusées en double comme en base. */
class InMemoryWaivers extends OrderCutoffWaiverRepository {
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

function build() {
  const waivers = new InMemoryWaivers();
  const events = new RecordingPublisher();
  const uow = new DirectUnitOfWork();
  return {
    waivers,
    events,
    grant: new GrantOrderCutoffWaiverHandler(waivers, events, uow),
    revoke: new RevokeOrderCutoffWaiverHandler(waivers, events, uow),
  };
}

describe("GrantOrderCutoffWaiverHandler", () => {
  it("journalise la dérogation accordée : pour qui, quel jour, pourquoi", async () => {
    const { grant, events } = build();

    const id = await grant.execute(new GrantOrderCutoffWaiverCommand(PAYLOAD, "fiche-1"));

    expect(id).toBe("wvr_1");
    expect(events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "order_cutoff_waiver.granted",
        subjectType: "order_cutoff_waiver",
        subjectId: "wvr_1",
        payload: {
          companyId: "cmp_1",
          fulfillmentDate: "2026-09-21",
          reason: "Client bloqué en tournée",
        },
      },
    ]);
  });

  it("n'écrit aucun fait quand une dérogation est déjà ouverte", async () => {
    const { grant, events } = build();
    await grant.execute(new GrantOrderCutoffWaiverCommand(PAYLOAD, "fiche-1"));

    await expect(
      grant.execute(new GrantOrderCutoffWaiverCommand(PAYLOAD, "fiche-2")),
    ).rejects.toBeInstanceOf(OpenWaiverAlreadyExistsError);
    expect(events.factTypes()).toEqual(["order_cutoff_waiver.granted"]);
  });
});

describe("RevokeOrderCutoffWaiverHandler", () => {
  it("journalise le retrait avec ce que la dérogation décidait", async () => {
    const { grant, revoke, events } = build();
    const id = await grant.execute(new GrantOrderCutoffWaiverCommand(PAYLOAD, "fiche-1"));

    await revoke.execute(new RevokeOrderCutoffWaiverCommand(id));

    expect(events.factTypes()).toEqual([
      "order_cutoff_waiver.granted",
      "order_cutoff_waiver.revoked",
    ]);
    expect(events.traced[1]?.journalFact()).toMatchObject({
      subjectId: id,
      payload: { companyId: "cmp_1", fulfillmentDate: "2026-09-21" },
    });
  });

  it("n'écrit aucun fait quand la dérogation est introuvable — ou a déjà servi", async () => {
    const { revoke, events } = build();

    await expect(
      revoke.execute(new RevokeOrderCutoffWaiverCommand("wvr_absente")),
    ).rejects.toBeInstanceOf(OrderCutoffWaiverNotFoundError);
    expect(events.traced).toHaveLength(0);
  });
});
