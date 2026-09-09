/**
 * **Les deux lectures du journal tarifaire**, depuis qu'elles ont un nom.
 *
 * Ce que cette suite tient, et que la route ne tenait plus toute seule une fois
 * le mapping descendu du contrôleur :
 *
 * - **la profondeur** du fil général — une limite lue au hasard rendrait le
 *   journal illisible, et rien ne rougirait ;
 * - **la traduction d'un acte en vue de fil** — c'est le seul endroit où la date
 *   devient une chaîne, et où `kind` devient `act` ; l'intervertir servirait un
 *   fil plausible et faux ;
 * - **le sujet transmis tel quel** : la lecture par sujet ne réinterprète pas ce
 *   que la frontière HTTP a déjà reconnu.
 *
 * Les ports sont doublés par de vraies sous-classes, jamais par un cast.
 *
 * Les dates sont ABSOLUES, cas d'exception du §5 de `CLAUDE.md` : rien ici ne
 * les compare à l'horloge — l'assertion vise la même constante que la fixture.
 */
import {
  PricingJournalReader,
  type JournalEntry,
} from "../../../domain/ports/pricing-journal.reader.js";
import { ReadPricingJournalHandler } from "../read-pricing-journal.handler.js";
import { ReadSubjectJournalHandler } from "../read-subject-journal.handler.js";
import { ReadSubjectJournalQuery } from "../read-subject-journal.query.js";

const POSED_AT = new Date("2026-06-15T09:00:00.000Z");

function act(over: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: "act_1",
    subjectType: "rule",
    subjectId: "rule_1",
    kind: "posed",
    actor: "auth0|staff",
    at: POSED_AT,
    reason: null,
    summary: "Mercuriale — produit, 0,80 €",
    ...over,
  };
}

/** Retient ce qu'on lui a demandé : c'est l'objet même de deux des trois cas. */
class RecordingPricingJournal extends PricingJournalReader {
  recentLimit: number | null = null;
  subjectAsked: readonly [string, string] | null = null;

  constructor(private readonly entries: JournalEntry[]) {
    super();
  }

  recent(limit: number): Promise<JournalEntry[]> {
    this.recentLimit = limit;
    return Promise.resolve(this.entries);
  }

  forSubject(subjectType: string, subjectId: string): Promise<JournalEntry[]> {
    this.subjectAsked = [subjectType, subjectId];
    return Promise.resolve(this.entries);
  }
}

describe("ReadPricingJournalHandler", () => {
  it("borne le fil général à cinquante actes", async () => {
    const journal = new RecordingPricingJournal([]);

    // `execute()` ne prend rien : la profondeur du fil est une décision de
    // lecture, pas une option de l'appelant (cf. `ReadPricingJournalQuery`, qui
    // est vide).
    await new ReadPricingJournalHandler(journal).execute();

    expect(journal.recentLimit).toBe(50);
  });

  it("traduit l'acte en vue de fil — la date en ISO, `kind` en `act`", async () => {
    const journal = new RecordingPricingJournal([act({ reason: "fin de promo" })]);

    const view = await new ReadPricingJournalHandler(journal).execute();

    expect(view).toEqual([
      {
        id: "act_1",
        subjectType: "rule",
        subjectId: "rule_1",
        act: "posed",
        actor: "auth0|staff",
        occurredAt: POSED_AT.toISOString(),
        reason: "fin de promo",
        summary: "Mercuriale — produit, 0,80 €",
      },
    ]);
  });
});

describe("ReadSubjectJournalHandler", () => {
  it("interroge le sujet demandé, sans le réinterpréter", async () => {
    const journal = new RecordingPricingJournal([]);

    await new ReadSubjectJournalHandler(journal).execute(
      new ReadSubjectJournalQuery("ladder", "ladder_7"),
    );

    expect(journal.subjectAsked).toEqual(["ladder", "ladder_7"]);
  });

  it("rend le même fil que la lecture générale — un seul mapper pour les deux", async () => {
    const journal = new RecordingPricingJournal([
      act({ subjectType: "floor", subjectId: "floor_2" }),
    ]);

    const view = await new ReadSubjectJournalHandler(journal).execute(
      new ReadSubjectJournalQuery("floor", "floor_2"),
    );

    expect(view[0]).toMatchObject({
      subjectType: "floor",
      subjectId: "floor_2",
      act: "posed",
      occurredAt: POSED_AT.toISOString(),
    });
  });
});
