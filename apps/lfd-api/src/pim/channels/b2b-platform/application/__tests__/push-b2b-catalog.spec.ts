import { Test } from "@nestjs/testing";

import type { PimJournalEntry } from "../../../../journal/pim-journal.js";
import { PIM_EVENTS, PimJournal } from "../../../../journal/pim-journal.js";
import { B2bCatalogPushService, type B2bPushSummary } from "../../products/push.service.js";
import { PushB2bCatalogCommand, PushB2bCatalogHandler } from "../push-b2b-catalog.js";

/**
 * Ce que ces cas tiennent : **le geste laisse une trace, et laquelle**.
 *
 * `catalog_revision_publication` dit ce qui est parti ; il ne dit pas qui l'a
 * envoyé. Envoyer le catalogue dehors est le geste le plus conséquent de cet
 * écran, et il n'avait aucune trace d'audit avant ce handler.
 */

function summary(over: Partial<B2bPushSummary> = {}): B2bPushSummary {
  return {
    mode: "live",
    candidates: 12,
    report: null,
    excluded: [],
    fingerprint: "empreinte-A",
    revisionId: "rev_1",
    ...over,
  };
}

/** Note ce qui a été demandé au service, et ce qui a été tracé. */
function build(result: B2bPushSummary | Error) {
  const asked: { dryRun: boolean; fingerprint: string | undefined }[] = [];
  const traced: PimJournalEntry[] = [];

  const pushService = {
    push: (dryRun: boolean, fingerprint?: string) => {
      asked.push({ dryRun, fingerprint });
      return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
    },
  };
  const journal = {
    trace: (entry: PimJournalEntry) => {
      traced.push(entry);
      return Promise.resolve({ id: "ticket" });
    },
  };

  return { pushService, journal, asked, traced };
}

/**
 * Le module de test plutôt qu'un `new` : les doubles n'implémentent que ce que
 * le handler appelle, et seul `useValue` permet de le dire sans forcer un type.
 * Un `as unknown as` aurait fait la même chose en cachant la question.
 */
async function make(result: B2bPushSummary | Error) {
  const { pushService, journal, asked, traced } = build(result);
  const moduleRef = await Test.createTestingModule({
    providers: [
      PushB2bCatalogHandler,
      { provide: B2bCatalogPushService, useValue: pushService },
      { provide: PimJournal, useValue: journal },
    ],
  }).compile();
  return { handler: moduleRef.get(PushB2bCatalogHandler), asked, traced };
}

describe("PushB2bCatalogHandler", () => {
  it("transmet le mode et l’empreinte au service, sans les réinterpréter", async () => {
    const { handler, asked } = await make(summary());

    await handler.execute(new PushB2bCatalogCommand(false, "empreinte-A"));

    expect(asked).toEqual([{ dryRun: false, fingerprint: "empreinte-A" }]);
  });

  it("inscrit le fait, sur l’ancre que le push a posée", async () => {
    const { handler, traced } = await make(summary({ candidates: 12, revisionId: "rev_7" }));

    await handler.execute(new PushB2bCatalogCommand(false, undefined));

    expect(traced).toHaveLength(1);
    expect(traced[0]).toMatchObject({
      type: PIM_EVENTS.catalogRevisionPushed,
      subjectType: "catalog_revision",
      subjectId: "rev_7",
      blast: { articles: 12 },
    });
  });

  /**
   * Le mode vit dans le payload plutôt que dans deux faits séparés : une
   * simulation laisse elle aussi une ligne de publication en base, et un
   * journal qui la tairait laisserait des ancres sans explication.
   */
  it("dit le mode dans le fait — une simulation se trace aussi", async () => {
    const { handler, traced } = await make(summary({ mode: "dry-run" }));

    await handler.execute(new PushB2bCatalogCommand(true, undefined));

    expect(traced[0]?.payload).toMatchObject({ channel: "b2b", mode: "dry-run" });
  });

  /** Rien n'est parti, rien n'a été figé : il n'y a pas d'acte à inscrire. */
  it("ne trace RIEN quand il n’y avait rien à envoyer", async () => {
    const { handler, traced } = await make(summary({ candidates: 0, revisionId: null }));

    const result = await handler.execute(new PushB2bCatalogCommand(false, undefined));

    expect(traced).toEqual([]);
    expect(result.candidates).toBe(0);
  });

  /**
   * 🔴 Un refus de dérive ne laisse pas de trace ici, et c'est le comportement
   * voulu : le journal répond à « qui a agi », et rien n'est parti. La lecture
   * de `catalog_revision_publication` répond, elle, à « qu'est-ce qui est
   * parti ». Sans ce cas, une inversion silencieuse ferait croire à un envoi.
   */
  it("ne trace rien quand le push est refusé", async () => {
    const { handler, traced } = await make(new Error("dérive"));

    await expect(handler.execute(new PushB2bCatalogCommand(false, "périmée"))).rejects.toThrow(
      "dérive",
    );
    expect(traced).toEqual([]);
  });
});
