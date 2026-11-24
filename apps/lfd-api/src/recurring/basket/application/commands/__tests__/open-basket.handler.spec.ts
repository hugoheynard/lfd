import type { CreateSubscriptionPayload } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { InMemoryGestureIntentLedger } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { OncePerIntent } from "../../../../../platform/intent/once-per-intent.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { OccurrencePlanner } from "../../../../occurrence/application/services/occurrence-planner.js";
import {
  FixedArticles,
  FixedSalesTerms,
  FixedStanding,
  InMemoryBaskets,
  InMemoryOccurrences,
  RecordingDurable,
} from "../../../../occurrence/application/__tests__/recurring-doubles.js";
import type { BasketArticles } from "../../../../channels/commerce/basket-articles.js";
import type { BasketSalesTerms } from "../../../../channels/commerce/basket-sales-terms.js";
import {
  BasketPublicPayerError,
  BasketSalesTermsUnpublishedError,
  OperationOnlyInSubscriptionError,
  SubscriptionSiteMembershipLostError,
  WeightArticleInSubscriptionError,
} from "../../../domain/errors/basket-errors.js";
import { BasketFacts } from "../../services/basket-facts.js";
import { BasketGestures } from "../../services/basket-gestures.js";
import { OpenBasketCommand } from "../open-basket.command.js";
import { OpenBasketHandler } from "../open-basket.handler.js";

// Le 4 novembre à Paris : la création à l'avance court jusqu'au 30 décembre.
const NOW = new Date("2026-11-04T09:00:00.000Z");

const PAYLOAD: CreateSubscriptionPayload = {
  fromOrderId: null,
  recurrence: "weekly",
  startDate: "2026-11-02",
  endDate: null,
  fulfillmentMethod: "pickup",
  deliveryAddress: null,
  pickupAddressId: "point_1",
  requestedWindow: { start: "08:00", end: "10:00" },
  lines: [{ sku: "PAN-001", quantity: 4 }],
  note: "",
};

function build(
  options: {
    articles?: BasketArticles;
    salesTerms?: BasketSalesTerms;
    publicPayers?: ReadonlySet<string>;
  } = {},
) {
  const baskets = new InMemoryBaskets();
  const occurrences = new InMemoryOccurrences();
  const durable = new RecordingDurable();
  const clock = new FixedClock(NOW);
  const standing = new FixedStanding(new Set(["user_1/chalet"]), [], options.publicPayers);
  const handler = new OpenBasketHandler(
    baskets,
    new OccurrencePlanner(occurrences, new FixedIdGenerator("occ")),
    new BasketGestures(baskets, standing),
    new BasketFacts(standing, durable, new FixedIdGenerator("gesture")),
    options.articles ?? new FixedArticles(),
    options.salesTerms ?? new FixedSalesTerms(),
    new OncePerIntent(new InMemoryGestureIntentLedger(), clock),
    new DirectUnitOfWork(),
    new FixedIdGenerator("basket"),
    clock,
  );
  return { baskets, occurrences, durable, handler };
}

const open = (companyId: string | null, payload = PAYLOAD, key = "key_1") =>
  new OpenBasketCommand("user_1", payload, companyId, key);

describe("OpenBasketHandler", () => {
  it("ouvre le panier avec les CGV en vigueur, et crée ses échéances des huit semaines", async () => {
    const { baskets, occurrences, handler } = build();

    const opened = await handler.execute(open("chalet"));

    const basket = baskets.rows.get(opened.id);
    expect(basket?.salesTerms).toEqual({ key: "salesTermsPro", revision: 3, fileId: "file_cgv_3" });
    expect(basket?.plannedUntil?.toString()).toBe("2026-12-30");
    expect(occurrences.rows.size).toBe(8);
    expect(occurrences.stateOn("2026-11-09")).toBe("planned");
  });

  it("écrit recurring.basket_opened, son site et son principal figés, une fois par panier", async () => {
    const { durable, handler } = build();

    const opened = await handler.execute(open("chalet"));
    await handler.execute(open("chalet"));

    expect(durable.facts).toEqual([
      {
        type: "recurring.basket_opened",
        key: `recurring.basket_opened:${opened.id}`,
        payload: {
          basketId: opened.id,
          buyerUserId: "user_1",
          cadence: "weekly",
          siteCompanyId: "chalet",
          siteName: "Chalet Gentiane",
          principalCompanyId: "maison",
          gestureId: null,
        },
      },
    ]);
  });

  it("refuse un payeur public, sans rien écrire", async () => {
    const { baskets, durable, handler } = build({ publicPayers: new Set(["chalet"]) });

    await expect(handler.execute(open("chalet"))).rejects.toBeInstanceOf(BasketPublicPayerError);
    expect(baskets.rows.size).toBe(0);
    expect(durable.facts).toEqual([]);
  });

  it("un panier perso s'ouvre, sans aucune échéance", async () => {
    const { occurrences, handler } = build();

    await handler.execute(open(null));

    expect(occurrences.rows.size).toBe(0);
  });

  it("un double envoi rend le même panier, sans en ouvrir un second", async () => {
    const { baskets, handler } = build();

    const first = await handler.execute(open("chalet"));
    const second = await handler.execute(open("chalet"));

    expect(second).toEqual(first);
    expect(baskets.rows.size).toBe(1);
  });

  it("refuse sans CGV publiées pour la clientèle", async () => {
    const { baskets, handler } = build({
      salesTerms: new FixedSalesTerms({ key: "salesTermsPro", revision: null, fileId: null }),
    });

    await expect(handler.execute(open("chalet"))).rejects.toBeInstanceOf(
      BasketSalesTermsUnpublishedError,
    );
    expect(baskets.rows.size).toBe(0);
  });

  it("refuse un article d'opération datée, et un article au poids", async () => {
    const operation = build({
      articles: new FixedArticles({ weightSold: new Set(), operationOnly: ["Bûche"] }),
    });
    await expect(operation.handler.execute(open("chalet"))).rejects.toBeInstanceOf(
      OperationOnlyInSubscriptionError,
    );
    const weight = build({
      articles: new FixedArticles({ weightSold: new Set(["PAN-001"]), operationOnly: [] }),
    });
    await expect(weight.handler.execute(open("chalet"))).rejects.toBeInstanceOf(
      WeightArticleInSubscriptionError,
    );
  });

  it("refuse une société dont l'acteur n'est pas membre actuel", async () => {
    const { handler } = build();

    await expect(handler.execute(open("autre"))).rejects.toBeInstanceOf(
      SubscriptionSiteMembershipLostError,
    );
  });
});
