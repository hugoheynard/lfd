import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { RecordingShelfStockLock } from "../../../../resupply/application/__tests__/shelf-stock-doubles.js";
import type { RevisableOrder } from "../../../domain/entities/order-revision.js";
import { CardOrderNotRevisableError } from "../../../domain/errors/order-revision-errors.js";
import { SameDayOrderClosedError } from "../../../domain/errors/same-day-order-closed.error.js";
import {
  NoPickupLeftTodayError,
  ShelfStockShortError,
} from "../../../domain/errors/shelf-circuit-errors.js";
import {
  ShelfOrderNotTodayError,
  ShelfOrderRouteChangeError,
} from "../../../domain/errors/shelf-order-errors.js";
import type { SameDayCircuitSettings } from "../../../domain/ports/same-day-order.reader.js";
import {
  FixedShelfStock,
  FixedSiteDays,
  shelfCircuitOf,
  siteDay,
} from "../../services/__tests__/shelf-circuit-doubles.js";
import { revisionBlockReasonOf } from "../../../domain/services/order-revisability.js";
import { OrderPlanGate } from "../../services/order-plan-gate.service.js";
import { ReviseOrderCommand } from "../revise-order.command.js";
import { FixedClosedPlans, FixedSameDay, RecordingAdmissionDesk } from "./plan-doubles.js";
import {
  content,
  DAY,
  LABO_POINT,
  NEXT_DAY,
  placedOrder,
  reviseScene,
  revisingAt,
} from "./revision-scene.js";

/**
 * **Modifier une commande prise sur la vitrine** (plan
 * `documentation/limites-de-commande/plan-jour-meme-sur-stock.md`, §12
 * bloquant 2, §13, lot L5) : les lignes et les quantités changent dans la
 * limite du reste, sous le verrou du stock ; ni guichet du fournil, ni verrou
 * de journée, ni suivi du BL ; la route ne bouge pas ; la carte reste refusée
 * (M1, limite acceptée par Hugo le 2026-11-02).
 *
 * Les dates sont celles de la scène, comparées à son horloge FIXE (exception
 * étroite du CLAUDE.md §5).
 */

/** 10 h à Paris, le jour de service : « aujourd'hui » est `DAY`. */
const SHELF_NOW = new Date("2026-11-10T09:00:00.000Z");
const CUSTOMER = { kind: "customer", userId: "usr_1" } as const;
const STAFF = { kind: "staff", staffId: "stf_1" } as const;

interface ShelfScene {
  readonly left?: number;
  readonly sameDay?: boolean | Partial<SameDayCircuitSettings>;
  readonly now?: Date;
  readonly proPickupEnd?: string | null;
}

/** Le plan du jour ARRÊTÉ : une commande fabriquée serait refusée au client. */
function shelfMount(scene: ShelfScene = {}) {
  const now = scene.now ?? SHELF_NOW;
  const admission = new RecordingAdmissionDesk([DAY]);
  const plans = new OrderPlanGate(
    new FixedClosedPlans([DAY]),
    admission,
    new FixedSameDay(scene.sameDay ?? true),
    new FixedClock(now),
  );
  const lock = new RecordingShelfStockLock();
  const stock = new FixedShelfStock().set(DAY, LABO_POINT.id, [
    {
      sku: "VIE-001",
      label: "Croissant",
      saleUnit: "piece",
      receivedQuantity: 20,
      estimatedStock: scene.left ?? 5,
    },
  ]);
  const end = scene.proPickupEnd === undefined ? "19:00" : scene.proPickupEnd;
  const sites = new FixedSiteDays(
    new Map([
      [LABO_POINT.id, siteDay({ proPickup: end === null ? null : { start: "07:00", end } })],
    ]),
  );
  const shelf = shelfCircuitOf(plans, {
    lock,
    stock,
    sites,
    now,
    sameDay: new FixedSameDay(scene.sameDay ?? true),
  });
  return { plans, admission, lock, stock, shelf };
}

function shelfOrder(over: Partial<RevisableOrder> = {}): Promise<RevisableOrder> {
  return placedOrder({ supply: "shelf", ...over });
}

function revise(actor: typeof CUSTOMER | typeof STAFF, quantity: number, more = {}) {
  return new ReviseOrderCommand(
    "ord_1",
    actor,
    0,
    content({ lines: [{ sku: "VIE-001", quantity }], ...more }),
  );
}

describe("ReviseOrderHandler — une commande sur stock (L5)", () => {
  it("une hausse dans la limite du reste : écrite sous le verrou du stock, sans fournil ni journée", async () => {
    const mount = shelfMount({ left: 5 });
    const { handler, trace, desk, notes, revisions } = reviseScene(await shelfOrder(), {
      plans: mount.plans,
      shelf: mount.shelf,
    });

    await handler.execute(revise(STAFF, 15));

    expect(revisions.saved).toHaveLength(1);
    expect(mount.lock.taken).toEqual([`${DAY}:${LABO_POINT.id}`]);
    expect(desk.noted).toEqual([]);
    expect(mount.admission.held).toEqual([]);
    expect(notes.calls).toEqual([]);
    expect(trace.filter((step) => step.startsWith("desk:"))).toEqual([]);
  });

  it("le client pro en ligne aussi, sur un plan arrêté : le circuit remplace l'arrêt", async () => {
    const mount = shelfMount({ left: 5 });
    const { handler, revisions } = reviseScene(await shelfOrder(), {
      plans: mount.plans,
      shelf: mount.shelf,
    });

    await handler.execute(revise(CUSTOMER, 12));

    expect(revisions.saved).toHaveLength(1);
  });

  it("une hausse au-delà du reste est refusée, rien n'est écrit", async () => {
    const mount = shelfMount({ left: 5 });
    const { handler, revisions } = reviseScene(await shelfOrder(), {
      plans: mount.plans,
      shelf: mount.shelf,
    });

    await expect(handler.execute(revise(STAFF, 16))).rejects.toBeInstanceOf(ShelfStockShortError);
    expect(revisions.saved).toEqual([]);
  });

  it("une baisse rend le stock, même vitrine vide", async () => {
    const mount = shelfMount({ left: 0 });
    const { handler, revisions } = reviseScene(await shelfOrder(), {
      plans: mount.plans,
      shelf: mount.shelf,
    });

    await handler.execute(revise(STAFF, 4));

    expect(revisions.saved).toHaveLength(1);
  });

  it("un article absent de la vitrine ne s'ajoute pas", async () => {
    const mount = shelfMount({ left: 5 });
    const { handler } = reviseScene(await shelfOrder(), { plans: mount.plans, shelf: mount.shelf });

    await expect(
      handler.execute(
        new ReviseOrderCommand(
          "ord_1",
          STAFF,
          0,
          content({
            lines: [
              { sku: "VIE-001", quantity: 10 },
              { sku: "PAI-001", quantity: 1 },
            ],
          }),
        ),
      ),
    ).rejects.toBeInstanceOf(ShelfStockShortError);
  });

  it("changer la journée est refusé", async () => {
    const mount = shelfMount();
    const { handler } = reviseScene(await shelfOrder(), { plans: mount.plans, shelf: mount.shelf });

    await expect(
      handler.execute(revise(STAFF, 10, { requestedDeliveryDate: NEXT_DAY })),
    ).rejects.toMatchObject({ code: "orders.revise.shelf_route", change: "date" });
  });

  it("passer en livraison est refusé", async () => {
    const mount = shelfMount();
    const { handler } = reviseScene(await shelfOrder(), { plans: mount.plans, shelf: mount.shelf });

    await expect(
      handler.execute(
        revise(STAFF, 10, {
          fulfillmentMethod: "delivery",
          pickupAddressId: null,
          requestedWindow: { start: null, end: "10:00" },
          deliveryAddress: {
            label: "",
            ligne1: "2 rue Neuve",
            ligne2: "",
            codePostal: "73150",
            ville: "Val d'Isère",
            pays: "France",
          },
        }),
      ),
    ).rejects.toBeInstanceOf(ShelfOrderRouteChangeError);
  });

  it("une commande sur stock réglée par carte reste non modifiable (M1)", async () => {
    const mount = shelfMount();
    const order = await shelfOrder({
      paymentStatus: "pending",
      stripePaymentIntentId: "pi_1",
    });
    const { handler } = reviseScene(order, { plans: mount.plans, shelf: mount.shelf });

    await expect(handler.execute(revise(STAFF, 11))).rejects.toBeInstanceOf(
      CardOrderNotRevisableError,
    );
    expect(mount.lock.taken).toEqual([]);
  });

  it("la clientèle que le réglage ferme ne modifie pas", async () => {
    const mount = shelfMount({ sameDay: { sameDayProAllowed: true, sameDayProOnline: false } });
    const { handler } = reviseScene(await shelfOrder(), { plans: mount.plans, shelf: mount.shelf });

    await expect(handler.execute(revise(CUSTOMER, 11))).rejects.toBeInstanceOf(
      SameDayOrderClosedError,
    );
  });

  it("le pro en ligne, fenêtre de retrait finie : refusé ; l'équipe au comptoir, non", async () => {
    const mount = shelfMount({ proPickupEnd: "09:00" });
    const { handler, revisions } = reviseScene(await shelfOrder(), {
      plans: mount.plans,
      shelf: mount.shelf,
    });

    await expect(handler.execute(revise(CUSTOMER, 11))).rejects.toBeInstanceOf(
      NoPickupLeftTodayError,
    );
    await handler.execute(revise(STAFF, 11));
    expect(revisions.saved).toHaveLength(1);
  });

  it("une commande sur stock d'un jour passé ne se modifie plus", async () => {
    const mount = shelfMount({ now: new Date("2026-11-11T09:00:00.000Z") });
    const { handler } = reviseScene(await shelfOrder(), { plans: mount.plans, shelf: mount.shelf });

    await expect(handler.execute(revise(STAFF, 11))).rejects.toBeInstanceOf(
      ShelfOrderNotTodayError,
    );
  });
});

describe("ReviseOrderHandler — une commande sur stock, aux bornes de la journée et du reste", () => {
  it("une commande sur stock d'un jour À VENIR ne se modifie pas non plus", async () => {
    // « Aujourd'hui » est le seul jour servi : la veille de la scène, la commande est future.
    const mount = shelfMount({ now: new Date("2026-11-09T09:00:00.000Z") });
    const { handler, revisions } = reviseScene(await shelfOrder(), {
      plans: mount.plans,
      shelf: mount.shelf,
    });

    await expect(handler.execute(revise(STAFF, 11))).rejects.toBeInstanceOf(
      ShelfOrderNotTodayError,
    );
    expect(revisions.saved).toEqual([]);
    expect(mount.lock.taken).toEqual([]);
  });

  it("le verdict d'une commande d'un jour passé est shelf_closed, même pour l'équipe", async () => {
    const mount = shelfMount({ now: new Date("2026-11-11T09:00:00.000Z") });
    const revising = revisingAt(new FixedClock(new Date("2026-11-11T09:00:00.000Z")), {
      plans: mount.plans,
      shelf: mount.shelf,
    });

    expect(await revising.revisabilityOf(await shelfOrder(), "staff", null)).toMatchObject({
      revisable: false,
      block: { kind: "shelf_closed" },
    });
  });

  it("une hausse égale au reste passe, d'une pièce de plus elle est refusée", async () => {
    const mount = shelfMount({ left: 1 });
    const { handler, revisions } = reviseScene(await shelfOrder(), {
      plans: mount.plans,
      shelf: mount.shelf,
    });

    await handler.execute(revise(STAFF, 11));
    expect(revisions.saved).toHaveLength(1);

    const refused = shelfMount({ left: 1 });
    const scene = reviseScene(await shelfOrder(), { plans: refused.plans, shelf: refused.shelf });
    await expect(scene.handler.execute(revise(STAFF, 12))).rejects.toBeInstanceOf(
      ShelfStockShortError,
    );
    expect(scene.revisions.saved).toEqual([]);
  });
});

describe("OrderRevising.revisabilityOf — une commande sur stock (L5)", () => {
  it("modifiable pour l'équipe, sans heure limite, sur un plan arrêté", async () => {
    const mount = shelfMount();
    const revising = revisingAt(new FixedClock(SHELF_NOW), {
      plans: mount.plans,
      shelf: mount.shelf,
    });

    expect(await revising.revisabilityOf(await shelfOrder(), "staff", null)).toEqual({
      revisable: true,
      until: null,
    });
  });

  it("fermée au client, le verdict dit la phrase du circuit", async () => {
    const mount = shelfMount({ proPickupEnd: null });
    const revising = revisingAt(new FixedClock(SHELF_NOW), {
      plans: mount.plans,
      shelf: mount.shelf,
    });

    const verdict = await revising.revisabilityOf(await shelfOrder(), "customer", null);

    expect(verdict).toMatchObject({ revisable: false, block: { kind: "shelf_closed" } });
    expect(verdict.revisable ? "" : revisionBlockReasonOf(verdict.block)).toContain(
      "n'a plus de créneau de retrait aujourd'hui",
    );
  });
});
