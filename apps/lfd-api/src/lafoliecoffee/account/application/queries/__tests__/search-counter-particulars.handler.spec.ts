import { ParticularNoShowCountsReader } from "../../../../orders/domain/ports/particular-no-show-counts.reader.js";
import { ParticularSearchTooShortError } from "../../../domain/errors/particular-errors.js";
import {
  ParticularFinder,
  type ParticularRecord,
} from "../../../domain/ports/particular-finder.js";
import type { ParticularSearchTerm } from "../../../domain/value-objects/particular-search-term.js";
import { SearchCounterParticularsHandler } from "../search-counter-particulars.handler.js";
import { SearchCounterParticularsQuery } from "../search-counter-particulars.query.js";

/** Un annuaire figé qui note ce qu'on lui a demandé. */
class FixedParticularFinder extends ParticularFinder {
  readonly asked: { readonly term: ParticularSearchTerm; readonly limit: number }[] = [];

  constructor(private readonly records: readonly ParticularRecord[]) {
    super();
  }

  search(term: ParticularSearchTerm, limit: number): Promise<readonly ParticularRecord[]> {
    this.asked.push({ term, limit });
    return Promise.resolve(this.records);
  }
}

/** Les commandes non retirées, fixées par le test ; retient les fiches demandées. */
class FixedNoShowCounts extends ParticularNoShowCountsReader {
  readonly asked: (readonly string[])[] = [];

  constructor(private readonly counts: ReadonlyMap<string, number> = new Map()) {
    super();
  }

  countsOf(userIds: readonly string[]): Promise<ReadonlyMap<string, number>> {
    this.asked.push(userIds);
    return Promise.resolve(this.counts);
  }
}

const JEAN: ParticularRecord = {
  id: "u1",
  firstName: "Jean",
  lastName: "",
  email: "jean@gmail.com",
  phone: "06 12 34 56 78",
  connectable: false,
};

describe("chercher un particulier au comptoir", () => {
  it("sert des cartes aux coordonnées masquées", async () => {
    const handler = new SearchCounterParticularsHandler(
      new FixedParticularFinder([JEAN]),
      new FixedNoShowCounts(),
    );

    const cards = await handler.execute(new SearchCounterParticularsQuery("jean"));

    expect(cards).toEqual([
      {
        id: "u1",
        firstName: "Jean",
        lastName: "",
        maskedEmail: "j***@gmail.com",
        maskedPhone: "06 •• •• •• 78",
        connectable: false,
        noShowCount: 0,
      },
    ]);
  });

  it("dit combien de commandes la personne n'est pas venue retirer, en une lecture", async () => {
    const counts = new FixedNoShowCounts(new Map([["u1", 2]]));
    const handler = new SearchCounterParticularsHandler(
      new FixedParticularFinder([JEAN, { ...JEAN, id: "u2", firstName: "Jeanne" }]),
      counts,
    );

    const cards = await handler.execute(new SearchCounterParticularsQuery("jean"));

    expect(cards.map((card) => [card.id, card.noShowCount])).toEqual([
      ["u1", 2],
      ["u2", 0],
    ]);
    expect(counts.asked).toEqual([["u1", "u2"]]);
  });

  it("borne la recherche à dix particuliers", async () => {
    const finder = new FixedParticularFinder([]);

    await new SearchCounterParticularsHandler(finder, new FixedNoShowCounts()).execute(
      new SearchCounterParticularsQuery("06 12"),
    );

    expect(finder.asked.map((a) => [a.term.phoneKey, a.limit])).toEqual([["0612", 10]]);
  });

  it("refuse une saisie d'un caractère sans interroger l'annuaire", async () => {
    const finder = new FixedParticularFinder([JEAN]);

    await expect(
      new SearchCounterParticularsHandler(finder, new FixedNoShowCounts()).execute(
        new SearchCounterParticularsQuery("j"),
      ),
    ).rejects.toBeInstanceOf(ParticularSearchTooShortError);
    expect(finder.asked).toHaveLength(0);
  });
});
