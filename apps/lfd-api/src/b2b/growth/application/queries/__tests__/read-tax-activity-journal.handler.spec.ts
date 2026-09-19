import type { ActivityPageView, ActivityQuery } from "@lfd/contracts";

import { StaffAuthorReferences } from "../../../../../staff/directory/domain/staff-author-directory.js";
import { TAX_JOURNAL_SLICE, type ActivitySlice } from "../../../domain/activity-slice.js";
import { ActivityJournalReader } from "../../../domain/ports/activity-journal.reader.js";
import { ReadTaxActivityJournalHandler } from "../read-tax-activity-journal.handler.js";
import { ReadTaxActivityJournalQuery } from "../read-tax-activity-journal.query.js";

interface Call {
  readonly query: ActivityQuery;
  readonly actorIds: readonly string[] | null;
  readonly slice: ActivitySlice | null;
}

/** Le journal qui note ce qu'on lui a demandé — tranche comprise. */
class RecordingJournalReader extends ActivityJournalReader {
  readonly calls: Call[] = [];

  page(
    query: ActivityQuery,
    actorIds: readonly string[] | null,
    slice: ActivitySlice | null,
  ): Promise<ActivityPageView> {
    this.calls.push({ query, actorIds, slice });
    return Promise.resolve({ events: [], nextBefore: null, total: 0, page: 1, asOf: null });
  }
}

class ScriptedReferences extends StaffAuthorReferences {
  readonly asked: string[] = [];

  referencesOf(reference: string): Promise<readonly string[]> {
    this.asked.push(reference);
    return Promise.resolve([reference, "auth0|actuel"]);
  }
}

async function read(filters: ReadTaxActivityJournalQuery["filters"]): Promise<{
  readonly call: Call | undefined;
  readonly references: ScriptedReferences;
}> {
  const journal = new RecordingJournalReader();
  const references = new ScriptedReferences();
  await new ReadTaxActivityJournalHandler(journal, references).execute(
    new ReadTaxActivityJournalQuery(filters),
  );
  return { call: journal.calls[0], references };
}

describe("ReadTaxActivityJournalHandler — le bord de la tranche est toujours posé", () => {
  it("borne une lecture sans filtre à la tranche fiscale", async () => {
    const { call } = await read({ limit: 20 });

    expect(call?.slice).toBe(TAX_JOURNAL_SLICE);
  });

  it.each([
    ["une recherche", { limit: 20, q: "taux" }],
    ["un sujet", { limit: 20, subjectType: "company", subjectId: "company_1" }],
    ["un type hors tranche", { limit: 20, type: "company.activated" }],
    ["un type de contexte de vente", { limit: 20, type: "sales_context.updated" }],
    ["la surtaxe pour sujet", { limit: 20, subjectType: "order_late_fee" }],
    ["une page ancrée", { limit: 20, page: 3, asOf: "01K00000000000000000000009" }],
    ["un curseur", { limit: 20, before: "01K00000000000000000000009" }],
  ])("la garde avec %s, et transmet les filtres tels quels", async (_label, filters) => {
    const { call } = await read(filters);

    expect(call?.slice).toBe(TAX_JOURNAL_SLICE);
    expect(call?.query).toEqual(filters);
  });

  it("élargit le filtre par acteur à toutes les références de la personne", async () => {
    const { call, references } = await read({ limit: 20, actorId: "staff_1" });

    expect(references.asked).toEqual(["staff_1"]);
    expect(call?.actorIds).toEqual(["staff_1", "auth0|actuel"]);
    expect(call?.slice).toBe(TAX_JOURNAL_SLICE);
  });
});
