import { OrderCompanyNotFoundError } from "../../../../domain/errors/order-errors.js";
import { Backorder } from "../../../domain/entities/backorder.js";
import {
  BackorderClosedError,
  BackorderOriginLineMissingError,
  BackorderOriginNotFoundError,
} from "../../../domain/errors/backorder-errors.js";
import {
  BACKORDER,
  FixedBackorderReplays,
  InMemoryBackorders,
  openBackorder,
  originLine,
  originReplay,
} from "../../__tests__/backorder-conversion-doubles.js";
import {
  conversionScene,
  convertPayload,
  STAFF,
} from "../../__tests__/backorder-conversion-scene.js";
import { ConvertBackorderCommand } from "../convert-backorder.command.js";

/**
 * **Ce qui ne doit pas fermer le reliquat** : un échec de la passation, quel
 * qu'il soit, laisse le reliquat ouvert, sans commande, sans dérogation
 * dépensée et sans fait au journal — l'équipe peut corriger et recommencer.
 */

/** Le total que l'estimation du même reliquat montre : sans lui, le total vu refuserait avant le reste. */
async function seenTotal(s: ReturnType<typeof conversionScene>): Promise<number> {
  const quoted = await s.quote.execute({
    staffUserId: STAFF,
    backorderId: BACKORDER,
    payload: convertPayload(),
    exceedItemLimits: false,
  });
  return quoted.amounts?.totalCents ?? 0;
}

function command(expectedTotalCents = 0, key = "key_1"): ConvertBackorderCommand {
  return new ConvertBackorderCommand(
    STAFF,
    BACKORDER,
    convertPayload({ expectedTotalCents }),
    key,
    false,
    false,
  );
}

function sceneOf(
  backorders: InMemoryBackorders,
  origin = originReplay(),
  options: {
    readonly role?: "orders" | null;
    readonly late?: boolean;
    readonly waiver?: boolean;
  } = {},
) {
  return conversionScene({ ...options, backorders, replays: new FixedBackorderReplays(origin) });
}

describe("ConvertBackorderHandler — un refus ne ferme pas le reliquat", () => {
  it("origine introuvable : erreur nommée, ni verrou, ni commande, reliquat ouvert", async () => {
    const backorders = new InMemoryBackorders([openBackorder()]);
    const s = conversionScene({ backorders, replays: new FixedBackorderReplays(null) });

    await expect(s.convert.execute(command())).rejects.toBeInstanceOf(BackorderOriginNotFoundError);

    expect(s.trace).toEqual([]);
    expect(s.placed).toHaveLength(0);
    expect(s.journal.types()).toEqual([]);
    expect(backorders.stateOf(BACKORDER)?.state).toBe("open");
  });

  it("ligne d'origine manquante : erreur nommée, aucune commande au prix du catalogue", async () => {
    const backorders = new InMemoryBackorders([openBackorder()]);
    const s = sceneOf(backorders, originReplay({ lines: [originLine({ sku: "AUTRE-001" })] }));

    await expect(s.convert.execute(command())).rejects.toBeInstanceOf(
      BackorderOriginLineMissingError,
    );

    expect(s.placed).toHaveLength(0);
    expect(s.trace).toEqual([]);
    expect(backorders.stateOf(BACKORDER)?.state).toBe("open");
  });

  it("un acheteur qui n'est pas membre de la société du reliquat : refus, rien d'écrit", async () => {
    const backorders = new InMemoryBackorders([openBackorder()]);
    const s = sceneOf(backorders, originReplay(), { role: null, late: true, waiver: true });

    await expect(s.convert.execute(command())).rejects.toBeInstanceOf(OrderCompanyNotFoundError);

    expect(s.placed).toHaveLength(0);
    expect(s.waivers.consumed).toEqual([]);
    expect(s.journal.types()).toEqual([]);
    expect(backorders.stateOf(BACKORDER)?.state).toBe("open");
  });

  it("l'écriture du reliquat échoue : aucun fait « converti » n'est tracé", async () => {
    const backorders = new (class extends InMemoryBackorders {
      override save(): Promise<void> {
        return Promise.reject(new RangeError("base indisponible"));
      }
    })([openBackorder()]);
    const s = sceneOf(backorders);

    await expect(s.convert.execute(command(await seenTotal(s)))).rejects.toBeInstanceOf(RangeError);

    expect(s.journal.types()).toEqual([]);
    expect(backorders.stateOf(BACKORDER)?.state).toBe("open");
  });

  it("l'échec ne scelle pas la clé : la même clé, une fois corrigé, passe", async () => {
    const backorders = new InMemoryBackorders([openBackorder()]);
    const s = sceneOf(backorders, originReplay({ lines: [originLine({ sku: "AUTRE-001" })] }));
    await expect(s.convert.execute(command())).rejects.toBeInstanceOf(
      BackorderOriginLineMissingError,
    );

    const fixed = sceneOf(backorders);
    const result = await fixed.convert.execute(command(await seenTotal(fixed)));

    expect(result.id).toBe("order_1");
    expect(backorders.stateOf(BACKORDER)?.state).toBe("converted");
  });

  it("la dérogation n'est dépensée que si la commande est écrite : un refus sous verrou la laisse", async () => {
    const backorders = new (class extends InMemoryBackorders {
      override loadLocked(): Promise<Backorder | null> {
        this.trace.push("lock-backorder");
        const taken = openBackorder();
        taken.abandon(new Date("2026-08-11T16:00:00.000Z"), "staff_2");
        return Promise.resolve(taken);
      }
    })([openBackorder()]);
    const s = sceneOf(backorders, originReplay(), { late: true, waiver: true });

    await expect(s.convert.execute(command(await seenTotal(s)))).rejects.toBeInstanceOf(
      BackorderClosedError,
    );

    expect(s.waivers.consumed).toEqual([]);
    expect(s.placed).toHaveLength(0);
  });
});
