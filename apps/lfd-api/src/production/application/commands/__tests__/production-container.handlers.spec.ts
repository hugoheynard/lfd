import { ProductionContainerRepository } from "../../../domain/ports/production-container.repository.js";
import type { ContainerRule } from "../../../domain/services/production-worksheet.js";
import { RemoveProductionContainerCommand } from "../remove-production-container.command.js";
import { RemoveProductionContainerHandler } from "../remove-production-container.handler.js";
import { SetProductionContainerCommand } from "../set-production-container.command.js";
import { SetProductionContainerHandler } from "../set-production-container.handler.js";

const TOURNEUSE: ContainerRule = {
  unitsPerContainer: 10,
  singular: "tourneuse",
  plural: "tourneuses",
};

/** Le réglage doublé : il ÉTEND le port, donc aucun cast n'est nécessaire. */
class Containers extends ProductionContainerRepository {
  readonly rules = new Map<string, { rule: ContainerRule; by: string }>();
  readonly removed: string[] = [];

  save(sku: string, rule: ContainerRule, staffUserId: string): Promise<void> {
    this.rules.set(sku, { rule, by: staffUserId });
    return Promise.resolve();
  }

  remove(sku: string): Promise<void> {
    this.removed.push(sku);
    this.rules.delete(sku);
    return Promise.resolve();
  }
}

describe("SetProductionContainerHandler", () => {
  it("pose le réglage avec l'identité du guard", async () => {
    const containers = new Containers();

    await new SetProductionContainerHandler(containers).execute(
      new SetProductionContainerCommand("PAI-BAG", TOURNEUSE, "staff-1"),
    );

    expect(containers.rules.get("PAI-BAG")).toEqual({ rule: TOURNEUSE, by: "staff-1" });
  });

  it("remplace un réglage existant : le dernier est le vrai", async () => {
    const containers = new Containers();
    const handler = new SetProductionContainerHandler(containers);

    await handler.execute(new SetProductionContainerCommand("PAI-BAG", TOURNEUSE, "staff-1"));
    await handler.execute(
      new SetProductionContainerCommand(
        "PAI-BAG",
        { unitsPerContainer: 8, singular: "plaque", plural: "plaques" },
        "staff-2",
      ),
    );

    expect(containers.rules.size).toBe(1);
    expect(containers.rules.get("PAI-BAG")).toMatchObject({ by: "staff-2" });
  });
});

describe("RemoveProductionContainerHandler", () => {
  it("retire le réglage", async () => {
    const containers = new Containers();
    await containers.save("PAI-BAG", TOURNEUSE, "staff-1");

    await new RemoveProductionContainerHandler(containers).execute(
      new RemoveProductionContainerCommand("PAI-BAG"),
    );

    expect(containers.rules.has("PAI-BAG")).toBe(false);
  });

  it("ne refuse pas un SKU jamais réglé : l'état demandé est déjà là", async () => {
    const containers = new Containers();

    await new RemoveProductionContainerHandler(containers).execute(
      new RemoveProductionContainerCommand("INCONNU"),
    );

    expect(containers.removed).toEqual(["INCONNU"]);
  });
});
