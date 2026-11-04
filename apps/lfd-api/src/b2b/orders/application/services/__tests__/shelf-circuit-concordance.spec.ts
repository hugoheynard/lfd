import { AppError } from "../../../../../platform/shared/errors/app-error.js";
import { gateOf } from "../../commands/__tests__/plan-doubles.js";
import { FixedShelfStock, shelfCircuitOf } from "./shelf-circuit-doubles.js";
import { CROISSANTS, SHELF_TODAY, shelfOrder, SITE, TODAY } from "./shelf-circuit-fixtures.js";

/**
 * **La vitrine, sans verrou et sous verrou, dit la même chose** — lot L4 du
 * plan `documentation/pricing/centime-et-tva/plan-un-seul-assemblage.md`
 * (§2.4 : les règles à deux implémentations, et leur concordance hors
 * concurrence). L'estimation de la saisie lit `stockShortfallOf`, la
 * passation `hold` : sur le même reste, le même refus — ou aucun.
 */

/** Le code du refus, ou `null` quand le jugement laisse passer. */
async function underLock(run: () => Promise<boolean>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    return error instanceof AppError ? error.code : "?";
  }
}

describe("ShelfCircuit — stockShortfallOf (sans verrou) = hold (sous verrou)", () => {
  const cases: readonly { readonly left: number | null; readonly wanted: number }[] = [
    { left: 0, wanted: 1 },
    { left: 1, wanted: 1 },
    { left: 2, wanted: 3 },
    { left: 5, wanted: 2 },
    { left: -1, wanted: 1 },
    { left: null, wanted: 1 },
  ];

  it.each(cases)("reste $left, demande $wanted : même verdict", async ({ left, wanted }) => {
    const stock = new FixedShelfStock().set(TODAY, SITE, left === null ? [] : CROISSANTS(left));
    const circuit = shelfCircuitOf(gateOf(), { stock });
    const order = shelfOrder(wanted);
    const advised = (await circuit.stockShortfallOf(order))?.code ?? null;
    expect(await underLock(() => circuit.hold(order))).toBe(advised);
  });

  it("sans site : les deux nomment l'absence de point, sans reste inventé", async () => {
    const circuit = shelfCircuitOf(gateOf());
    const order = shelfOrder(1, SHELF_TODAY, null);
    const advised = (await circuit.stockShortfallOf(order))?.code ?? null;
    expect(advised).not.toBeNull();
    expect(await underLock(() => circuit.hold(order))).toBe(advised);
  });

  it("fabriquée : ni l'un ni l'autre ne juge la vitrine", async () => {
    const circuit = shelfCircuitOf(gateOf());
    const order = shelfOrder(1, { supply: "planned" });
    expect(await circuit.stockShortfallOf(order)).toBeNull();
    expect(await circuit.hold(order)).toBe(false);
  });
});
