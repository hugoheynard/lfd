import { HOME_PAGE } from "@lfd/storefront-layout";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { object, settings } from "../../domain/__tests__/storefront-fixtures.js";
import { InvalidStorefrontError } from "../../domain/storefront-errors.js";
import { StorefrontRepository } from "../../domain/storefront.repository.js";
import { Storefront, type StorefrontWrite } from "../../domain/storefront.js";
import { RefocusStorefrontImageCommand } from "../refocus-storefront-image.command.js";
import { RefocusStorefrontImageHandler } from "../refocus-storefront-image.handler.js";

/** L'instant du recadrage : il n'est comparé qu'à ce qu'on relit. */
const NOW = new Date(Date.UTC(2026, 9, 11, 9, 0));
const URL = "https://media.example/fournil.jpg";

/** La vitrine en base — une porte et une info qui montrent {@link URL} —, et ce qu'on y écrit. */
class StoredStorefront extends StorefrontRepository {
  written: StorefrontWrite | null = null;
  loads = 0;

  load(): Promise<Storefront> {
    this.loads += 1;
    return Promise.resolve(
      Storefront.reconstitute({
        revision: 5,
        updatedAt: NOW,
        updatedByStaffId: "fiche-communication",
        pages: [
          { shelfKey: "all", rows: 4 },
          { shelfKey: HOME_PAGE, rows: 4, pickupDoorImage: { url: URL, alt: null } },
        ],
        objects: [
          object("obj_1", "card", [1, 1], ["all"], {
            settings: settings({ multiple: false }),
            contents: [
              {
                kind: "info",
                badge: null,
                title: { fr: "Le fournil" },
                lede: null,
                image: { url: URL, alt: null },
                linkShelfKey: null,
              },
            ],
          }),
        ],
        templates: [],
      }),
    );
  }

  save(storefront: Storefront): Promise<void> {
    this.written = storefront.toPersistence();
    return Promise.resolve();
  }
}

function handler(repository: StoredStorefront): RefocusStorefrontImageHandler {
  return new RefocusStorefrontImageHandler(repository, new DirectUnitOfWork(), new FixedClock(NOW));
}

describe("RefocusStorefrontImageHandler", () => {
  it("charge, recadre par l'agrégat, enregistre sous la révision suivante", async () => {
    const repository = new StoredStorefront();

    const carriers = await handler(repository).execute(
      new RefocusStorefrontImageCommand(URL, { x: 0.4, y: 0.6 }),
    );

    expect(carriers).toBe(2);
    expect(repository.written).toMatchObject({
      expectedRevision: 5,
      revision: 6,
      updatedAt: NOW,
      updatedByStaffId: "fiche-communication",
    });
    expect(
      repository.written?.pages.find((page) => page.shelfKey === HOME_PAGE)?.pickupDoorImage,
    ).toEqual({ url: URL, alt: null, focal: { x: 0.4, y: 0.6 } });
  });

  it("n'enregistre rien quand la vitrine ne montre pas l'image", async () => {
    const repository = new StoredStorefront();

    const carriers = await handler(repository).execute(
      new RefocusStorefrontImageCommand("https://media.example/autre.jpg", { x: 0.4, y: 0.6 }),
    );

    expect(carriers).toBe(0);
    expect(repository.loads).toBe(1);
    expect(repository.written).toBeNull();
  });

  it("refuse un point hors de l'image sans rien écrire", async () => {
    const repository = new StoredStorefront();

    await expect(
      handler(repository).execute(new RefocusStorefrontImageCommand(URL, { x: 3, y: 0 })),
    ).rejects.toBeInstanceOf(InvalidStorefrontError);
    expect(repository.written).toBeNull();
  });
});
