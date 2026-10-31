import type { DeliveryZonePayload, DeliveryZoneView } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { DeliveryZoneTargetedByPromotionError } from "../../domain/delivery-zone-errors.js";
import { DeliveryZoneRepository } from "../../domain/delivery-zone.repository.js";
import type { ZoneTargetingPromotion } from "../../domain/ports/promotions-targeting-zone.reader.js";
import { RemoveDeliveryZoneCommand } from "../remove-delivery-zone.command.js";
import { RemoveDeliveryZoneHandler } from "../remove-delivery-zone.handler.js";
import { FixedPromotionsTargetingZone, RecordingZoneLock } from "./remove-delivery-zone.doubles.js";

const STORED: DeliveryZoneView = {
  id: "zone_vallee",
  label: "La vallée",
  postalPrefixes: ["73"],
  fee: { mode: "amount", cents: 500 },
};

/** Une zone en mémoire ; `remove` note son passage dans le même journal d'ordre. */
class OneZone extends DeliveryZoneRepository {
  removed: string | null = null;

  constructor(private readonly calls: string[]) {
    super();
  }

  list(): Promise<readonly DeliveryZoneView[]> {
    return Promise.resolve([STORED]);
  }

  findById(id: string): Promise<DeliveryZoneView | null> {
    this.calls.push(`find:${id}`);
    return Promise.resolve(id === STORED.id ? STORED : null);
  }

  resolveForPostalCode(): Promise<DeliveryZoneView | null> {
    return Promise.resolve(STORED);
  }

  create(_payload: DeliveryZonePayload): Promise<string> {
    return Promise.resolve(STORED.id);
  }

  update(): Promise<void> {
    return Promise.resolve();
  }

  remove(id: string): Promise<void> {
    this.calls.push(`remove:${id}`);
    this.removed = id;
    return Promise.resolve();
  }
}

function scene(view?: readonly ZoneTargetingPromotion[]) {
  const calls: string[] = [];
  const zones = new OneZone(calls);
  const events = new RecordingPublisher();
  const handler = new RemoveDeliveryZoneHandler(
    zones,
    new RecordingZoneLock(calls),
    new FixedPromotionsTargetingZone(view, calls),
    events,
    new DirectUnitOfWork(),
  );
  return { calls, zones, events, handler };
}

describe("RemoveDeliveryZoneHandler — une zone nommée par une promotion (plan des acheminements, § 9)", () => {
  it("refuse tant qu'une promotion non archivée la nomme", async () => {
    const { zones, events, handler } = scene([
      { id: "promo_1", name: "Livraison offerte en vallée", archived: false },
    ]);

    const refusal = handler.execute(new RemoveDeliveryZoneCommand(STORED.id));

    await expect(refusal).rejects.toBeInstanceOf(DeliveryZoneTargetedByPromotionError);
    await expect(refusal).rejects.toThrow(
      "Cette zone est nommée par la promotion « Livraison offerte en vallée » : une promotion garde la trace de ses zones.",
    );
    expect(zones.removed).toBeNull();
    expect(events.traced).toHaveLength(0);
  });

  it("refuse aussi quand seule une promotion ARCHIVÉE la nomme", async () => {
    const { zones, handler } = scene([{ id: "promo_old", name: "Été en vallée", archived: true }]);

    await expect(handler.execute(new RemoveDeliveryZoneCommand(STORED.id))).rejects.toThrow(
      "Cette zone est nommée par la promotion « Été en vallée » (archivée) : une promotion garde la trace de ses zones.",
    );
    expect(zones.removed).toBeNull();
  });

  it("verrouille la zone AVANT de lire les promotions, et supprime après", async () => {
    const { calls, events, handler } = scene();

    await handler.execute(new RemoveDeliveryZoneCommand(STORED.id));

    expect(calls).toEqual([
      `lock:${STORED.id}`,
      `find:${STORED.id}`,
      `targeting:${STORED.id}`,
      `remove:${STORED.id}`,
    ]);
    expect(events.traced[0]?.journalFact().payload).toEqual({ subjectLabel: "La vallée" });
  });
});
