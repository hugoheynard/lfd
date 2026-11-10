import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { Operation } from "../../../domain/entities/operation.js";
import { OperationNotFoundError } from "../../../domain/errors/operation-errors.js";
import {
  FixedImageLibrary,
  InMemoryOperationReader,
  InMemoryOperations,
  libraryImage,
  noel,
  preparedNoel,
  SellingSkus,
} from "../../commands/__tests__/operation-doubles.js";
import { GetOperationHandler } from "../get-operation.handler.js";
import { GetOperationQuery } from "../get-operation.query.js";
import { ListOperationsHandler } from "../list-operations.handler.js";

const IMAGE = "https://media.test/buche.webp";
const SCHEDULE = noel().schedule;
/** Les commandes sont ouvertes : après l'annonce (1er nov.), avant la clôture (21 déc.). */
const ORDERS_OPEN = new Date("2026-12-01T08:00:00.000Z");

function scene(operations: readonly Operation[]) {
  const store = new InMemoryOperations(operations);
  const ports = [
    new InMemoryOperationReader(store),
    new FixedImageLibrary([libraryImage(IMAGE, { x: 0.2, y: 0.8 }, "Une bûche roulée")]),
    new SellingSkus(["BUC-001-1"]),
    new FixedClock(ORDERS_OPEN),
  ] as const;
  return { list: new ListOperationsHandler(...ports), get: new GetOperationHandler(...ports) };
}

function composed(skus: readonly string[], key = "noel-2026"): Operation {
  const operation = preparedNoel({ key, image: { url: IMAGE, focal: { x: 0.2, y: 0.8 } } });
  operation.select(skus, { by: "staff_1", at: SCHEDULE.announceFrom });
  return operation;
}

describe("les lectures de l'écran « Opérations »", () => {
  it("dit l'image avec le texte alternatif DE LA MÉDIATHÈQUE, et ce que verra le client", async () => {
    const { get } = scene([composed(["BUC-001-1", "GAL-002-1"])]);

    expect(await get.execute(new GetOperationQuery("noel-2026"))).toMatchObject({
      image: { url: IMAGE, alt: "Une bûche roulée", focal: { x: 0.2, y: 0.8 } },
      state: "open",
      sellingSkus: ["BUC-001-1"],
      withoutSellingArticle: false,
      shopDisplay: "announcement_and_products",
      awaitingProducts: false,
      heldAtCommerce: true,
      lastWrite: { by: "staff_1" },
    });
  });

  it("commandes ouvertes sans article en vente : l'annonce seule, qui attend ses produits", async () => {
    const { list } = scene([composed(["GAL-002-1"]), composed([], "galette-2027")]);

    const views = await list.execute();

    expect(views.map((view) => [view.key, view.shopDisplay, view.awaitingProducts])).toEqual([
      ["noel-2026", "announcement_only", true],
      ["galette-2027", "announcement_only", true],
    ]);
    expect(views.every((view) => view.withoutSellingArticle)).toBe(true);
  });

  it("une masquée ou une archivée : rien en boutique", async () => {
    const hidden = composed(["BUC-001-1"]);
    hidden.setHidden(true, { by: "s", at: ORDERS_OPEN });
    const archived = composed(["BUC-001-1"], "paques-2027");
    archived.archive({ by: "s", at: ORDERS_OPEN });
    const { list } = scene([hidden, archived]);

    const views = await list.execute();

    expect(views.map((view) => [view.key, view.shopDisplay])).toEqual([
      ["noel-2026", "nothing"],
      ["paques-2027", "nothing"],
    ]);
    expect(views[1]?.archivedAt).toBe(ORDERS_OPEN.toISOString());
  });

  it("une clé inconnue : 404", async () => {
    const { get } = scene([]);

    await expect(get.execute(new GetOperationQuery("noel-2030"))).rejects.toThrow(
      OperationNotFoundError,
    );
  });
});
