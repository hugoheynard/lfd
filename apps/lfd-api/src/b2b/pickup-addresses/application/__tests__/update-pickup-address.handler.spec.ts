import type {
  AudiencePickupDiscount,
  PickupAddressUpdatePayload,
  PickupAddressView,
} from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import {
  PickupAddressNotFoundError,
  PickupDiscountCategoryReinclusionError,
  PickupDiscountDuplicateRuleError,
} from "../../domain/pickup-errors.js";
import { UpdatePickupAddressCommand } from "../update-pickup-address.command.js";
import { UpdatePickupAddressHandler } from "../update-pickup-address.handler.js";
import { FIELDS, StoredPoints } from "./pickup-address-doubles.js";

/** −10 % aux pros, boissons exclues ; rien aux particuliers. */
const PRO_DISCOUNT: AudiencePickupDiscount = {
  adjustment: { mode: "percent", bp: 1_000 },
  scope: "all_except",
  categories: [{ categoryId: "c_boissons", eligible: false }],
  products: [],
};

const PROS_ONLY: PickupAddressView = {
  ...FIELDS,
  id: "pickup_1",
  discounts: { b2b: PRO_DISCOUNT, b2c: null },
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

describe("UpdatePickupAddressHandler — les remises par clientèle", () => {
  /**
   * Un onglet ouvert avant les remises par clientèle renvoie une charge SANS
   * elles : il ne doit effacer ni la remise ni ses règles.
   */
  it("remises absentes : garde celles de la base, règles comprises", async () => {
    const points = new StoredPoints(PROS_ONLY);

    await update(points, { ...FIELDS });

    expect(points.written?.discount.discounts).toEqual({ b2b: PRO_DISCOUNT, b2c: null });
  });

  it("remises présentes : les écrit, chaque clientèle la sienne", async () => {
    const points = new StoredPoints(PROS_ONLY);
    const individual: AudiencePickupDiscount = {
      adjustment: { mode: "amount", cents: 300 },
      scope: "only",
      categories: [],
      products: [{ productId: "p_baguette", eligible: true }],
    };

    await update(points, { ...FIELDS, discounts: { b2b: null, b2c: individual } });

    expect(points.written?.discount.discounts).toEqual({ b2b: null, b2c: individual });
  });

  it("refuse une famille incluse en « tous sauf », sans rien écrire (Q1)", async () => {
    const points = new StoredPoints(PROS_ONLY);
    const reversed: AudiencePickupDiscount = {
      ...PRO_DISCOUNT,
      categories: [{ categoryId: "c_pains", eligible: true }],
    };

    await expect(
      update(points, { ...FIELDS, discounts: { b2b: reversed, b2c: null } }),
    ).rejects.toBeInstanceOf(PickupDiscountCategoryReinclusionError);
    expect(points.written).toBeNull();
  });

  it("refuse une règle en double, sans rien écrire", async () => {
    const points = new StoredPoints(PROS_ONLY);
    const twice: AudiencePickupDiscount = {
      ...PRO_DISCOUNT,
      categories: [
        { categoryId: "c_boissons", eligible: false },
        { categoryId: "c_boissons", eligible: true },
      ],
    };

    await expect(
      update(points, { ...FIELDS, discounts: { b2b: twice, b2c: null } }),
    ).rejects.toBeInstanceOf(PickupDiscountDuplicateRuleError);
    expect(points.written).toBeNull();
  });

  it("un point introuvable est un 404, et rien n'est journalisé", async () => {
    const events = new RecordingPublisher();

    await expect(update(new StoredPoints(null), { ...FIELDS }, events)).rejects.toBeInstanceOf(
      PickupAddressNotFoundError,
    );
    expect(events.traced).toHaveLength(0);
  });

  it("journalise les remises EFFECTIVES, pas la charge", async () => {
    const events = new RecordingPublisher();

    await update(new StoredPoints(PROS_ONLY), { ...FIELDS }, events);

    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      discounts: {
        b2b: { discount: { bp: 1_000 }, scope: "all_except", categoryRules: 1, productRules: 0 },
        b2c: null,
      },
    });
  });
});

describe("UpdatePickupAddressHandler — le point GPS", () => {
  const LOCATED: PickupAddressView = { ...PROS_ONLY, gps: { lat: 45.9, lng: 6.1 } };

  /** Un onglet ouvert avant le champ (2026-09-29) n'efface pas une position saisie. */
  it("absent : garde celui de la base", async () => {
    const points = new StoredPoints(LOCATED);

    await update(points, { ...FIELDS });

    expect(points.written?.gps).toEqual({ lat: 45.9, lng: 6.1 });
  });

  it("présent : l'écrit, et `null` l'efface", async () => {
    const points = new StoredPoints(LOCATED);

    await update(points, { ...FIELDS, gps: { lat: 1, lng: 2 } });
    expect(points.written?.gps).toEqual({ lat: 1, lng: 2 });

    await update(points, { ...FIELDS, gps: null });
    expect(points.written?.gps).toBeNull();
  });
});
