import { PlanVersion } from "../../../domain/entities/plan-version.js";
import {
  PlanVersionNotFoundError,
  PlanVersionRangeInvertedError,
} from "../../../domain/errors/plan-version-diff-errors.js";
import { PlanVersionChainReader } from "../../../domain/ports/plan-version-chain.reader.js";
import {
  PlayedDay,
  order,
  orderLine,
} from "../../../domain/services/plan-version-diff/__tests__/plan-version-diff.fixture.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { ChainPlanVersionComparison } from "../chain-plan-version-comparison.js";
import { ChainPlanVersionListing } from "../chain-plan-version-listing.js";

/** La chaîne doublée : les versions d'une journée jouée, servies pour son jour seulement. */
class PlayedChain extends PlanVersionChainReader {
  readonly asked: string[] = [];

  constructor(private readonly versions: readonly PlanVersion[]) {
    super();
  }

  allOf(day: ServiceDay): Promise<readonly PlanVersion[]> {
    this.asked.push(day.value);
    return Promise.resolve(this.versions.filter((version) => version.serviceDay === day.value));
  }
}

const DAY = ServiceDay.of("2026-11-28");

function playedChain(): PlayedChain {
  const played = new PlayedDay()
    .close([order("o1", { lines: [orderLine("croissant", 10)] })])
    .revise("o1", [{ sku: "croissant", quantity: 15 }])
    .retake([
      order("o1", { lines: [orderLine("croissant", 15)] }),
      order("o2", { lines: [orderLine("croissant", 5)], offPlan: true }),
    ]);
  return new PlayedChain(played.versions);
}

/** Ce que le noyau répond sur ses versions : la liste et la comparaison, lues sur la chaîne. */
describe("lectures publiées des versions du plan", () => {
  it("la liste lit la chaîne du jour demandé", async () => {
    const chain = playedChain();

    const entries = await new ChainPlanVersionListing(chain).listOf(DAY);

    expect(chain.asked).toEqual(["2026-11-28"]);
    expect(entries.map((entry) => entry.cause)).toEqual(["closed", "order_revised", "retaken"]);
  });

  it("la comparaison rend le diff de la chaîne, de la version 1 à la 3", async () => {
    const diff = await new ChainPlanVersionComparison(playedChain()).compare(DAY, 1, 3);

    expect(diff.from.version).toBe(1);
    expect(diff.to.version).toBe(3);
    expect(diff.production).toEqual([
      expect.objectContaining({ sku: "croissant", before: 10, after: 20, delta: 10 }),
    ]);
    expect(diff.changes.map((change) => change.kind)).toEqual(["revised", "entered"]);
  });

  it("refuse une plage inversée et une version que la journée n'a pas", async () => {
    const comparison = new ChainPlanVersionComparison(playedChain());

    await expect(comparison.compare(DAY, 3, 1)).rejects.toBeInstanceOf(
      PlanVersionRangeInvertedError,
    );
    await expect(comparison.compare(DAY, 1, 9)).rejects.toBeInstanceOf(PlanVersionNotFoundError);
  });
});
