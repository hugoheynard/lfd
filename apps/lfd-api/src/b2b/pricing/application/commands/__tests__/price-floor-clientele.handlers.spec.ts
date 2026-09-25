/**
 * **La clientèle d'une limite, à travers les trois gestes** — poser, confirmer,
 * archiver (`documentation/comptabilite/plan-limites-de-prix.md` §4).
 *
 * Ce que cette suite tient : chaque handler cherche la limite par **portée +
 * clientèle**, et journalise sous la clé qui la sépare de l'autre clientèle.
 * Sans la clientèle, un geste public retrouverait la limite pro de la même
 * portée — la base n'y verrait aucun chevauchement.
 *
 * Le dépôt est doublé par une vraie sous-classe du port. Les dates sont
 * absolues : aucune n'est comparée au mur, seulement à la fixture.
 */
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { InMemoryProductCatalog } from "../../../../catalog/infrastructure/in-memory-product-catalog.js";
import {
  PricingFloor,
  floorScopeKey,
  type FloorClientele,
} from "../../../domain/entities/pricing-floor.js";
import { PricingFloorRepository } from "../../../domain/ports/pricing-floor.repository.js";
import { PriceFloorNotFoundError } from "../../../domain/pricing-errors.js";
import { ArchivePriceFloorCommand } from "../archive-price-floor.command.js";
import { ArchivePriceFloorHandler } from "../archive-price-floor.handler.js";
import { ConfirmPriceFloorCommand } from "../confirm-price-floor.command.js";
import { ConfirmPriceFloorHandler } from "../confirm-price-floor.handler.js";
import { SetPriceFloorCommand } from "../set-price-floor.command.js";
import { SetPriceFloorHandler } from "../set-price-floor.handler.js";
import type { PriceFloorPolicy } from "../../../domain/floor-policy.js";
import type { PriceScope } from "../../../domain/price-rule.js";
import type { PricingAct } from "../../../domain/pricing-act.js";

const AT = new Date("2026-06-15T09:00:00.000Z");
const GLOBAL: PriceScope = { type: "global", id: null };
const WALL: PriceFloorPolicy = { hard: { mode: "percent", bp: 6_000 }, dynamic: null };

/** Un dépôt en mémoire : il borne la précédente de la MÊME portée et clientèle. */
class InMemoryFloors extends PricingFloorRepository {
  floors: PricingFloor[] = [];
  readonly archived = new Set<string>();
  readonly acts: PricingAct[] = [];

  pose(floor: PricingFloor, act: PricingAct): Promise<void> {
    const state = floor.toPersistence();
    this.floors = this.floors.map((other) =>
      this.inForce(other, state.scope, state.clientele, state.validFrom)
        ? other.closedAt(state.validFrom)
        : other,
    );
    this.floors.push(floor);
    this.acts.push(act);
    return Promise.resolve();
  }

  inForceFor(scope: PriceScope, clientele: FloorClientele, at: Date): Promise<PricingFloor | null> {
    return Promise.resolve(
      this.floors.find((floor) => this.inForce(floor, scope, clientele, at)) ?? null,
    );
  }

  archive(id: string, act: PricingAct): Promise<boolean> {
    if (this.archived.has(id)) {
      return Promise.resolve(false);
    }
    this.archived.add(id);
    this.acts.push(act);
    return Promise.resolve(true);
  }

  private inForce(
    floor: PricingFloor,
    scope: PriceScope,
    clientele: FloorClientele,
    at: Date,
  ): boolean {
    const state = floor.toPersistence();
    return (
      !this.archived.has(state.id) &&
      state.clientele === clientele &&
      floorScopeKey(state.scope) === floorScopeKey(scope) &&
      state.validFrom <= at &&
      (state.validTo === null || state.validTo > at)
    );
  }
}

function setup(): {
  readonly floors: InMemoryFloors;
  readonly set: SetPriceFloorHandler;
  readonly confirm: ConfirmPriceFloorHandler;
  readonly archive: ArchivePriceFloorHandler;
} {
  const floors = new InMemoryFloors();
  const catalog = new InMemoryProductCatalog([]);
  const clock = new FixedClock(AT);
  const ids = new FixedIdGenerator("flr");
  return {
    floors,
    set: new SetPriceFloorHandler(floors, catalog, clock, ids),
    confirm: new ConfirmPriceFloorHandler(floors, catalog, clock, ids),
    archive: new ArchivePriceFloorHandler(floors, clock, catalog),
  };
}

describe("la clientèle d'une limite, geste par geste", () => {
  it("🔴 poser une limite publique laisse la limite pro en vigueur", async () => {
    const { floors, set } = setup();
    await set.execute(new SetPriceFloorCommand(GLOBAL, "pro", WALL, "staff_1"));

    await set.execute(new SetPriceFloorCommand(GLOBAL, "public", WALL, "staff_1"));

    const pro = await floors.inForceFor(GLOBAL, "pro", AT);
    expect(pro?.clientele).toBe("pro");
    expect(pro?.toPersistence().validTo).toBeNull();
    // La publique est une PREMIÈRE pose, pas le remplacement de la pro.
    expect(floors.acts.map((act) => act.kind)).toEqual(["posed", "posed"]);
  });

  it("journalise la pro sous la clé d'avant, la publique sous `public:`, et nomme la clientèle", async () => {
    const { floors, set } = setup();

    await set.execute(new SetPriceFloorCommand(GLOBAL, "pro", WALL, "staff_1"));
    await set.execute(new SetPriceFloorCommand(GLOBAL, "public", WALL, "staff_1"));

    expect(floors.acts.map((act) => [act.subjectId, act.summary])).toEqual([
      ["global:", "Limite pro · mur à 60 % du tarif"],
      ["public:global:", "Limite publique · mur à 60 % du tarif"],
    ]);
  });

  it("confirmer en public repose la publique, et ne touche pas la pro", async () => {
    const { floors, set, confirm } = setup();
    await set.execute(new SetPriceFloorCommand(GLOBAL, "pro", WALL, "staff_1"));
    await set.execute(new SetPriceFloorCommand(GLOBAL, "public", WALL, "staff_1"));
    const proBefore = await floors.inForceFor(GLOBAL, "pro", AT);

    await confirm.execute(new ConfirmPriceFloorCommand(GLOBAL, "public", "staff_2"));

    expect((await floors.inForceFor(GLOBAL, "pro", AT))?.id).toBe(proBefore?.id);
    expect((await floors.inForceFor(GLOBAL, "public", AT))?.clientele).toBe("public");
    expect(floors.acts.at(-1)).toMatchObject({ kind: "confirmed", subjectId: "public:global:" });
  });

  it("archiver en public retire la publique, et laisse la pro en vigueur", async () => {
    const { floors, set, archive } = setup();
    await set.execute(new SetPriceFloorCommand(GLOBAL, "pro", WALL, "staff_1"));
    await set.execute(new SetPriceFloorCommand(GLOBAL, "public", WALL, "staff_1"));

    await archive.execute(new ArchivePriceFloorCommand(GLOBAL, "public", "staff_2", null));

    expect(await floors.inForceFor(GLOBAL, "public", AT)).toBeNull();
    expect(await floors.inForceFor(GLOBAL, "pro", AT)).not.toBeNull();
    expect(floors.acts.at(-1)).toMatchObject({ kind: "archived", subjectId: "public:global:" });
  });

  it("refuse de confirmer une publique absente, même quand une pro existe — en la nommant", async () => {
    const { set, confirm } = setup();
    await set.execute(new SetPriceFloorCommand(GLOBAL, "pro", WALL, "staff_1"));

    const refusal = confirm.execute(new ConfirmPriceFloorCommand(GLOBAL, "public", "staff_2"));

    await expect(refusal).rejects.toBeInstanceOf(PriceFloorNotFoundError);
    await expect(refusal).rejects.toThrow("Aucune limite publique posée");
  });
});
