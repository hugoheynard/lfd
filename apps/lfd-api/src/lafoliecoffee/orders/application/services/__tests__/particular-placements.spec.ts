import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { CustomerCancellationDeadline } from "../../../cancellation/application/services/customer-cancellation-deadline.js";
import { FixedCancellationSettings } from "../../../cancellation/application/commands/__tests__/customer-cancellation-doubles.js";
import type { OrderToPlace } from "../../../domain/entities/order.js";
import { OrderTotalChangedError } from "../../../domain/errors/order-total-changed.error.js";
import {
  capturingRepo,
  counterPayload,
  drafting,
  FixedParticularStandings,
  PARTICULAR,
  STAFF,
} from "../../commands/__tests__/counter-particular-scene.js";
import { RecordingDurable } from "../../commands/__tests__/durable-doubles.js";
import { OfferedParticularPlacement } from "../offered-particular-placement.js";
import { type DraftPolicy, PLACEMENT_POLICY } from "../order-drafting.service.js";
import { ShopTillParticularPlacement } from "../shop-till-particular-placement.js";
import type { StaffPlacementBinding } from "../staff-order-placement.js";

/**
 * **Les passations du particulier saisies par l'équipe, partagées** par la
 * saisie (comptoir, offerte) et la transformation d'un reliquat : la politique
 * reçue atteint la composition, et ce que le cas d'usage écrit avec la
 * commande s'écrit dans sa transaction, dans l'ordre.
 */

/** Le port offert sans rejeu : ce que la politique d'un reliquat impose, isolé. */
const OFFERED_DELIVERY_POLICY: DraftPolicy = { ...PLACEMENT_POLICY, offeredDelivery: true };

function tracingBinding(trace: string[]): StaffPlacementBinding {
  return {
    beforePlace: () => {
      trace.push("before");
      return Promise.resolve();
    },
    afterPlace: (written) => {
      trace.push(`after:${written.id}`);
      return Promise.resolve();
    },
  };
}

function scene() {
  const placed: OrderToPlace[] = [];
  const trace: string[] = [];
  const ports = {
    particulars: new FixedParticularStandings({ [PARTICULAR]: "particular" }),
    drafting: drafting(),
    orders: capturingRepo(placed, trace),
    events: new RecordingPublisher(),
    unitOfWork: new DirectUnitOfWork(),
    durable: new RecordingDurable(),
    cancellationDeadline: new CustomerCancellationDeadline(new FixedCancellationSettings()),
  };
  const seal = (): Promise<void> => {
    trace.push("seal");
    return Promise.resolve();
  };
  return {
    placed,
    trace,
    seal,
    shopTill: new ShopTillParticularPlacement(ports),
    offered: new OfferedParticularPlacement(ports),
  };
}

const OFFER = { nature: "goodwill" as const, note: "Un reste du reliquat", notifyCustomer: false };

describe("ShopTillParticularPlacement — réglée en boutique, partagée", () => {
  it("règle à la caisse de la boutique, fige le délai d'annulation, au comptoir", async () => {
    const { shopTill, placed, seal } = scene();

    await shopTill.place(
      { staffUserId: STAFF, payload: counterPayload() },
      PLACEMENT_POLICY,
      tracingBinding([]),
      seal,
    );

    expect(placed[0]).toMatchObject({
      paymentStatus: "not_required",
      settlementVenue: "shop_till",
      entryOrigin: "counter",
      deliveryOffered: false,
    });
    expect(placed[0]?.customerCancellableUntil).not.toBeNull();
  });

  it("la politique reçue atteint la composition : le port offert pose le drapeau", async () => {
    const { shopTill, placed, seal } = scene();

    await shopTill.place(
      { staffUserId: STAFF, payload: counterPayload() },
      OFFERED_DELIVERY_POLICY,
      tracingBinding([]),
      seal,
    );

    expect(placed[0]).toMatchObject({ deliveryOffered: true, settlementVenue: "shop_till" });
  });

  it("dans l'ordre : le cas d'usage, la commande, ce qu'il écrit avec elle, puis le sceau", async () => {
    const { shopTill, trace, seal } = scene();

    await shopTill.place(
      { staffUserId: STAFF, payload: counterPayload() },
      PLACEMENT_POLICY,
      tracingBinding(trace),
      seal,
    );

    expect(trace).toEqual(["before", "place", "after:order_1", "seal"]);
  });

  it("un total vu périmé refuse avant toute écriture, et le cas d'usage n'a rien écrit", async () => {
    const { shopTill, trace, placed, seal } = scene();

    await expect(
      shopTill.place(
        { staffUserId: STAFF, payload: counterPayload({ expectedTotalCents: 1 }) },
        PLACEMENT_POLICY,
        tracingBinding(trace),
        seal,
      ),
    ).rejects.toBeInstanceOf(OrderTotalChangedError);
    expect(placed).toEqual([]);
    expect(trace).toEqual([]);
  });
});

describe("OfferedParticularPlacement — offerte au particulier, partagée", () => {
  it("offre à zéro, règlement différé, et la politique reçue atteint la composition", async () => {
    const { offered, placed, trace, seal } = scene();

    const result = await offered.place(
      {
        staffUserId: STAFF,
        payload: { ...counterPayload({ expectedTotalCents: 0 }), offer: OFFER },
      },
      OFFERED_DELIVERY_POLICY,
      tracingBinding(trace),
      seal,
    );

    expect(result.totalCents).toBe(0);
    expect(result.offeredTotalCents).toBe(400);
    expect(placed[0]).toMatchObject({ deliveryOffered: true, settlementVenue: null });
    expect(placed[0]?.customerCancellableUntil).not.toBeNull();
    expect(trace).toEqual(["before", "place", "after:order_1", "seal"]);
  });
});
