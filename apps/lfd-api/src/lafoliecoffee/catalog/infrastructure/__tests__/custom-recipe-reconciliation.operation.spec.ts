import type { CommandBus } from "@nestjs/cqrs";

import {
  VariantCustomRecipeMarker,
  type CustomRecipeTarget,
} from "../../../../pim/channels/b2b-platform/custom-recipe/variant-custom-recipe-marker.js";
import { ReleaseArticleCommand } from "../../application/commands/release-article.command.js";
import {
  AttributedOrdinaryArticles,
  CustomRecipeReconciliationOperation,
  type Candidate,
} from "../custom-recipe-reconciliation.operation.js";

/** Les candidats qu'on lui donne, et eux seuls. */
class GivenArticles extends AttributedOrdinaryArticles {
  constructor(private readonly rows: readonly Candidate[]) {
    super();
  }
  list(): Promise<readonly Candidate[]> {
    return Promise.resolve(this.rows);
  }
}

class RecordingMarker extends VariantCustomRecipeMarker {
  readonly marked: CustomRecipeTarget[] = [];
  markCustomRecipe(target: CustomRecipeTarget): Promise<void> {
    this.marked.push(target);
    return Promise.resolve();
  }
}

function world(rows: readonly Candidate[]) {
  const marker = new RecordingMarker();
  const executed: unknown[] = [];
  const commands: Pick<CommandBus, "execute"> = {
    execute: <T, R>(command: T): Promise<R> => {
      executed.push(command);
      return Promise.resolve(undefined as R);
    },
  };
  return {
    marker,
    executed,
    operation: new CustomRecipeReconciliationOperation(new GivenArticles(rows), marker, commands),
  };
}

const ON_SALE: Candidate = {
  sku: "PAIN-2KG",
  productId: "prd_1",
  variantId: "var_1",
  withdrawn: false,
  companyIds: ["co_a", "co_b"],
};
const WITHDRAWN: Candidate = { ...ON_SALE, sku: "OLD-1", withdrawn: true, companyIds: ["co_a"] };
const NO_VARIANT: Candidate = { ...ON_SALE, sku: "LEGACY-1", variantId: null };

describe("CustomRecipeReconciliationOperation — les articles attribués passent sur mesure (D5)", () => {
  it("la simulation compte chaque cas et n'écrit rien", async () => {
    const { operation, marker, executed } = world([ON_SALE, WITHDRAWN, NO_VARIANT]);

    const report = await operation.simulate();

    expect(report).toMatchObject({ writable: 2, byHand: 1 });
    expect(report.sample).toEqual([
      "PAIN-2KG — 2 compte(s)",
      "OLD-1 — 1 compte(s), retiré",
      "LEGACY-1 — 2 compte(s)",
    ]);
    expect(marker.marked).toEqual([]);
    expect(executed).toEqual([]);
  });

  it("passe sur mesure au référentiel l'article en vente, attributions gardées", async () => {
    const { operation, marker, executed } = world([ON_SALE]);

    await operation.apply({ actor: "stf_1", progress: () => Promise.resolve() });

    expect(marker.marked).toEqual([{ productId: "prd_1", variantId: "var_1" }]);
    expect(executed).toEqual([]);
  });

  it("libère, compte par compte, l'article retiré de la vente", async () => {
    const { operation, marker, executed } = world([WITHDRAWN]);

    await operation.apply({ actor: "stf_1", progress: () => Promise.resolve() });

    expect(marker.marked).toEqual([]);
    expect(executed).toEqual([new ReleaseArticleCommand("OLD-1", "co_a")]);
  });

  it("laisse à la main l'article sans déclinaison connue", async () => {
    const { operation, marker, executed } = world([NO_VARIANT]);

    const report = await operation.apply({ actor: "stf_1", progress: () => Promise.resolve() });

    expect(report).toMatchObject({ writable: 0, byHand: 1 });
    expect(marker.marked).toEqual([]);
    expect(executed).toEqual([]);
  });

  it("n'a plus rien à faire quand aucun article ordinaire n'est attribué", async () => {
    const { operation } = world([]);

    await expect(operation.simulate()).resolves.toMatchObject({ writable: 0, byHand: 0 });
  });
});
