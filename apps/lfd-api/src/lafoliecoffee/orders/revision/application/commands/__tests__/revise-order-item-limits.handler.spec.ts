import { FixedClock } from "../../../../../../platform/time/fixed-clock.js";
import {
  ItemLimitOverrideReasonInvalidError,
  ItemLimitPassedOnRevisionError,
  ItemLimitReasonRequiredError,
} from "../../../../domain/errors/item-limit-override-errors.js";
import type { RevisableOrder } from "../../../domain/entities/order-revision.js";
import type { OrderContent } from "../../../../application/services/order-content.js";
import { QuoteOrderRevisionHandler } from "../../queries/quote-order-revision.handler.js";
import { QuoteOrderRevisionQuery } from "../../queries/quote-order-revision.query.js";
import { ReviseOrderCommand, type RevisionItemLimits } from "../revise-order.command.js";
import { CATALOG, content, DAY, NOW, placedOrder, reviseScene } from "./revision-scene.js";

/**
 * **La modification de l'équipe qui passe outre la limite d'un produit**
 * (plan `documentation/limites-de-commande/passer-outre-la-limite-d-un-produit.md`,
 * § 3.6, lot O5) : le droit et le motif, puis une trace `revision` par SKU
 * dépassé, écrite dans la transaction de la révision, après elle.
 *
 * La scène : la règle générale ferme la veille à 18 h (ouverte à `NOW`) ; le
 * pain se commande trois jours avant — passé ; sa fiche permet de passer
 * outre. Instants de la scène, horloge FIXE.
 */
const STAFF = { kind: "staff", staffId: "stf_1" } as const;
const ADD_BREAD: OrderContent = content({
  lines: [
    { sku: "VIE-001", quantity: 10 },
    { sku: "PAI-001", quantity: 1 },
  ],
});

const GENERAL_RULE = {
  list: () =>
    Promise.resolve([
      {
        id: "general",
        pickupAddressId: null,
        pickupLabel: null,
        weekday: null,
        daysBefore: 1,
        time: "18:00",
        graceMinutes: 0,
      },
    ]),
};

const PASSABLE_BREAD = CATALOG.map((item) =>
  item.sku === "PAI-001"
    ? {
        ...item,
        orderTimeLimit: { daysBefore: 3, time: "12:00", graceMinutes: 0, staffMayExceed: true },
      }
    : { ...item, orderTimeLimit: null },
);

function scene(order: RevisableOrder) {
  return reviseScene(order, { cutoffs: GENERAL_RULE, catalogItems: PASSABLE_BREAD });
}

/** La modification qu'enverrait l'écran de l'équipe : le devis d'abord, avec le même droit. */
async function seen(
  built: ReturnType<typeof scene>,
  itemLimits: RevisionItemLimits,
): Promise<ReviseOrderCommand> {
  const quote = await new QuoteOrderRevisionHandler(
    built.wall,
    built.revising,
    new FixedClock(NOW),
  ).execute(new QuoteOrderRevisionQuery("ord_1", STAFF, ADD_BREAD, itemLimits.exceedItemLimits));
  return new ReviseOrderCommand(
    "ord_1",
    STAFF,
    0,
    ADD_BREAD,
    quote.totalCents,
    "direct",
    itemLimits,
  );
}

describe("ReviseOrderHandler — l'équipe passe outre la limite d'un produit ajouté", () => {
  it("refuse sans le droit, sans rien écrire", async () => {
    const built = scene(await placedOrder());

    await expect(
      built.handler.execute(
        new ReviseOrderCommand("ord_1", STAFF, 0, ADD_BREAD, 0, "direct", {
          exceedItemLimits: false,
          overrideReason: "Salon",
        }),
      ),
    ).rejects.toBeInstanceOf(ItemLimitPassedOnRevisionError);
    expect(built.trace).toEqual([]);
  });

  it("avec le droit, sans motif : refuse en nommant le produit, avant tout verrou", async () => {
    const built = scene(await placedOrder());
    const command = await seen(built, { exceedItemLimits: true, overrideReason: undefined });

    await expect(built.handler.execute(command)).rejects.toBeInstanceOf(
      ItemLimitReasonRequiredError,
    );
    await expect(built.handler.execute(command)).rejects.toThrow(
      "« Pain » se commande 3 jours avant, 12 h",
    );
    expect(built.trace).toEqual([]);
  });

  it("refuse un motif blanc", async () => {
    const built = scene(await placedOrder());
    const command = await seen(built, { exceedItemLimits: true, overrideReason: "   " });

    await expect(built.handler.execute(command)).rejects.toBeInstanceOf(
      ItemLimitOverrideReasonInvalidError,
    );
  });

  it("avec le motif : écrit la révision, puis une trace `revision` par produit dépassé", async () => {
    const built = scene(await placedOrder());
    const command = await seen(built, {
      exceedItemLimits: true,
      overrideReason: "  Le client l'a demandé au salon  ",
    });

    await built.handler.execute(command);

    expect(built.overrides.recorded).toEqual([
      expect.objectContaining({
        orderId: "ord_1",
        sku: "PAI-001",
        staffUserId: "stf_1",
        reason: "Le client l'a demandé au salon",
        serviceDay: DAY,
        daysBefore: 3,
        time: "12:00",
        origin: "revision",
        createdAt: NOW,
      }),
    ]);
    const saved = built.trace.findIndex((step) => step.startsWith("save:"));
    expect(saved).toBeGreaterThanOrEqual(0);
    expect(built.trace.indexOf("overrides")).toBeGreaterThan(saved);
  });

  it("le devis de l'équipe annonce la limite passée ; celui du client ne la dit pas", async () => {
    const built = scene(await placedOrder());
    const quotes = new QuoteOrderRevisionHandler(built.wall, built.revising, new FixedClock(NOW));

    const view = await quotes.execute(new QuoteOrderRevisionQuery("ord_1", STAFF, ADD_BREAD, true));
    const unchanged = await quotes.execute(
      new QuoteOrderRevisionQuery("ord_1", { kind: "customer", userId: "usr_1" }, content()),
    );

    expect(view.itemLimitOverrides).toEqual([
      expect.objectContaining({ sku: "PAI-001", daysBefore: 3, time: "12:00" }),
    ]);
    expect("itemLimitOverrides" in unchanged).toBe(false);
  });
});
