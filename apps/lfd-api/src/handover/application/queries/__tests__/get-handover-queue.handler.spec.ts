import { HandoverQueueReader, type HandoverQueueEntry } from "../../../channels/commerce/index.js";
import {
  HandoverAttestationsReader,
  type AttestedHandover,
} from "../../../domain/ports/handover-attestations.reader.js";
import { GetHandoverQueueHandler } from "../get-handover-queue.handler.js";
import { GetHandoverQueueQuery } from "../get-handover-queue.query.js";

/**
 * La file du comptoir, neuve et jamais éprouvée : la fusion des deux lectures
 * (`stateOf`) et la promesse « deux requêtes, jamais N + 1 ».
 *
 * Les deux doublés HÉRITENT du port abstrait et ENREGISTRENT leurs appels —
 * c'est ce qui permet d'assert le NOMBRE et les ARGUMENTS d'une lecture, pas
 * seulement son résultat.
 */

// « Passée il y a deux jours » — une intention relative, jamais un jour du
// calendrier : rien ici ne compare cette date à l'horloge, elle ne fait que
// s'afficher, mais §5 ne fait pas d'exception à la commodité.
const PLACED_AT = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

function entry(overrides: Partial<HandoverQueueEntry> = {}): HandoverQueueEntry {
  return {
    orderId: "ord_1",
    reference: "ORD-ABCD-1234",
    customerLabel: "Les Halles",
    pickupLabel: "Le labo",
    fulfillmentMethod: "pickup",
    window: null,
    totalUnits: 3,
    status: "ready",
    readyAt: null,
    placedAt: PLACED_AT,
    ...overrides,
  };
}

function attestation(overrides: Partial<AttestedHandover> = {}): AttestedHandover {
  return {
    handedOverAt: new Date(Date.now() - 60 * 60 * 1000),
    handedOverBy: "staff-1",
    via: "scan",
    ...overrides,
  };
}

/** Rend une file fixe, et note chaque jour demandé. */
class RecordingHandoverQueueReader extends HandoverQueueReader {
  readonly calls: string[] = [];

  constructor(private readonly entries: readonly HandoverQueueEntry[]) {
    super();
  }

  expectedOn(day: string): Promise<readonly HandoverQueueEntry[]> {
    this.calls.push(day);
    return Promise.resolve(this.entries);
  }
}

/** Rend une table fixe d'attestations, et note chaque lot demandé. */
class RecordingHandoverAttestationsReader extends HandoverAttestationsReader {
  readonly calls: (readonly string[])[] = [];

  constructor(private readonly attested: ReadonlyMap<string, AttestedHandover>) {
    super();
  }

  forOrders(orderIds: readonly string[]): Promise<ReadonlyMap<string, AttestedHandover>> {
    this.calls.push(orderIds);
    return Promise.resolve(this.attested);
  }
}

function handlerOf(
  entries: readonly HandoverQueueEntry[],
  attested: ReadonlyMap<string, AttestedHandover>,
) {
  const queue = new RecordingHandoverQueueReader(entries);
  const attestations = new RecordingHandoverAttestationsReader(attested);
  const handler = new GetHandoverQueueHandler(queue, attestations);
  return { handler, queue, attestations };
}

describe("GetHandoverQueueHandler — état d'une ligne (stateOf)", () => {
  it("🔴 une commande à la fois ATTESTÉE et ANNULÉE reste `handed_over` — le sac est parti", async () => {
    // C'est la combinaison qui compte : sans cette priorité, une annulation
    // arrivée après la remise repeindrait la ligne et ferait mentir l'écran
    // sur un fait physique.
    const { handler } = handlerOf(
      [entry({ orderId: "ord_1", status: "cancelled" })],
      new Map([["ord_1", attestation()]]),
    );

    const view = await handler.execute(new GetHandoverQueueQuery("2026-09-10"));

    expect(view.entries[0]?.state).toBe("handed_over");
  });

  it("refuse — `cancelled` — une commande annulée et jamais attestée", async () => {
    const { handler } = handlerOf([entry({ orderId: "ord_1", status: "cancelled" })], new Map());

    const view = await handler.execute(new GetHandoverQueueQuery("2026-09-10"));

    expect(view.entries[0]?.state).toBe("cancelled");
  });

  it("`ready` quand le fournil l'a déclarée prête, sans attestation ni annulation", async () => {
    const { handler } = handlerOf(
      [entry({ orderId: "ord_1", status: "confirmed", readyAt: new Date() })],
      new Map(),
    );

    const view = await handler.execute(new GetHandoverQueueQuery("2026-09-10"));

    expect(view.entries[0]?.state).toBe("ready");
  });

  it("`expected` sinon — y compris une commande jamais colisée (`handoverBlocker` est permissif)", async () => {
    const { handler } = handlerOf(
      [entry({ orderId: "ord_1", status: "placed", readyAt: null })],
      new Map(),
    );

    const view = await handler.execute(new GetHandoverQueueQuery("2026-09-10"));

    expect(view.entries[0]?.state).toBe("expected");
  });

  it("projette l'attestation sur la ligne — heure et via, jamais construits à partir du statut", async () => {
    const attested = attestation({
      via: "manual",
      handedOverAt: new Date("2026-09-10T09:00:00.000Z"),
    });
    const { handler } = handlerOf([entry({ orderId: "ord_1" })], new Map([["ord_1", attested]]));

    const view = await handler.execute(new GetHandoverQueueQuery("2026-09-10"));

    expect(view.entries[0]?.handedOverAt).toBe("2026-09-10T09:00:00.000Z");
    expect(view.entries[0]?.handedOverVia).toBe("manual");
  });

  it("rend `handedOverAt` et `handedOverVia` à `null` sans attestation", async () => {
    const { handler } = handlerOf([entry({ orderId: "ord_1" })], new Map());

    const view = await handler.execute(new GetHandoverQueueQuery("2026-09-10"));

    expect(view.entries[0]?.handedOverAt).toBeNull();
    expect(view.entries[0]?.handedOverVia).toBeNull();
  });
});

describe("GetHandoverQueueHandler — jamais N + 1", () => {
  it("appelle `forOrders` UNE fois, avec exactement les ids de la file", async () => {
    const { handler, queue, attestations } = handlerOf(
      [entry({ orderId: "ord_1" }), entry({ orderId: "ord_2" })],
      new Map(),
    );

    await handler.execute(new GetHandoverQueueQuery("2026-09-10"));

    expect(queue.calls).toEqual(["2026-09-10"]);
    expect(attestations.calls).toEqual([["ord_1", "ord_2"]]);
  });

  it("une file vide déclenche quand même UN SEUL lot — jamais une lecture par ligne", async () => {
    // Le court-circuit sur liste vide vit dans l'adaptateur (cf. son JSDoc), pas
    // ici : le handler ne sait pas que le lot est vide, il pose la même unique
    // requête batched qu'avec dix lignes. C'est ce qui garde le contrat simple.
    const { handler, attestations } = handlerOf([], new Map());

    const view = await handler.execute(new GetHandoverQueueQuery("2026-09-10"));

    expect(view.entries).toEqual([]);
    expect(attestations.calls).toEqual([[]]);
  });
});

describe("GetHandoverQueueHandler — la vue", () => {
  it("renvoie le jour demandé tel quel", async () => {
    const { handler } = handlerOf([], new Map());

    const view = await handler.execute(new GetHandoverQueueQuery("2026-09-10"));

    expect(view.day).toBe("2026-09-10");
  });
});
