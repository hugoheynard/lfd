import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { MAIL_CONSULTATIONS_PER_HOUR } from "../../domain/entities/staff-mail-consultations.js";
import {
  InvalidMailSearchAddressError,
  MailConsultationLimitReachedError,
  MailSearchNotFoundError,
  MailSearchNotReadableError,
} from "../../domain/errors/mail-sends.errors.js";
import { SearchMailByRecipientCommand } from "../commands/search-mail-by-recipient.command.js";
import { SearchMailByRecipientHandler } from "../commands/search-mail-by-recipient.handler.js";
import { GetMailSearchResultsHandler } from "../queries/get-mail-search-results.handler.js";
import { GetMailSearchResultsQuery } from "../queries/get-mail-search-results.query.js";
import {
  FixedMailSendReader,
  FixedSendFinder,
  InMemoryConsultations,
  InMemorySearchLedger,
  PrefixFingerprint,
  record,
} from "./mail-sends-doubles.js";

const NOW = new Date(Date.UTC(2026, 0, 1, 12));
const ADDRESS = "colette@halles.fr";

function world() {
  const consultations = new InMemoryConsultations();
  const events = new RecordingPublisher();
  const clock = new FixedClock(NOW);
  const finder = new FixedSendFinder(new Map([[ADDRESS, ["send_1", "send_2"]]]));
  const search = new SearchMailByRecipientHandler(
    finder,
    new PrefixFingerprint(),
    consultations,
    events,
    new FixedIdGenerator("srch"),
    clock,
    new DirectUnitOfWork(),
  );
  const results = new GetMailSearchResultsHandler(
    new InMemorySearchLedger(consultations),
    new FixedMailSendReader([record({ id: "send_1" }), record({ id: "send_2", status: "failed" })]),
    clock,
  );
  return { consultations, events, clock, finder, search, results };
}

describe("SearchMailByRecipientHandler (décision 8)", () => {
  it("cherche par l'adresse normalisée, range empreinte et envois trouvés, rend l'id", async () => {
    const w = world();

    const id = await w.search.execute(
      new SearchMailByRecipientCommand(" Colette@Halles.fr", "colette"),
    );

    expect(id).toBe("srch_000001");
    expect(w.finder.keys).toEqual([ADDRESS]);
    expect(w.consultations.savedSearches).toEqual([
      { id, staffId: "colette", fingerprint: "fp(17)", sendIds: ["send_1", "send_2"], at: NOW },
    ]);
    const facts = w.events.traced.map((event) => event.journalFact());
    expect(facts).toEqual([
      {
        type: "mail.recipient_searched",
        subjectType: "mail_recipient_search",
        subjectId: id,
        payload: { found: 2 },
      },
    ]);
    expect(JSON.stringify(w.consultations.savedSearches)).not.toContain("halles");
  });

  it("refuse une adresse mal formée, sans rien ranger", async () => {
    const w = world();
    await expect(
      w.search.execute(new SearchMailByRecipientCommand("colette", "colette")),
    ).rejects.toThrow(InvalidMailSearchAddressError);
    expect(w.consultations.savedSearches).toEqual([]);
    expect(w.events.factTypes()).toEqual([]);
  });

  it("compte dans le plafond partagé", async () => {
    const w = world();
    w.consultations.searches.set("colette", MAIL_CONSULTATIONS_PER_HOUR);
    await expect(
      w.search.execute(new SearchMailByRecipientCommand(ADDRESS, "colette")),
    ).rejects.toThrow(MailConsultationLimitReachedError);
  });
});

describe("GetMailSearchResultsHandler", () => {
  it("rend à l'auteur les envois trouvés, masqués, problèmes compris", async () => {
    const w = world();
    const id = await w.search.execute(new SearchMailByRecipientCommand(ADDRESS, "colette"));
    w.clock.advanceMs(4 * 60_000);

    const view = await w.results.execute(new GetMailSearchResultsQuery(id, "colette"));

    expect(view).toMatchObject({
      id,
      searchedAt: NOW.toISOString(),
      readableUntil: new Date(NOW.getTime() + 5 * 60_000).toISOString(),
    });
    expect(view.items.map((item) => [item.id, item.recipient])).toEqual([
      ["send_1", "c•••@halles.fr"],
      ["send_2", "c•••@halles.fr"],
    ]);
  });

  it("403 pour un collègue, et pour l'auteur après 5 minutes", async () => {
    const w = world();
    const id = await w.search.execute(new SearchMailByRecipientCommand(ADDRESS, "colette"));

    await expect(w.results.execute(new GetMailSearchResultsQuery(id, "bruno"))).rejects.toThrow(
      MailSearchNotReadableError,
    );
    w.clock.advanceMs(5 * 60_000);
    await expect(w.results.execute(new GetMailSearchResultsQuery(id, "colette"))).rejects.toThrow(
      MailSearchNotReadableError,
    );
  });

  it("404 pour une recherche inconnue", async () => {
    const w = world();
    await expect(
      w.results.execute(new GetMailSearchResultsQuery("absent", "colette")),
    ).rejects.toThrow(MailSearchNotFoundError);
  });
});
