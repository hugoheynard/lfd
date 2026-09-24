import type { StorefrontPayload } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  InvalidStorefrontError,
  StorefrontChangedError,
  StorefrontObjectUnknownError,
} from "../../domain/storefront-errors.js";
import type { StorefrontObjectInput } from "../../domain/storefront-object.js";
import { StorefrontRepository } from "../../domain/storefront.repository.js";
import { Storefront, type StorefrontWrite } from "../../domain/storefront.js";
import { SaveStorefrontCommand } from "../save-storefront.command.js";
import { SaveStorefrontHandler } from "../save-storefront.handler.js";

/** L'instant de l'enregistrement : il n'est comparé qu'à ce qu'on relit. */
const NOW = new Date(Date.UTC(2026, 8, 24, 9, 0));
const STAFF = "fiche-communication";

const CAROUSEL = {
  nav: "dots",
  autoplay: false,
  intervalSeconds: 5,
  firstSeconds: 8,
  sampleCount: 3,
} as const;

const SETTINGS = {
  applyOnMobile: true,
  mediaFit: "cover",
  multiple: false,
  carousel: CAROUSEL,
  tone: "light",
} as const;

/** La vitrine en base, ce qu'on y écrit, et l'ordre des gestes. */
class StoredStorefront extends StorefrontRepository {
  written: StorefrontWrite | null = null;
  readonly calls: string[];

  constructor(
    private readonly state: {
      readonly revision: number;
      readonly objects: readonly StorefrontObjectInput[];
    },
    calls: string[],
    private readonly refuseSave = false,
  ) {
    super();
    this.calls = calls;
  }

  load(): Promise<Storefront> {
    this.calls.push("load");
    return Promise.resolve(
      Storefront.reconstitute({
        revision: this.state.revision,
        updatedAt: this.state.revision === 0 ? null : NOW,
        pages: [{ shelfKey: "all", rows: 4 }],
        objects: this.state.objects,
        templates: [],
      }),
    );
  }

  save(storefront: Storefront): Promise<void> {
    this.calls.push("save");
    if (this.refuseSave) {
      // Le verrou SQL : quelqu'un a enregistré entre le chargement et l'écriture.
      return Promise.reject(new StorefrontChangedError(NOW));
    }
    this.written = storefront.toPersistence();
    return Promise.resolve();
  }
}

class TracingPublisher extends RecordingPublisher {
  constructor(private readonly calls: string[]) {
    super();
  }

  override publishTraced(event: Parameters<RecordingPublisher["publishTraced"]>[0]): Promise<void> {
    this.calls.push("publish");
    return super.publishTraced(event);
  }
}

function payload(overrides: Partial<StorefrontPayload> = {}): StorefrontPayload {
  return {
    revision: 0,
    pages: [{ shelfKey: "all", rows: 4 }],
    objects: [
      {
        ...SETTINGS,
        shape: "band",
        mediaSide: "left",
        column: 1,
        row: 1,
        shelves: ["all"],
        contents: [{ kind: "product", sku: "CRO-01" }],
      },
    ],
    templates: [],
    ...overrides,
  };
}

function harness(
  state: { readonly revision: number; readonly objects: readonly StorefrontObjectInput[] },
  refuseSave = false,
) {
  const calls: string[] = [];
  const repository = new StoredStorefront(state, calls, refuseSave);
  const events = new TracingPublisher(calls);
  const handler = new SaveStorefrontHandler(
    repository,
    events,
    new DirectUnitOfWork(),
    new FixedClock(NOW),
    new FixedIdGenerator("sfo"),
  );
  return { handler, repository, events, calls };
}

describe("SaveStorefrontHandler", () => {
  it("identifie l'objet neuf, écrit la vitrine avec l'auteur interne, puis trace", async () => {
    const { handler, repository, events, calls } = harness({ revision: 0, objects: [] });

    await handler.execute(new SaveStorefrontCommand(payload(), STAFF));

    expect(calls).toEqual(["load", "save", "publish"]);
    expect(repository.written).toMatchObject({
      expectedRevision: 0,
      revision: 1,
      updatedAt: NOW,
      updatedByStaffId: STAFF,
      archivedObjectIds: [],
    });
    expect(repository.written?.objects.map((object) => object.id)).toEqual(["sfo_000001"]);
    expect(events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "storefront.saved",
        subjectType: "storefront",
        subjectId: "main",
        payload: {
          subjectLabel: "Vitrine",
          revision: 1,
          added: ["sfo_000001"],
          moved: [],
          archived: [],
          shelves: ["all"],
        },
      },
    ]);
  });

  it("archive l'objet que l'éditeur n'a pas renvoyé", async () => {
    const noel: StorefrontObjectInput = {
      id: "noel",
      settings: { ...SETTINGS, shape: "tile", mediaSide: "left" },
      column: 1,
      row: 2,
      shelves: ["all"],
      contents: [],
    };
    const { handler, repository } = harness({ revision: 2, objects: [noel] });

    await handler.execute(new SaveStorefrontCommand(payload({ revision: 2, objects: [] }), STAFF));

    expect(repository.written?.archivedObjectIds).toEqual(["noel"]);
  });

  it("refuse une composition qui ne tient pas AVANT d'ouvrir quoi que ce soit", async () => {
    const { handler, calls } = harness({ revision: 0, objects: [] });
    const overflowing = payload();
    const band = overflowing.objects[0];
    if (band === undefined) {
      throw new Error("la charge de test porte un objet");
    }

    await expect(
      handler.execute(
        new SaveStorefrontCommand(
          { ...overflowing, objects: [{ ...band, mediaSide: "top" }] },
          STAFF,
        ),
      ),
    ).rejects.toThrow(InvalidStorefrontError);
    expect(calls).toEqual([]);
  });

  it("refuse une révision périmée sans rien écrire ni tracer", async () => {
    const { handler, calls } = harness({ revision: 5, objects: [] });

    await expect(
      handler.execute(new SaveStorefrontCommand(payload({ revision: 4 }), STAFF)),
    ).rejects.toThrow(StorefrontChangedError);
    expect(calls).toEqual(["load"]);
  });

  it("ne trace rien quand le verrou en base refuse", async () => {
    const { handler, calls, events } = harness({ revision: 0, objects: [] }, true);

    await expect(handler.execute(new SaveStorefrontCommand(payload(), STAFF))).rejects.toThrow(
      StorefrontChangedError,
    );
    expect(calls).toEqual(["load", "save"]);
    expect(events.traced).toEqual([]);
  });

  it("refuse un objet cité qui n'est plus dans la vitrine", async () => {
    const { handler } = harness({ revision: 0, objects: [] });
    const cited = payload();
    const band = cited.objects[0];
    if (band === undefined) {
      throw new Error("la charge de test porte un objet");
    }

    await expect(
      handler.execute(
        new SaveStorefrontCommand({ ...cited, objects: [{ ...band, id: "archive" }] }, STAFF),
      ),
    ).rejects.toThrow(StorefrontObjectUnknownError);
  });
});
