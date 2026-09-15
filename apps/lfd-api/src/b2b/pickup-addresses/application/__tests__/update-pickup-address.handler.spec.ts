import type { PickupAddressUpdatePayload, PickupAddressView } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import {
  PickupAddressRepository,
  type PickupAddressWrite,
} from "../../domain/pickup-address.repository.js";
import {
  PickupAddressNotFoundError,
  PickupDiscountWithoutAudienceError,
} from "../../domain/pickup-errors.js";
import {
  CreatePickupAddressCommand,
  UpdatePickupAddressCommand,
} from "../pickup-address.commands.js";
import {
  CreatePickupAddressHandler,
  UpdatePickupAddressHandler,
} from "../pickup-address.handlers.js";

const FIELDS = {
  label: "Laboratoire",
  ligne1: "18 rue des Archives",
  ligne2: "",
  codePostal: "75004",
  ville: "Paris",
  pays: "France",
  isDefault: false,
  opening: { publicOpening: null, proPickup: null },
} as const;

/** Un point en base, et ce qu'on y écrit. */
class StoredPoints extends PickupAddressRepository {
  written: PickupAddressWrite | null = null;

  constructor(private readonly stored: PickupAddressView | null) {
    super();
  }
  list(): Promise<readonly PickupAddressView[]> {
    return Promise.resolve(this.stored === null ? [] : [this.stored]);
  }
  resolve(): Promise<PickupAddressView | null> {
    return Promise.resolve(this.stored);
  }
  create(point: PickupAddressWrite): Promise<string> {
    this.written = point;
    return Promise.resolve("pickup_9");
  }
  update(_id: string, point: PickupAddressWrite): Promise<void> {
    this.written = point;
    return Promise.resolve();
  }
  remove(): Promise<void> {
    return Promise.reject(new Error("non utilisé"));
  }
  setDefault(): Promise<void> {
    return Promise.reject(new Error("non utilisé"));
  }
}

/** Un point dont la remise est fermée au public — l'état que S2 ne doit pas rouvrir. */
const PROS_ONLY: PickupAddressView = {
  ...FIELDS,
  id: "pickup_1",
  discount: { mode: "percent", bp: 1_000 },
  discountAudiences: { b2b: true, b2c: false },
};

function update(
  points: StoredPoints,
  payload: PickupAddressUpdatePayload,
  events = new RecordingPublisher(),
): Promise<void> {
  return new UpdatePickupAddressHandler(points, events, new DirectUnitOfWork()).execute(
    new UpdatePickupAddressCommand("pickup_1", payload),
  );
}

describe("UpdatePickupAddressHandler — les clientèles de la remise", () => {
  /**
   * Régression (vitruve, S2) : avec le défaut de la création, un onglet du
   * back-office ouvert avant le déploiement renvoyait une charge SANS
   * clientèles, et rouvrait en silence au public une remise fermée.
   */
  it("clientèles absentes : garde celles de la base au lieu de rouvrir aux deux", async () => {
    const points = new StoredPoints(PROS_ONLY);

    await update(points, { ...FIELDS, discount: { mode: "percent", bp: 1_500 } });

    expect(points.written?.discount.audiences).toEqual({ b2b: true, b2c: false });
    expect(points.written?.discount.adjustment).toEqual({ mode: "percent", bp: 1_500 });
  });

  it("clientèles présentes : les écrit", async () => {
    const points = new StoredPoints(PROS_ONLY);

    await update(points, {
      ...FIELDS,
      discount: { mode: "percent", bp: 1_000 },
      discountAudiences: { b2b: false, b2c: true },
    });

    expect(points.written?.discount.audiences).toEqual({ b2b: false, b2c: true });
  });

  /**
   * La règle se juge sur l'état ÉCRIT : une réduction posée sans cases sur un
   * point dont les deux sont décochées ne viserait personne.
   */
  it("refuse une réduction sans cases sur un point dont les cases stockées sont décochées", async () => {
    const points = new StoredPoints({
      ...PROS_ONLY,
      discount: null,
      discountAudiences: { b2b: false, b2c: false },
    });

    await expect(
      update(points, { ...FIELDS, discount: { mode: "amount", cents: 300 } }),
    ).rejects.toBeInstanceOf(PickupDiscountWithoutAudienceError);
    expect(points.written).toBeNull();
  });

  it("retirer la réduction garde les cases décochées, sans refus", async () => {
    const points = new StoredPoints(PROS_ONLY);

    await update(points, {
      ...FIELDS,
      discount: null,
      discountAudiences: { b2b: false, b2c: false },
    });

    expect(points.written?.discount.adjustment).toBeNull();
    expect(points.written?.discount.audiences).toEqual({ b2b: false, b2c: false });
  });

  it("un point introuvable est un 404, et rien n'est journalisé", async () => {
    const events = new RecordingPublisher();

    await expect(
      update(new StoredPoints(null), { ...FIELDS, discount: null }, events),
    ).rejects.toBeInstanceOf(PickupAddressNotFoundError);
    expect(events.traced).toHaveLength(0);
  });

  it("journalise les clientèles EFFECTIVES, pas la charge", async () => {
    const events = new RecordingPublisher();

    await update(
      new StoredPoints(PROS_ONLY),
      { ...FIELDS, discount: { mode: "percent", bp: 1_000 } },
      events,
    );

    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      discountAudiences: { b2b: true, b2c: false },
    });
  });
});

describe("CreatePickupAddressHandler — les clientèles de la remise", () => {
  it("refuse de créer un point dont la réduction ne vise personne", async () => {
    const points = new StoredPoints(null);
    const handler = new CreatePickupAddressHandler(
      points,
      new RecordingPublisher(),
      new DirectUnitOfWork(),
    );

    await expect(
      handler.execute(
        new CreatePickupAddressCommand({
          ...FIELDS,
          discount: { mode: "percent", bp: 500 },
          discountAudiences: { b2b: false, b2c: false },
        }),
      ),
    ).rejects.toBeInstanceOf(PickupDiscountWithoutAudienceError);
    expect(points.written).toBeNull();
  });
});
