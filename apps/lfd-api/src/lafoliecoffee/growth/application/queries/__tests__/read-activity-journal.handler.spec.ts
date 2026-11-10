import type { ActivityPageView, ActivityQuery } from "@lfd/contracts";

import { StaffAuthorReferences } from "../../../../../staff/directory/domain/staff-author-directory.js";
import { ActivityJournalReader } from "../../../domain/ports/activity-journal.reader.js";
import { ReadActivityJournalHandler } from "../read-activity-journal.handler.js";
import { ReadActivityJournalQuery } from "../read-activity-journal.query.js";

/** Le journal qui note ce qu'on lui a demandé. */
class RecordingJournalReader extends ActivityJournalReader {
  readonly calls: { query: ActivityQuery; actorIds: readonly string[] | null }[] = [];

  page(query: ActivityQuery, actorIds: readonly string[] | null): Promise<ActivityPageView> {
    this.calls.push({ query, actorIds });
    return Promise.resolve({ events: [], nextBefore: null, total: 0, page: 1, asOf: null });
  }
}

/** Un annuaire où `auth0|ancien`, `auth0|actuel` et `staff_1` sont une même personne. */
class ScriptedReferences extends StaffAuthorReferences {
  readonly asked: string[] = [];

  referencesOf(reference: string): Promise<readonly string[]> {
    this.asked.push(reference);
    return Promise.resolve([reference, "staff_1", "auth0|actuel", "auth0|ancien"]);
  }
}

describe("ReadActivityJournalHandler", () => {
  it("élargit le filtre par acteur à toutes les références de la personne", async () => {
    const journal = new RecordingJournalReader();
    const references = new ScriptedReferences();
    const handler = new ReadActivityJournalHandler(journal, references);

    await handler.execute(new ReadActivityJournalQuery({ limit: 20, actorId: "staff_1" }));

    expect(references.asked).toEqual(["staff_1"]);
    expect(journal.calls[0]?.actorIds).toEqual([
      "staff_1",
      "staff_1",
      "auth0|actuel",
      "auth0|ancien",
    ]);
  });

  it("ne consulte pas l'annuaire sans filtre par acteur", async () => {
    const journal = new RecordingJournalReader();
    const references = new ScriptedReferences();

    await new ReadActivityJournalHandler(journal, references).execute(
      new ReadActivityJournalQuery({ limit: 20 }),
    );

    expect(references.asked).toEqual([]);
    expect(journal.calls[0]?.actorIds).toBeNull();
  });
});
