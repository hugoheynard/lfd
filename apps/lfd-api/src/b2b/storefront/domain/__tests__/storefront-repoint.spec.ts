import { HOME_PAGE } from "@lfd/storefront-layout";

import type { StorefrontContentInput } from "../storefront-content.js";
import { StorefrontNotComposedError } from "../storefront-errors.js";
import type { StorefrontPageInput } from "../storefront-page.js";
import { Storefront } from "../storefront.js";
import { object, settings } from "./storefront-fixtures.js";

/**
 * **Remplacer une image** dans la vitrine (L7 du plan de la médiathèque) :
 * l'agrégat repointe ses contenus et sa porte, compte ses porteurs, et ne
 * monte la révision que s'il a changé quelque chose. Aucune horloge ici :
 * l'instant n'est qu'inscrit.
 */
const OLD = "https://media.example/products/a.jpg";
const NEW = "https://media.example/products/b.jpg";
const SAVING = { at: new Date(Date.UTC(2026, 9, 10, 8, 0)), staffId: "fiche-communication" };

function info(url: string | null, title = "Galette"): StorefrontContentInput {
  return {
    kind: "info",
    badge: null,
    title: { fr: title },
    lede: null,
    image: url === null ? null : { url, alt: { fr: "Sa propre alternative" } },
    linkShelfKey: null,
  };
}

function stored(door: string | null, contents: readonly StorefrontContentInput[][]): Storefront {
  const pages: StorefrontPageInput[] = [
    { shelfKey: "all", rows: 4 },
    {
      shelfKey: HOME_PAGE,
      rows: 4,
      pickupDoorImage: door === null ? null : { url: door, alt: { fr: "Le fournil" } },
    },
  ];
  return Storefront.reconstitute({
    revision: 3,
    updatedAt: null,
    pages,
    objects: contents.map((items, index) =>
      object(`obj_${String(index)}`, "card", [1 + index, 1], ["all"], {
        settings: settings({ multiple: items.length > 1 }),
        contents: items,
      }),
    ),
    templates: [],
  });
}

describe("Storefront.repointImage", () => {
  it("repointe contenus et porte, compte un porteur par objet, et monte la révision", () => {
    const storefront = stored(OLD, [[info(OLD), info(OLD, "Brioche")], [info(null)]]);

    expect(storefront.repointImage(OLD, NEW, SAVING)).toBe(2);

    const written = storefront.toPersistence();
    expect(written.revision).toBe(4);
    expect(written.updatedByStaffId).toBe("fiche-communication");
    expect(written.archivedObjectIds).toEqual([]);
    const images = written.objects.flatMap((item) =>
      item.contents.map((content) => (content.kind === "info" ? content.image : null)),
    );
    expect(images).toEqual([
      { url: NEW, alt: { fr: "Sa propre alternative" } },
      { url: NEW, alt: { fr: "Sa propre alternative" } },
      null,
    ]);
    expect(written.pages.find((page) => page.shelfKey === HOME_PAGE)?.pickupDoorImage).toEqual({
      url: NEW,
      alt: { fr: "Le fournil" },
    });
  });

  it("garde les deux contenus d'un objet qui montrait déjà la nouvelle image", () => {
    const storefront = stored(null, [[info(NEW, "Avant"), info(OLD, "Après")]]);

    expect(storefront.repointImage(OLD, NEW, SAVING)).toBe(1);
    expect(storefront.toPersistence().objects[0]?.contents).toHaveLength(2);
  });

  it("ne change rien, et n'a rien à écrire, quand personne ne montrait l'image", () => {
    const storefront = stored(NEW, [[info(NEW)]]);

    expect(storefront.repointImage(OLD, NEW, SAVING)).toBe(0);
    expect(() => storefront.toPersistence()).toThrow(StorefrontNotComposedError);
    expect(storefront.revision).toBe(3);
  });
});
