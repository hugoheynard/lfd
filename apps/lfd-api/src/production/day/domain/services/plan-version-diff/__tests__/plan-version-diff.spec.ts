import { PlanVersion } from "../../../entities/plan-version.js";
import type { ProductionDaySnapshot } from "../../../entities/production-day.snapshot.js";
import {
  PlanVersionNotFoundError,
  PlanVersionRangeInvertedError,
} from "../../../errors/plan-version-diff-errors.js";
import { isEmptyPlanVersionDiff } from "../plan-version-diff-summary.js";
import { diffPlanVersions } from "../plan-version-diff.js";
import type { ShipmentChange } from "../plan-version-diff.types.js";
import {
  CUSTOMER,
  MARIE,
  MORNING,
  NIGHT,
  PlayedDay,
  order,
  orderLine,
  resupply,
  weighed,
} from "./plan-version-diff.fixture.js";

/**
 * La comparaison de deux versions du plan
 * (`documentation/fournil/plan-historique-des-tirages.md`, § 1.16 à 1.21).
 */

function kinds(changes: readonly ShipmentChange[]): readonly string[] {
  return changes.map(
    (change) => `${change.shipment.orderId}#${change.shipment.rank}:${change.kind}`,
  );
}

describe("diffPlanVersions — l'effet sur la production", () => {
  it("par article : avant, après, écart et unité, les articles inchangés omis", () => {
    const played = new PlayedDay()
      .close([
        order("ord_1", { lines: [orderLine("CRO", 10, "Croissant"), orderLine("BAG", 4)] }),
        order("ord_2", { lines: [weighed("PAIN-KG", 1500, "Pain au poids")] }),
      ])
      .retake([
        order("ord_3", { lines: [orderLine("CRO", 5, "Croissant"), weighed("PAIN-KG", 750)] }),
      ]);

    const diff = diffPlanVersions(played.versions, 1, 2);

    expect(diff.production).toEqual([
      { sku: "CRO", productName: "Croissant", saleUnit: "piece", before: 10, after: 15, delta: 5 },
      {
        sku: "PAIN-KG",
        productName: "Pain au poids",
        saleUnit: "weight",
        before: 1500,
        after: 2250,
        delta: 750,
      },
    ]);
  });

  it("une annulation après l'arrêt ne baisse pas le compte : aucun effet, une retirée", () => {
    const played = new PlayedDay().close([order("ord_1"), order("ord_2")]).withdraw("ord_2");

    const diff = diffPlanVersions(played.versions, 1, 2);

    expect(diff.production).toEqual([]);
    expect(diff.changes).toMatchObject([
      {
        kind: "withdrawn",
        shipment: {
          orderId: "ord_2",
          rank: 1,
          reference: "ORD-ord_2",
          customerLabel: "Trois Ponts",
        },
        withdrawnAt: NIGHT.toISOString(),
        withdrawnBy: CUSTOMER,
        by: { version: 2, cause: "order_withdrawn", recordedBy: CUSTOMER },
      },
    ]);
  });

  it("l'effet se lit sur le compte, pas sur les lignes : une baisse révisée laisse le compte", () => {
    const played = new PlayedDay()
      .close([order("ord_1", { lines: [orderLine("CRO", 10, "Croissant")] })])
      .revise("ord_1", [{ sku: "CRO", quantity: 6 }]);

    const diff = diffPlanVersions(played.versions, 1, 2);

    expect(diff.production).toEqual([]);
    expect(diff.changes).toEqual([
      expect.objectContaining({
        kind: "revised",
        lines: [{ sku: "CRO", productName: "Croissant", saleUnit: "piece", before: 10, after: 6 }],
      }),
    ]);
  });
});

describe("diffPlanVersions — les entrées", () => {
  it("un retirage : « retaken », et « hors plan, intégrée au retirage » quand offPlan", () => {
    const played = new PlayedDay()
      .close([order("ord_1")])
      .retake([order("ord_2", { offPlan: true }), order("ord_3", { offPlan: false })]);

    const diff = diffPlanVersions(played.versions, 1, 2);

    expect(
      diff.changes.map((change) => (change.kind === "entered" ? change.reason : change.kind)),
    ).toEqual(["retaken_off_plan", "retaken"]);
    expect(diff.changes[0]).toMatchObject({
      entry: "retaken",
      offPlan: true,
      by: { version: 2, cause: "retaken", recordedBy: MARIE },
    });
  });

  it("après une réouverture, l'entrée l'emporte sur « hors plan » ; offPlan nul reste nul", () => {
    const played = new PlayedDay()
      .close([order("ord_1")])
      .reopen()
      .close(
        [order("ord_1"), order("ord_2", { offPlan: true }), order("ord_3", { offPlan: null })],
        MORNING,
      );

    const diff = diffPlanVersions(played.versions, 1, 2);

    expect(diff.changes).toEqual([
      expect.objectContaining({ entry: "arrested_after_reopen", reason: "rearrested_off_plan" }),
      expect.objectContaining({ offPlan: null, reason: "rearrested" }),
    ]);
    expect(diff.to.closedAt).toEqual(MORNING);
  });

  it("les rangs : un second envoi d'une commande est un envoi à part", () => {
    const played = new PlayedDay().close([order("ord_1")]);
    const [first] = played.versions;
    if (first === undefined) {
      throw new TypeError("une version attendue");
    }
    const day = played.day.toSnapshot();
    const [shipment] = day.orders;
    if (shipment === undefined) {
      throw new TypeError("un envoi attendu");
    }
    const secondRank = { ...day, orders: [...day.orders, { ...shipment, rank: 2 }] };
    const versions = [first, ...nextOf(first, secondRank)];

    expect(kinds(diffPlanVersions(versions, 1, 2).changes)).toEqual(["ord_1#2:entered"]);
  });
});

describe("diffPlanVersions — lignes, sorties, réassorts", () => {
  it("modifiée pendant la réouverture : des lignes changent sans version « order_revised »", () => {
    const played = new PlayedDay()
      .close([order("ord_1", { lines: [orderLine("CRO", 10)] })])
      .reopen()
      .close([order("ord_1", { lines: [orderLine("CRO", 12), orderLine("BAG", 2)] })], MORNING);

    const diff = diffPlanVersions(played.versions, 1, 2);

    expect(diff.changes).toEqual([
      expect.objectContaining({
        kind: "modified_during_reopen",
        lines: [
          { sku: "BAG", productName: "BAG", saleUnit: "piece", before: 0, after: 2 },
          { sku: "CRO", productName: "CRO", saleUnit: "piece", before: 10, after: 12 },
        ],
      }),
    ]);
  });

  it("une retirée écartée par le nouvel arrêt sort avec sa raison, pas en orange", () => {
    const played = new PlayedDay()
      .close([order("ord_1"), order("ord_2")])
      .withdraw("ord_2")
      .reopen()
      .close([order("ord_1"), order("ord_2")], MORNING);

    const diff = diffPlanVersions(played.versions, 2, 3);

    expect(kinds(diff.changes)).toEqual(["ord_2#1:left_after_withdrawal"]);
    expect(diff.toCheck).toEqual([]);
  });

  it("un réassort lancé : il entre au compte", () => {
    const played = new PlayedDay()
      .close([order("ord_1")])
      .launch(resupply("rs_1", [orderLine("CRO", 20)]));

    const launched = diffPlanVersions(played.versions, 1, 2);

    expect(launched.resupplies).toEqual([
      expect.objectContaining({ kind: "launched", resupplyId: "rs_1", siteLabel: "Vitrine" }),
    ]);
    expect(launched.production).toEqual([
      expect.objectContaining({ sku: "CRO", before: 0, after: 20, delta: 20 }),
    ]);
  });
});

describe("diffPlanVersions — réassorts du soir", () => {
  it("un réassort du soir sort au nouvel arrêt, un autre entre", () => {
    const played = new PlayedDay()
      .close([order("ord_1")], undefined, [resupply("rs_1", [orderLine("CRO", 5)])])
      .reopen()
      .close([order("ord_1")], MORNING, [resupply("rs_2", [orderLine("CRO", 5)])]);

    const diff = diffPlanVersions(played.versions, 1, 2);

    expect(diff.resupplies.map((change) => `${change.resupplyId}:${change.kind}`)).toEqual([
      "rs_2:entered",
      "rs_1:left",
    ]);
  });
});

describe("diffPlanVersions — l'enchaînement", () => {
  it("attribue chaque changement à sa version, et un aller-retour se voit", () => {
    const played = new PlayedDay()
      .close([order("ord_1")])
      .retake([order("ord_2")], NIGHT)
      .reopen()
      .close([order("ord_1")], MORNING);

    const diff = diffPlanVersions(played.versions, 1, 3);

    expect(diff.changes).toMatchObject([{ kind: "entered", by: { version: 2 } }]);
    expect(diff.toCheck).toMatchObject([
      { shipment: { orderId: "ord_2" }, by: { version: 3, cause: "closed" } },
    ]);
    // Net, rien n'a changé pour le fournil : l'aller-retour est dans les explications.
    expect(diff.production).toEqual([]);
  });

  it("une version d'avant les versions : le diff part d'elle et le dit", () => {
    const played = new PlayedDay();
    played.day.close([order("ord_1")], new Set<string>(), NIGHT, null);
    played.retake([order("ord_1"), order("ord_2")]);
    played.retake([order("ord_3")]);

    const diff = diffPlanVersions(played.versions, 1, 2);

    expect(diff.baselineUnknown).toBe(true);
    expect(kinds(diff.changes)).toEqual(["ord_3#1:entered"]);
  });
});

describe("diffPlanVersions — les bornes", () => {
  it("deux versions identiques : un diff vide", () => {
    const played = new PlayedDay().close([order("ord_1")]).retake([order("ord_2")]);

    expect(isEmptyPlanVersionDiff(diffPlanVersions(played.versions, 2, 2))).toBe(true);
    expect(diffPlanVersions(played.versions, 2, 2).baselineUnknown).toBe(false);
  });

  it("refuse `from` après `to`", () => {
    const played = new PlayedDay().close([order("ord_1")]).retake([order("ord_2")]);

    expect(() => diffPlanVersions(played.versions, 2, 1)).toThrow(PlanVersionRangeInvertedError);
  });

  it("refuse une version absente, bornes ou intermédiaire", () => {
    const played = new PlayedDay()
      .close([order("ord_1")])
      .retake([order("ord_2")])
      .retake([order("ord_3")]);
    const [first, , third] = played.versions;
    if (first === undefined || third === undefined) {
      throw new TypeError("trois versions attendues");
    }

    expect(() => diffPlanVersions(played.versions, 1, 4)).toThrow(PlanVersionNotFoundError);
    expect(() => diffPlanVersions([first, third], 1, 3)).toThrow(PlanVersionNotFoundError);
    expect(() => diffPlanVersions([], 1, 1)).toThrow(PlanVersionNotFoundError);
  });
});

function nextOf(previous: PlanVersion, snapshot: ProductionDaySnapshot): PlanVersion[] {
  const version = PlanVersion.next(previous, snapshot, "retaken", [], MARIE, {
    id: "v_rank",
    at: NIGHT,
  });
  return version === null ? [] : [version];
}
