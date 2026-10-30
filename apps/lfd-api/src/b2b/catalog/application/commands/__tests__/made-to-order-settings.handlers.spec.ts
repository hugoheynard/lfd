import { CatalogItemNotFoundError } from "../../../domain/errors/catalog-not-found.error.js";
import { SetMadeToOrderCommand } from "../set-made-to-order.command.js";
import { SetMadeToOrderHandler } from "../set-made-to-order.handler.js";
import { SetReservedVisibilityCommand } from "../set-reserved-visibility.command.js";
import { SetReservedVisibilityHandler } from "../set-reserved-visibility.handler.js";
import { facts, NAME, SKU } from "./catalog-decision-doubles.js";
import { buildMadeToOrder, NOW } from "./made-to-order-doubles.js";

function setup() {
  const doubles = buildMadeToOrder();
  const { items, settings, events, uow, clock } = doubles;
  return {
    ...doubles,
    mark: new SetMadeToOrderHandler(items, settings, events, uow, clock),
    visibility: new SetReservedVisibilityHandler(items, settings, events, uow, clock),
  };
}

describe("SetMadeToOrderHandler — le marqueur sur mesure", () => {
  it("marquer : l'écriture, puis le fait, sous l'article et son nom", async () => {
    const { mark, events, steps, settings } = setup();

    await mark.execute(new SetMadeToOrderCommand(SKU, true));

    expect(steps).toEqual([`made-to-order:${SKU}`, "journal:catalog_item.made_to_order_marked"]);
    expect(facts(events)).toEqual([
      {
        type: "catalog_item.made_to_order_marked",
        subjectType: "catalog_item",
        subjectId: SKU,
        payload: { subjectLabel: NAME, sku: SKU },
      },
    ]);
    expect(settings.at).toEqual([NOW]);
  });

  it("démarquer un article marqué journalise « unmarked »", async () => {
    const { mark, events } = setup();
    await mark.execute(new SetMadeToOrderCommand(SKU, true));

    await mark.execute(new SetMadeToOrderCommand(SKU, false));

    expect(events.factTypes()).toEqual([
      "catalog_item.made_to_order_marked",
      "catalog_item.made_to_order_unmarked",
    ]);
  });

  it("un geste sans effet n'écrit aucun fait", async () => {
    const { mark, events } = setup();

    await mark.execute(new SetMadeToOrderCommand(SKU, false));

    expect(events.factTypes()).toEqual([]);
  });

  it("refuse un article qui n'est plus au catalogue, sans rien écrire", async () => {
    const { mark, steps } = setup();

    await expect(mark.execute(new SetMadeToOrderCommand("RETIRE-1", true))).rejects.toBeInstanceOf(
      CatalogItemNotFoundError,
    );
    expect(steps).toEqual([]);
  });
});

describe("SetReservedVisibilityHandler — ce que voient les autres pros", () => {
  it("passer en « visible, non commandable » journalise l'état d'après", async () => {
    const { visibility, events } = setup();

    await visibility.execute(new SetReservedVisibilityCommand(SKU, "visible_locked"));

    expect(facts(events)).toEqual([
      {
        type: "catalog_item.reserved_visibility_set",
        subjectType: "catalog_item",
        subjectId: SKU,
        payload: { subjectLabel: NAME, sku: SKU, visibility: "visible_locked" },
      },
    ]);
  });

  it("reposer le défaut (« invisible ») sur un article jamais réglé n'écrit aucun fait", async () => {
    const { visibility, events } = setup();

    await visibility.execute(new SetReservedVisibilityCommand(SKU, "hidden"));

    expect(events.factTypes()).toEqual([]);
  });

  it("refuse un article qui n'est plus au catalogue", async () => {
    const { visibility } = setup();

    await expect(
      visibility.execute(new SetReservedVisibilityCommand("RETIRE-1", "hidden")),
    ).rejects.toBeInstanceOf(CatalogItemNotFoundError);
  });
});
