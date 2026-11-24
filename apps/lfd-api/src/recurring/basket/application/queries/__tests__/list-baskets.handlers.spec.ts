import type { AdminSubscriptionRow, SubscriptionView } from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { FixedStanding } from "../../../../occurrence/application/__tests__/recurring-doubles.js";
import { type BasketBuyerName, BasketReader } from "../../../domain/ports/basket.reader.js";
import { IsoDate } from "../../../domain/value-objects/iso-date.js";
import { ListCompanyBasketsHandler } from "../list-company-baskets.handler.js";
import { ListCompanyBasketsQuery } from "../list-company-baskets.query.js";
import { ListMyBasketsHandler } from "../list-my-baskets.handler.js";
import { ListMyBasketsQuery } from "../list-my-baskets.query.js";

/** 23 h à Paris le 30 novembre : déjà le 1er décembre en heure locale, pas en UTC. */
const NOW = new Date("2026-11-30T23:30:00.000Z");
const TODAY = IsoDate.fromString("2026-12-01");

/** Le lecteur : rend vide, garde ce qu'on lui a demandé. */
class RecordingReader extends BasketReader {
  readonly calls: { readonly who: readonly string[]; readonly since: string }[] = [];

  listForBuyer(buyerUserId: string, since: IsoDate): Promise<readonly SubscriptionView[]> {
    this.calls.push({ who: [buyerUserId], since: since.toString() });
    return Promise.resolve([]);
  }

  listForBuyers(
    buyers: readonly BasketBuyerName[],
    since: IsoDate,
  ): Promise<readonly AdminSubscriptionRow[]> {
    this.calls.push({ who: buyers.map((buyer) => buyer.userId), since: since.toString() });
    return Promise.resolve([]);
  }
}

describe("les lectures des paniers", () => {
  it("« mes paniers » lit le mur de l'acheteur, échéances depuis quatre semaines (jour de Paris)", async () => {
    const reader = new RecordingReader();

    await new ListMyBasketsHandler(reader, new FixedClock(NOW)).execute(
      new ListMyBasketsQuery("user_1"),
    );

    expect(reader.calls).toEqual([{ who: ["user_1"], since: TODAY.plusDays(-28).toString() }]);
  });

  it("les paniers d'une société lisent ses membres, avec la même fenêtre", async () => {
    const reader = new RecordingReader();
    const standing = new FixedStanding(new Set(), [
      { userId: "user_1", name: "Léa" },
      { userId: "user_2", name: "Paul" },
    ]);

    await new ListCompanyBasketsHandler(standing, reader, new FixedClock(NOW)).execute(
      new ListCompanyBasketsQuery("chalet"),
    );

    expect(reader.calls).toEqual([
      { who: ["user_1", "user_2"], since: TODAY.plusDays(-28).toString() },
    ]);
  });

  it("une société sans membre ne lit rien", async () => {
    const reader = new RecordingReader();

    const rows = await new ListCompanyBasketsHandler(
      new FixedStanding(),
      reader,
      new FixedClock(NOW),
    ).execute(new ListCompanyBasketsQuery("chalet"));

    expect(rows).toEqual([]);
    expect(reader.calls).toEqual([]);
  });
});
