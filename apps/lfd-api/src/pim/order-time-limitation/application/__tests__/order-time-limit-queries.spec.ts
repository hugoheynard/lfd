import type { OrderTimeLimitView } from "@lfd/pim-contracts";

import type { OrderTimeLimit } from "../../domain/entities/order-time-limit.js";
import { OrderTimeLimitProductNotFoundError } from "../../domain/errors/order-time-limit-errors.js";
import { OrderTimeLimitRepository } from "../../domain/ports/order-time-limit.repository.js";
import { TableProductLineage } from "../../domain/ports/__tests__/table-product-lineage.js";
import { TableTargetLabels } from "../../domain/ports/__tests__/table-target-labels.js";
import {
  ExplainProductOrderTimeLimitHandler,
  ExplainProductOrderTimeLimitQuery,
} from "../explain-product-order-time-limit.js";
import { ListOrderTimeLimitsHandler } from "../list-order-time-limits.js";

function view(over: Partial<OrderTimeLimitView> & Pick<OrderTimeLimitView, "id" | "scope">) {
  return {
    scopeLabel: null,
    daysBefore: 1,
    time: "18:00",
    graceMinutes: null,
    staffMayExceed: false,
    archived: false,
    excludedProductIds: [],
    ...over,
  } satisfies OrderTimeLimitView;
}

const PRODUCT = view({ id: "lim_p", scope: { type: "product", id: "fraisier" } });
const FAMILY = view({
  id: "lim_f",
  scope: { type: "category", id: "gateaux" },
  daysBefore: 2,
  time: "12:00",
  excludedProductIds: ["tarte"],
});
const PARENT = view({
  id: "lim_parent",
  scope: { type: "category", id: "patisserie" },
  excludedProductIds: ["fraisier"],
});
const ELSEWHERE = view({ id: "lim_e", scope: { type: "category", id: "pains" } });
const GLOBAL = view({ id: "lim_g", scope: { type: "global", id: null } });

/** Le dépôt en lecture seule : `list` et `inForce` rendent la même table. */
class ViewsOnly extends OrderTimeLimitRepository {
  constructor(private readonly rows: readonly OrderTimeLimitView[]) {
    super();
  }
  list(): Promise<readonly OrderTimeLimitView[]> {
    return Promise.resolve(this.rows);
  }
  inForce(): Promise<readonly OrderTimeLimitView[]> {
    return Promise.resolve(this.rows.filter((row) => !row.archived));
  }
  findById(): Promise<OrderTimeLimit | null> {
    return Promise.reject(new RangeError("une lecture ne charge pas d'agrégat"));
  }
  findByScope(): Promise<OrderTimeLimit | null> {
    return Promise.reject(new RangeError("une lecture ne charge pas d'agrégat"));
  }
  save(): Promise<void> {
    return Promise.reject(new RangeError("une lecture n'écrit pas"));
  }
  saveArchival(): Promise<void> {
    return Promise.reject(new RangeError("une lecture n'écrit pas"));
  }
}

describe("ListOrderTimeLimitsHandler", () => {
  it("rend produits et familles, écarte les portées retirées, nomme les exclusions", async () => {
    const labels = new TableTargetLabels({ tarte: "GAT-002" });
    const handler = new ListOrderTimeLimitsHandler(
      new ViewsOnly([
        PRODUCT,
        FAMILY,
        GLOBAL,
        view({ ...FAMILY, id: "x", excludedProductIds: ["parti"] }),
      ]),
      labels,
    );

    const rows = await handler.execute();

    expect(rows.map((row) => row.id)).toEqual(["lim_p", "lim_f", "x"]);
    expect(rows[0]?.exclusions).toEqual([]);
    expect(rows[1]?.exclusions).toEqual([{ productId: "tarte", label: "GAT-002" }]);
    expect(rows[2]?.exclusions).toEqual([{ productId: "parti", label: null }]);
    // Une seule lecture des noms pour toute la liste.
    expect(labels.asked).toHaveLength(1);
  });
});

describe("ExplainProductOrderTimeLimitHandler", () => {
  const lineage = new TableProductLineage({
    fraisier: ["gateaux", "patisserie"],
    tarte: ["gateaux", "patisserie"],
  });
  const labels = new TableTargetLabels({ gateaux: "Gâteaux", patisserie: "Pâtisserie" });
  const handler = new ExplainProductOrderTimeLimitHandler(
    new ViewsOnly([PRODUCT, FAMILY, PARENT, ELSEWHERE, GLOBAL]),
    lineage,
    labels,
  );

  it("rend la lignée nommée, les règles qui portent sur le produit, et la plus stricte", async () => {
    const effective = await handler.execute(new ExplainProductOrderTimeLimitQuery("fraisier"));

    expect(effective.lineage).toEqual([
      { id: "gateaux", label: "Gâteaux" },
      { id: "patisserie", label: "Pâtisserie" },
    ]);
    expect(effective.rules.map((entry) => [entry.rule.id, entry.excludesProduct])).toEqual([
      ["lim_p", false],
      ["lim_f", false],
      ["lim_parent", true],
    ]);
    expect(effective.explained).toEqual({
      limit: { daysBefore: 2, time: "12:00", graceMinutes: 0, staffMayExceed: false },
      from: { type: "category", id: "gateaux" },
    });
  });

  it("un produit exclu de la famille échappe à sa limite", async () => {
    const effective = await handler.execute(new ExplainProductOrderTimeLimitQuery("tarte"));

    expect(effective.rules.map((entry) => [entry.rule.id, entry.excludesProduct])).toEqual([
      ["lim_f", true],
      ["lim_parent", false],
    ]);
    expect(effective.explained?.from).toEqual({ type: "category", id: "patisserie" });
  });

  it("refuse un produit inconnu", async () => {
    await expect(
      handler.execute(new ExplainProductOrderTimeLimitQuery("fantome")),
    ).rejects.toBeInstanceOf(OrderTimeLimitProductNotFoundError);
  });
});
