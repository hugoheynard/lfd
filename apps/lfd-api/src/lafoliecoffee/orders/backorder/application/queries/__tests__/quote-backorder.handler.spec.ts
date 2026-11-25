import { Backorder } from "../../../domain/entities/backorder.js";
import {
  BackorderClosedError,
  BackorderNotFoundError,
  BackorderOriginNotFoundError,
  ParticularBackorderNotConvertibleError,
} from "../../../domain/errors/backorder-errors.js";
import {
  BACKORDER,
  FixedBackorderReplays,
  InMemoryBackorders,
  openBackorder,
  originReplay,
} from "../../__tests__/backorder-conversion-doubles.js";
import {
  conversionScene,
  quotePayload,
  STAFF,
} from "../../__tests__/backorder-conversion-scene.js";
import { QuoteBackorderQuery } from "../quote-backorder.query.js";

/**
 * **L'estimation d'un reliquat** : même chemin que la transformation, mais
 * elle n'écrit rien — ni verrou, ni commande, ni dérogation consommée — et
 * refuse les mêmes cas.
 */

function query(): QuoteBackorderQuery {
  return new QuoteBackorderQuery(STAFF, BACKORDER, quotePayload(), false);
}

function sceneOf(backorder: Backorder | null, origin = originReplay(), late = false) {
  const backorders = new InMemoryBackorders(backorder === null ? [] : [backorder]);
  return {
    backorders,
    ...conversionScene({
      late,
      waiver: true,
      lateFee: true,
      backorders,
      replays: new FixedBackorderReplays(origin),
    }),
  };
}

describe("QuoteBackorderHandler — refus", () => {
  it("un reliquat inconnu : 404 nommé", async () => {
    await expect(sceneOf(null).quote.execute(query())).rejects.toBeInstanceOf(
      BackorderNotFoundError,
    );
  });

  it("un reliquat de particulier : refusé", async () => {
    const s = sceneOf(openBackorder({ companyId: null }));

    await expect(s.quote.execute(query())).rejects.toBeInstanceOf(
      ParticularBackorderNotConvertibleError,
    );
  });

  it("un reliquat transformé ou abandonné : refusé, comme la transformation le refuserait", async () => {
    const converted = openBackorder();
    converted.convert("order_x", new Date("2026-08-11T16:00:00.000Z"), STAFF);
    const abandoned = openBackorder();
    abandoned.abandon(new Date("2026-08-11T16:00:00.000Z"), STAFF);

    for (const closed of [converted, abandoned]) {
      await expect(sceneOf(closed).quote.execute(query())).rejects.toBeInstanceOf(
        BackorderClosedError,
      );
    }
  });

  it("une origine introuvable : erreur nommée", async () => {
    const backorders = new InMemoryBackorders([openBackorder()]);
    const s = conversionScene({ backorders, replays: new FixedBackorderReplays(null) });

    await expect(s.quote.execute(query())).rejects.toBeInstanceOf(BackorderOriginNotFoundError);
  });
});

describe("QuoteBackorderHandler — n'écrit rien", () => {
  it("estimer après l'heure, avec dérogation ouverte : ni verrou, ni commande, ni dérogation dépensée", async () => {
    const s = sceneOf(openBackorder(), originReplay(), true);

    const view = await s.quote.execute(query());

    expect(view.amounts).not.toBeNull();
    expect(s.trace).toEqual([]);
    expect(s.placed).toHaveLength(0);
    expect(s.waivers.consumed).toEqual([]);
    expect(s.journal.types()).toEqual([]);
    expect(s.backorders.saved).toHaveLength(0);
    expect(s.backorders.stateOf(BACKORDER)?.state).toBe("open");
  });

  it("l'estimation, répétée, rend le même total (pas d'état consommé entre deux appels)", async () => {
    const s = sceneOf(openBackorder(), originReplay(), true);

    const first = await s.quote.execute(query());
    const second = await s.quote.execute(query());

    expect(second.amounts?.totalCents).toBe(first.amounts?.totalCents);
  });

  it("sous la politique du reliquat : aucune surtaxe malgré le réglage, prix d'origine et non d'aujourd'hui", async () => {
    const withFee = await sceneOf(openBackorder(), originReplay(), true).quote.execute(query());
    const onTime = await sceneOf(openBackorder(), originReplay(), false).quote.execute(query());

    // 4 pains × 3,00 € HT (origine) à 5,5 % : le catalogue du jour dit 4,00 €.
    expect(withFee.amounts?.totalCents).toBe(onTime.amounts?.totalCents);
    expect(withFee.amounts?.totalCents).toBe(1_266);
  });
});
