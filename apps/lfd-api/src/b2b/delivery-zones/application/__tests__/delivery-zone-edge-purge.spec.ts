import type { DeliveryZonePayload, DeliveryZoneView } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { HeldAfterCommit } from "../../../../platform/database/__tests__/held-after-commit.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { RecordingPublicSettingsEdgeCache } from "../../../shared/public-settings-cache/domain/__tests__/recording-public-settings-edge-cache.js";
import { DuplicatePostalCodeError } from "../../domain/delivery-zone-errors.js";
import { InvalidDeliveryFeeError } from "../../domain/delivery-audience-terms.js";
import { DeliveryZoneRepository } from "../../domain/delivery-zone.repository.js";
import { CreateDeliveryZoneCommand } from "../create-delivery-zone.command.js";
import { CreateDeliveryZoneHandler } from "../create-delivery-zone.handler.js";
import { UpdateDeliveryZoneCommand } from "../update-delivery-zone.command.js";
import { UpdateDeliveryZoneHandler } from "../update-delivery-zone.handler.js";

const ZONE: DeliveryZonePayload = {
  label: "La vallée",
  postalPrefixes: ["73"],
  fee: { mode: "amount", cents: 500 },
};

/** Des zones en mémoire ; `conflict` joue le préfixe déjà pris qu'oppose la base. */
class Zones extends DeliveryZoneRepository {
  conflict = false;
  writes = 0;

  list(): Promise<readonly DeliveryZoneView[]> {
    return Promise.resolve([]);
  }
  findById(): Promise<DeliveryZoneView | null> {
    return Promise.resolve(null);
  }
  resolveForPostalCode(): Promise<DeliveryZoneView | null> {
    return Promise.resolve(null);
  }
  create(): Promise<string> {
    this.writes += 1;
    return this.conflict
      ? Promise.reject(new DuplicatePostalCodeError("73"))
      : Promise.resolve("zone_1");
  }
  update(): Promise<void> {
    this.writes += 1;
    return this.conflict ? Promise.reject(new DuplicatePostalCodeError("73")) : Promise.resolve();
  }
  remove(): Promise<void> {
    return Promise.resolve();
  }
}

function scene() {
  const zones = new Zones();
  const edge = new RecordingPublicSettingsEdgeCache();
  const afterCommit = new HeldAfterCommit();
  const deps = [new RecordingPublisher(), new DirectUnitOfWork(), afterCommit, edge] as const;
  return {
    zones,
    edge,
    afterCommit,
    create: new CreateDeliveryZoneHandler(zones, ...deps),
    update: new UpdateDeliveryZoneHandler(zones, ...deps),
  };
}

/**
 * Les zones sont servies `public` par `GET /delivery-zones` : chaque écriture
 * validée purge les réglages publics de Workers Cache, et seulement elle.
 */
describe("zones de livraison — la purge des réglages publics", () => {
  it("une création purge après la validation, et pas avant", async () => {
    const { create, edge, afterCommit } = scene();

    await create.execute(new CreateDeliveryZoneCommand(ZONE));
    expect(edge.purges).toBe(0);

    await afterCommit.commit();
    expect(edge.purges).toBe(1);
  });

  it("une modification purge après la validation", async () => {
    const { update, edge, afterCommit } = scene();

    await update.execute(new UpdateDeliveryZoneCommand("zone_1", ZONE));
    await afterCommit.commit();

    expect(edge.purges).toBe(1);
  });

  it("rien quand la base refuse la création ou la modification", async () => {
    const { zones, create, update, edge, afterCommit } = scene();
    zones.conflict = true;

    await expect(create.execute(new CreateDeliveryZoneCommand(ZONE))).rejects.toBeInstanceOf(
      DuplicatePostalCodeError,
    );
    await expect(
      update.execute(new UpdateDeliveryZoneCommand("zone_1", ZONE)),
    ).rejects.toBeInstanceOf(DuplicatePostalCodeError);
    await afterCommit.commit();

    expect(edge.purges).toBe(0);
  });

  it("un remplacement par audience invalide : refusé avant toute écriture, rien de purgé", async () => {
    const { zones, create, update, edge, afterCommit } = scene();
    const invalid: DeliveryZonePayload = {
      ...ZONE,
      audienceTerms: {
        b2b: { fee: { mode: "percent", bp: 10_001 }, freeDeliveryThresholdCents: null },
        b2c: { fee: null, freeDeliveryThresholdCents: null },
      },
    };

    await expect(create.execute(new CreateDeliveryZoneCommand(invalid))).rejects.toBeInstanceOf(
      InvalidDeliveryFeeError,
    );
    await expect(
      update.execute(new UpdateDeliveryZoneCommand("zone_1", invalid)),
    ).rejects.toBeInstanceOf(InvalidDeliveryFeeError);
    await afterCommit.commit();

    expect(zones.writes).toBe(0);
    expect(edge.purges).toBe(0);
  });
});
