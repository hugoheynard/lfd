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
  type JournalPage,
  type JournalPageRequest,
} from "../../../domain/ports/pricing-journal.reader.js";
import { ReadPricingJournalHandler } from "../read-pricing-journal.handler.js";
import { ReadSubjectJournalHandler } from "../read-subject-journal.handler.js";
import { ReadSubjectJournalPageHandler } from "../read-subject-journal-page.handler.js";
import { ReadSubjectJournalPageQuery } from "../read-subject-journal-page.query.js";
import { ReadSubjectJournalQuery } from "../read-subject-journal.query.js";
import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";

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
  pageAsked: JournalPageRequest | null = null;

  constructor(
    private readonly entries: JournalEntry[],
    private readonly page: Omit<JournalPage, "entries"> = { total: entries.length, asOf: null },
  ) {
    super();
  }

  pageForSubject(request: JournalPageRequest): Promise<JournalPage> {
    this.pageAsked = request;
    return Promise.resolve({ ...this.page, entries: this.entries });
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

/** L'annuaire : `auth0|staff` est Camille ; `system` n'est personne. */
const AUTHORS = new FixedStaffAuthorDirectory(
  authorsKnownAs({ firstName: "Camille", lastName: "Durand" }, "auth0|staff"),
);

describe("ReadPricingJournalHandler", () => {
  it("borne le fil général à cinquante actes", async () => {
    const journal = new RecordingPricingJournal([]);

    // `execute()` ne prend rien : la profondeur du fil est une décision de
    // lecture, pas une option de l'appelant (cf. `ReadPricingJournalQuery`, qui
    // est vide).
    await new ReadPricingJournalHandler(journal, AUTHORS).execute();

    expect(journal.recentLimit).toBe(50);
  });

  it("ne nomme pas l'acteur `system` : l'écran garde la valeur brute", async () => {
    const journal = new RecordingPricingJournal([act({ actor: "system" })]);

    const [view] = await new ReadPricingJournalHandler(journal, AUTHORS).execute();

    expect(view).toMatchObject({ actor: "system", actorName: null });
  });

  it("traduit l'acte en vue de fil — la date en ISO, `kind` en `act`", async () => {
    const journal = new RecordingPricingJournal([act({ reason: "fin de promo" })]);

    const view = await new ReadPricingJournalHandler(journal, AUTHORS).execute();

    expect(view).toEqual([
      {
        id: "act_1",
        subjectType: "rule",
        subjectId: "rule_1",
        act: "posed",
        actor: "auth0|staff",
        // Le nom, résolu par l'annuaire — l'écran ne montre plus le `sub`
        // (`architecture-journalisation.md` §12, D3).
        actorName: "Camille Durand",
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

    await new ReadSubjectJournalHandler(journal, AUTHORS).execute(
      new ReadSubjectJournalQuery("ladder", "ladder_7"),
    );

    expect(journal.subjectAsked).toEqual(["ladder", "ladder_7"]);
  });

  it("rend le même fil que la lecture générale — un seul mapper pour les deux", async () => {
    const journal = new RecordingPricingJournal([
      act({ subjectType: "floor", subjectId: "floor_2" }),
    ]);

    const view = await new ReadSubjectJournalHandler(journal, AUTHORS).execute(
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

describe("ReadSubjectJournalPageHandler", () => {
  it("transmet le sujet, la page, la taille et l'ancre, sans les réinterpréter", async () => {
    const journal = new RecordingPricingJournal([]);

    await new ReadSubjectJournalPageHandler(journal, AUTHORS).execute(
      new ReadSubjectJournalPageQuery("mercuriale", "merc_3", 3, 20, "act_45"),
    );

    expect(journal.pageAsked).toEqual({
      subjectType: "mercuriale",
      subjectId: "merc_3",
      page: 3,
      pageSize: 20,
      asOf: "act_45",
    });
  });

  it("rend le total et l'ancre du lecteur, et la page et la taille demandées", async () => {
    const journal = new RecordingPricingJournal([act()], { total: 45, asOf: "act_45" });

    const view = await new ReadSubjectJournalPageHandler(journal, AUTHORS).execute(
      new ReadSubjectJournalPageQuery("rule", "rule_1", 3, 20, null),
    );

    // L'ancre vient du LECTEUR, pas de la requête : sans `asOf`, c'est lui qui
    // fixe l'instantané, et l'écran doit la recevoir pour les pages suivantes.
    expect(view).toMatchObject({ total: 45, page: 3, pageSize: 20, asOf: "act_45" });
  });

  it("nomme les auteurs avec le même mapper que le fil", async () => {
    const journal = new RecordingPricingJournal([act(), act({ id: "act_2", actor: "system" })]);

    const view = await new ReadSubjectJournalPageHandler(journal, AUTHORS).execute(
      new ReadSubjectJournalPageQuery("rule", "rule_1", 1, 20, null),
    );

    expect(view.entries.map((entry) => entry.actorName)).toEqual(["Camille Durand", null]);
    expect(view.entries[0]).toMatchObject({ act: "posed", occurredAt: POSED_AT.toISOString() });
  });

  it("rend une page vide et une ancre nulle pour un sujet sans acte", async () => {
    const journal = new RecordingPricingJournal([], { total: 0, asOf: null });

    const view = await new ReadSubjectJournalPageHandler(journal, AUTHORS).execute(
      new ReadSubjectJournalPageQuery("floor", "global:", 1, 20, null),
    );

    expect(view).toEqual({ entries: [], total: 0, page: 1, pageSize: 20, asOf: null });
  });
});
