import { inMemoryIntents } from "../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { MAIL_CONSULTATIONS_PER_HOUR } from "../../../sends/domain/entities/staff-mail-consultations.js";
import { MailConsultationLimitReachedError } from "../../../sends/domain/errors/mail-sends.errors.js";
import { MarketingPreference } from "../../domain/entities/marketing-preference.js";
import {
  InvalidStaffUnsubscribeAddressError,
  MarketingPreferenceAddressErasedError,
  MarketingPreferenceNotFoundError,
  MarketingPreferenceRecipientNotRevealedError,
  InvalidPreferenceSearchAddressError,
  MarketingPreferenceSearchNotFoundError,
  MarketingPreferenceSearchNotReadableError,
} from "../../domain/errors/marketing-preference-admin.errors.js";
import { RevealMarketingPreferenceRecipientCommand } from "../commands/reveal-marketing-preference-recipient.command.js";
import { RevealMarketingPreferenceRecipientHandler } from "../commands/reveal-marketing-preference-recipient.handler.js";
import { SearchMarketingPreferencesCommand } from "../commands/search-marketing-preferences.command.js";
import { SearchMarketingPreferencesHandler } from "../commands/search-marketing-preferences.handler.js";
import { GetMarketingPreferenceSearchQuery } from "../queries/get-marketing-preference-search.query.js";
import { GetMarketingPreferenceSearchHandler } from "../queries/get-marketing-preference-search.handler.js";
import { UnsubscribeAddressByStaffCommand } from "../commands/unsubscribe-address-by-staff.command.js";
import { UnsubscribeAddressByStaffHandler } from "../commands/unsubscribe-address-by-staff.handler.js";
import { UnsubscribeMarketingPreferenceCommand } from "../commands/unsubscribe-marketing-preference.command.js";
import { UnsubscribeMarketingPreferenceHandler } from "../commands/unsubscribe-marketing-preference.handler.js";
import { GetMarketingPreferenceRecipientQuery } from "../queries/get-marketing-preference-recipient.query.js";
import { GetMarketingPreferenceRecipientHandler } from "../queries/get-marketing-preference-recipient.handler.js";
import { GetMarketingPreferenceQuery } from "../queries/get-marketing-preference.query.js";
import { GetMarketingPreferenceHandler } from "../queries/get-marketing-preference.handler.js";
import { ListMarketingPreferencesQuery } from "../queries/list-marketing-preferences.query.js";
import { ListMarketingPreferencesHandler } from "../queries/list-marketing-preferences.handler.js";
import { MarketingAddresses } from "../services/marketing-addresses.js";
import { MarketingUnsubscriber } from "../services/marketing-unsubscriber.js";
import {
  InMemoryAdminReader,
  InMemoryConsultationLedger,
  InMemoryPreferenceConsultations,
  TaggedFingerprint,
} from "./marketing-admin-doubles.js";
import { InMemoryPreferences, ReadablePrint } from "./marketing-doubles.js";

let intentCount = 0;
/** Une clé d'intention neuve par geste voulu, comme l'écran. */
const nextKey = (): string => `intent_${(intentCount += 1)}`;

const NOW = new Date(Date.UTC(2026, 0, 1, 12));
const MINUTE = 60_000;
const ADDRESS = "colette@halles.fr";

function world() {
  const preferences = new InMemoryPreferences();
  const addresses = new MarketingAddresses(new ReadablePrint());
  const reader = new InMemoryAdminReader(preferences);
  const consultations = new InMemoryPreferenceConsultations();
  const ledger = new InMemoryConsultationLedger(consultations);
  const events = new RecordingPublisher();
  const clock = new FixedClock(NOW);
  const uow = new DirectUnitOfWork();
  const fingerprints = new TaggedFingerprint();
  const ids = new FixedIdGenerator("pref");
  return {
    preferences,
    addresses,
    consultations,
    events,
    clock,
    list: new ListMarketingPreferencesHandler(reader),
    detail: new GetMarketingPreferenceHandler(reader),
    reader,
    reveal: new RevealMarketingPreferenceRecipientHandler(
      reader,
      consultations,
      events,
      new FixedIdGenerator("con"),
      clock,
      uow,
      inMemoryIntents(),
    ),
    recipient: new GetMarketingPreferenceRecipientHandler(ledger, reader, clock),
    search: new SearchMarketingPreferencesHandler(
      addresses,
      preferences,
      fingerprints,
      consultations,
      events,
      new FixedIdGenerator("srch"),
      clock,
      uow,
      inMemoryIntents(),
    ),
    searchResults: new GetMarketingPreferenceSearchHandler(ledger, reader, clock),
    unsubscribe: new UnsubscribeMarketingPreferenceHandler(preferences, events, clock, uow),
    unsubscribeAddress: new UnsubscribeAddressByStaffHandler(
      addresses,
      new MarketingUnsubscriber(preferences, ids),
      events,
      clock,
      uow,
    ),
  };
}

type World = ReturnType<typeof world>;

/** Un accord confirmé, posé par l'agrégat. */
async function accepted(w: World, id: string, address = ADDRESS): Promise<void> {
  await w.preferences.save(
    MarketingPreference.accepted(id, "lfc", w.addresses.of(address), {
      origin: "direct",
      proof: { textVersion: "society.v1", locale: "it", place: "order", ref: "order_1" },
      at: NOW,
    }),
  );
}

/** Une désinscription dont l'adresse a été effacée (règle 23). */
async function erased(w: World, id: string): Promise<void> {
  const row = MarketingPreference.optedOut(id, "lfc", w.addresses.of("zoe@halles.fr"), {
    at: NOW,
    source: "link",
  });
  row.erase();
  await w.preferences.save(row);
}

describe("le registre vu par le staff — lecture (C4)", () => {
  it("masque l'adresse, dit l'état, l'origine et le lieu, et pagine par l'identifiant", async () => {
    const w = world();
    await accepted(w, "pref_a", "anne@halles.fr");
    await accepted(w, "pref_b", "bruno@halles.fr");
    await accepted(w, "pref_c");

    const first = await w.list.execute(
      new ListMarketingPreferencesQuery({ space: null, status: null, cursor: null, limit: 2 }),
    );
    const rest = await w.list.execute(
      new ListMarketingPreferencesQuery({
        space: null,
        status: null,
        cursor: first.nextCursor,
        limit: 2,
      }),
    );

    expect(first.items.map((item) => [item.id, item.recipient, item.status, item.place])).toEqual([
      ["pref_c", "c•••@halles.fr", "accepted", "order"],
      ["pref_b", "b•••@halles.fr", "accepted", "order"],
    ]);
    expect(first.nextCursor).toBe("pref_b");
    expect(rest.items.map((item) => item.id)).toEqual(["pref_a"]);
    expect(rest.nextCursor).toBeNull();
    expect(JSON.stringify([first, rest])).not.toContain(ADDRESS);
  });

  it("filtre par espace et par état", async () => {
    const w = world();
    await accepted(w, "pref_a");
    await erased(w, "pref_b");

    const view = await w.list.execute(
      new ListMarketingPreferencesQuery({
        space: "lfc",
        status: "unsubscribed",
        cursor: null,
        limit: 10,
      }),
    );

    expect(view.items.map((item) => [item.id, item.recipient, item.unsubscribedSource])).toEqual([
      ["pref_b", null, "link"],
    ]);
  });

  it("sert la preuve au détail : version et langue du texte, lieu, acte, confirmation", async () => {
    const w = world();
    await accepted(w, "pref_a");

    const view = await w.detail.execute(new GetMarketingPreferenceQuery("pref_a"));

    expect(view.proof).toEqual({
      textVersion: "society.v1",
      locale: "it",
      place: "order",
      ref: "order_1",
    });
    expect(view.confirmedAt).toBe(NOW.toISOString());
    expect(view.recipient).toBe("c•••@halles.fr");
    await expect(w.detail.execute(new GetMarketingPreferenceQuery("absent"))).rejects.toThrow(
      MarketingPreferenceNotFoundError,
    );
  });
});

describe("le registre vu par le staff — « Afficher l'adresse » (C4)", () => {
  /** Régression : un double clic sur « Afficher l'adresse » rangeait deux consultations au plafond. */
  it("rejouée avec la même clé, ne range qu'une consultation", async () => {
    const w = world();
    await accepted(w, "pref_a");
    const command = new RevealMarketingPreferenceRecipientCommand("pref_a", "colette", nextKey());

    await w.reveal.execute(command);
    await w.reveal.execute(command);

    expect(w.consultations.reveals).toHaveLength(1);
  });

  it("range la consultation par empreinte, publie le fait sans adresse, puis sert l'adresse 5 minutes", async () => {
    const w = world();
    await accepted(w, "pref_a");

    await expect(
      w.recipient.execute(new GetMarketingPreferenceRecipientQuery("pref_a", "colette")),
    ).rejects.toThrow(MarketingPreferenceRecipientNotRevealedError);
    await w.reveal.execute(
      new RevealMarketingPreferenceRecipientCommand("pref_a", "colette", nextKey()),
    );
    const view = await w.recipient.execute(
      new GetMarketingPreferenceRecipientQuery("pref_a", "colette"),
    );

    expect(view).toEqual({
      id: "pref_a",
      recipient: ADDRESS,
      revealedUntil: new Date(NOW.getTime() + 5 * MINUTE).toISOString(),
    });
    expect(w.consultations.reveals).toEqual([
      { id: "con_000001", sendId: "pref_a", staffId: "colette", at: NOW },
    ]);
    expect(w.consultations.searches).toEqual([]);
    const facts = w.events.traced.map((event) => event.journalFact());
    expect(facts).toEqual([
      {
        type: "mail.preference_recipient_revealed",
        subjectType: "mail_marketing_preference",
        subjectId: "pref_a",
        payload: { space: "lfc" },
      },
    ]);
    expect(JSON.stringify(facts)).not.toContain("@");
  });

  it("ne sert l'adresse ni à un collègue, ni après 5 minutes", async () => {
    const w = world();
    await accepted(w, "pref_a");
    await w.reveal.execute(
      new RevealMarketingPreferenceRecipientCommand("pref_a", "colette", nextKey()),
    );

    await expect(
      w.recipient.execute(new GetMarketingPreferenceRecipientQuery("pref_a", "bruno")),
    ).rejects.toThrow(MarketingPreferenceRecipientNotRevealedError);
    w.clock.set(new Date(NOW.getTime() + 5 * MINUTE));
    await expect(
      w.recipient.execute(new GetMarketingPreferenceRecipientQuery("pref_a", "colette")),
    ).rejects.toThrow(MarketingPreferenceRecipientNotRevealedError);
  });

  it("compte dans le plafond du suivi : au-delà de 30, refus, rien de rangé ni de publié", async () => {
    const w = world();
    await accepted(w, "pref_a");
    w.consultations.elsewhere.set("colette", MAIL_CONSULTATIONS_PER_HOUR);

    await expect(
      w.reveal.execute(
        new RevealMarketingPreferenceRecipientCommand("pref_a", "colette", nextKey()),
      ),
    ).rejects.toThrow(MailConsultationLimitReachedError);
    expect(w.consultations.reveals).toEqual([]);
    expect(w.events.factTypes()).toEqual([]);
  });

  it("ne lit pas la ligne sans révélation en cours", async () => {
    const w = world();
    await accepted(w, "pref_a");

    await expect(
      w.recipient.execute(new GetMarketingPreferenceRecipientQuery("pref_a", "colette")),
    ).rejects.toThrow(MarketingPreferenceRecipientNotRevealedError);
    expect(w.reader.details).toEqual([]);
  });

  it("n'a rien à afficher d'une adresse effacée, ni d'une ligne inconnue", async () => {
    const w = world();
    await erased(w, "pref_b");

    await expect(
      w.reveal.execute(
        new RevealMarketingPreferenceRecipientCommand("pref_b", "colette", nextKey()),
      ),
    ).rejects.toThrow(MarketingPreferenceAddressErasedError);
    await expect(
      w.reveal.execute(
        new RevealMarketingPreferenceRecipientCommand("absent", "colette", nextKey()),
      ),
    ).rejects.toThrow(MarketingPreferenceNotFoundError);
    expect(w.events.factTypes()).toEqual([]);
  });
});

describe("le registre vu par le staff — « Désinscrire à la demande du client » (C4)", () => {
  it("désinscrit la ligne, source `staff`, et trace le geste", async () => {
    const w = world();
    await accepted(w, "pref_a");

    await w.unsubscribe.execute(new UnsubscribeMarketingPreferenceCommand("pref_a"));

    const row = await w.preferences.loadById("pref_a");
    expect(row?.snapshot()).toMatchObject({
      status: "unsubscribed",
      unsubscribedSource: "staff",
      unsubscribedAt: NOW,
    });
    expect(w.events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "mail.marketing_unsubscribed_by_staff",
        subjectType: "mail_marketing_preference",
        subjectId: "pref_a",
        payload: { space: "lfc", changed: true },
      },
    ]);
  });

  it("est idempotente : une ligne déjà désinscrite garde sa première source", async () => {
    const w = world();
    await erased(w, "pref_b");
    const saves = w.preferences.saves;

    await w.unsubscribe.execute(new UnsubscribeMarketingPreferenceCommand("pref_b"));

    expect((await w.preferences.loadById("pref_b"))?.snapshot().unsubscribedSource).toBe("link");
    expect(w.preferences.saves).toBe(saves);
    expect(w.events.traced.map((event) => event.journalFact().payload)).toEqual([
      { space: "lfc", changed: false },
    ]);
  });

  it("refuse une ligne inconnue, sans rien publier", async () => {
    const w = world();
    await expect(
      w.unsubscribe.execute(new UnsubscribeMarketingPreferenceCommand("absent")),
    ).rejects.toThrow(MarketingPreferenceNotFoundError);
    expect(w.events.factTypes()).toEqual([]);
  });

  it("désinscrit une adresse donnée, connue ou non, et ne la met jamais au journal", async () => {
    const w = world();
    await accepted(w, "pref_a");

    await w.unsubscribeAddress.execute(new UnsubscribeAddressByStaffCommand("lfc", ` ${ADDRESS} `));
    await w.unsubscribeAddress.execute(
      new UnsubscribeAddressByStaffCommand("lfc", "Nouveau@Halles.fr"),
    );

    expect((await w.preferences.loadById("pref_a"))?.snapshot().status).toBe("unsubscribed");
    const created = await w.preferences.load("lfc", w.addresses.of("nouveau@halles.fr").print);
    expect(created?.snapshot()).toMatchObject({
      status: "unsubscribed",
      unsubscribedSource: "staff",
    });
    const facts = w.events.traced.map((event) => event.journalFact());
    expect(facts.map((fact) => [fact.subjectId, fact.payload])).toEqual([
      ["pref_a", { space: "lfc", changed: true }],
      [created?.id, { space: "lfc", changed: true }],
    ]);
    expect(JSON.stringify(facts)).not.toContain("@");
  });

  it("refuse une adresse sans @, sans rien ranger", async () => {
    const w = world();
    await expect(
      w.unsubscribeAddress.execute(new UnsubscribeAddressByStaffCommand("lfc", "colette")),
    ).rejects.toThrow(InvalidStaffUnsubscribeAddressError);
    expect(w.preferences.rows.size).toBe(0);
    expect(w.events.factTypes()).toEqual([]);
  });
});

describe("le registre vu par le staff — la recherche par adresse (C4)", () => {
  /** Régression : un double clic sur « Chercher » rangeait deux recherches au plafond. */
  it("rejouée avec la même clé, rend la même recherche sans en ranger une autre", async () => {
    const w = world();
    await accepted(w, "pref_a");
    const command = new SearchMarketingPreferencesCommand(ADDRESS, "colette", nextKey());

    const first = await w.search.execute(command);
    const replayed = await w.search.execute(command);

    expect(replayed).toBe(first);
    expect(w.consultations.searches).toHaveLength(1);
  });

  it("range l'empreinte et les lignes trouvées, publie le compte sans adresse, et sert le résultat masqué", async () => {
    const w = world();
    await accepted(w, "pref_a");
    await accepted(w, "pref_b", "bruno@halles.fr");

    const id = await w.search.execute(
      new SearchMarketingPreferencesCommand(` ${ADDRESS.toUpperCase()} `, "colette", nextKey()),
    );
    const view = await w.searchResults.execute(
      new GetMarketingPreferenceSearchQuery(id, "colette"),
    );

    expect(w.consultations.searches).toEqual([
      { id, staffId: "colette", fingerprint: `fp:${ADDRESS}`, sendIds: ["pref_a"], at: NOW },
    ]);
    expect(view.items.map((item) => [item.id, item.recipient])).toEqual([
      ["pref_a", "c•••@halles.fr"],
    ]);
    expect(view.readableUntil).toBe(new Date(NOW.getTime() + 5 * MINUTE).toISOString());
    const facts = w.events.traced.map((event) => event.journalFact());
    expect(facts).toEqual([
      {
        type: "mail.preference_recipient_searched",
        subjectType: "mail_preference_search",
        subjectId: id,
        payload: { found: 1 },
      },
    ]);
    expect(JSON.stringify([facts, view])).not.toContain(ADDRESS);
  });

  it("retrouve une désinscription effacée par son empreinte", async () => {
    const w = world();
    await erased(w, "pref_z");

    const id = await w.search.execute(
      new SearchMarketingPreferencesCommand("zoe@halles.fr", "colette", nextKey()),
    );
    const view = await w.searchResults.execute(
      new GetMarketingPreferenceSearchQuery(id, "colette"),
    );

    expect(view.items.map((item) => [item.id, item.recipient])).toEqual([["pref_z", null]]);
  });

  it("ne se lit que par son auteur, pendant 5 minutes", async () => {
    const w = world();
    const id = await w.search.execute(
      new SearchMarketingPreferencesCommand(ADDRESS, "colette", nextKey()),
    );

    await expect(
      w.searchResults.execute(new GetMarketingPreferenceSearchQuery(id, "bruno")),
    ).rejects.toThrow(MarketingPreferenceSearchNotReadableError);
    w.clock.set(new Date(NOW.getTime() + 5 * MINUTE));
    await expect(
      w.searchResults.execute(new GetMarketingPreferenceSearchQuery(id, "colette")),
    ).rejects.toThrow(MarketingPreferenceSearchNotReadableError);
    await expect(
      w.searchResults.execute(new GetMarketingPreferenceSearchQuery("absent", "colette")),
    ).rejects.toThrow(MarketingPreferenceSearchNotFoundError);
  });

  it("partage le plafond du suivi, et refuse une adresse sans @, sans rien ranger", async () => {
    const w = world();
    await expect(
      w.search.execute(new SearchMarketingPreferencesCommand("colette", "colette", nextKey())),
    ).rejects.toThrow(InvalidPreferenceSearchAddressError);
    w.consultations.elsewhere.set("colette", MAIL_CONSULTATIONS_PER_HOUR);
    await expect(
      w.search.execute(new SearchMarketingPreferencesCommand(ADDRESS, "colette", nextKey())),
    ).rejects.toThrow(MailConsultationLimitReachedError);
    expect(w.consultations.searches).toEqual([]);
    expect(w.events.factTypes()).toEqual([]);
  });
});
