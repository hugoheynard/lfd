import { PlanVersion } from "../../../domain/entities/plan-version.js";
import { PlanVersionNotFoundError } from "../../../domain/errors/plan-version-diff-errors.js";
import { PlanVersionChainReader } from "../../../domain/ports/plan-version-chain.reader.js";
import {
  PlayedDay,
  order,
  orderLine,
} from "../../../domain/services/plan-version-diff/__tests__/plan-version-diff.fixture.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { ChainPlanVersionSummaries } from "../chain-plan-version-summaries.js";

/** La chaîne doublée : les versions d'une journée jouée, et le nombre de lectures. */
class CountedChain extends PlanVersionChainReader {
  reads = 0;

  constructor(private readonly versions: readonly PlanVersion[]) {
    super();
  }

  allOf(): Promise<readonly PlanVersion[]> {
    this.reads += 1;
    return Promise.resolve(this.versions);
  }
}

const DAY = ServiceDay.of("2026-11-28");

function chain(): CountedChain {
  const played = new PlayedDay()
    .close([order("o1", { lines: [orderLine("croissant", 10)] })])
    .revise("o1", [{ sku: "croissant", quantity: 15 }])
    .retake([
      order("o1", { lines: [orderLine("croissant", 15)] }),
      order("o2", { lines: [orderLine("croissant", 5)], offPlan: true }),
    ]);
  return new CountedChain(played.versions);
}

/** Le résumé de l'e-mail du renvoi, depuis la version de chaque destinataire (lot H6). */
describe("ChainPlanVersionSummaries", () => {
  it("rend un résumé par version de départ, chacun jusqu'à la courante, en une seule lecture", async () => {
    const versions = chain();

    const summaries = await new ChainPlanVersionSummaries(versions).since(DAY, [1, 2, 1], 3);

    expect(versions.reads).toBe(1);
    expect([...summaries.keys()]).toEqual([1, 2]);
    expect(summaries.get(1)?.production).toEqual([
      expect.objectContaining({ sku: "croissant", before: 10, after: 20, delta: 10 }),
    ]);
    expect(summaries.get(1)?.changes.map((change) => change.kind)).toEqual(["revised", "entered"]);
    expect(summaries.get(2)?.production).toEqual([
      expect.objectContaining({ sku: "croissant", before: 15, after: 20, delta: 5 }),
    ]);
    expect(summaries.get(2)?.changes.map((change) => change.kind)).toEqual(["entered"]);
  });

  it("sans version de départ, ne lit rien", async () => {
    const versions = chain();

    expect((await new ChainPlanVersionSummaries(versions).since(DAY, [], 3)).size).toBe(0);
    expect(versions.reads).toBe(0);
  });

  it("refuse une version que la journée n'a pas", async () => {
    await expect(new ChainPlanVersionSummaries(chain()).since(DAY, [1], 9)).rejects.toBeInstanceOf(
      PlanVersionNotFoundError,
    );
  });
});
