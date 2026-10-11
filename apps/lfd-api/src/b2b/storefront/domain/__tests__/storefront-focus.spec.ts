import { HOME_PAGE } from "@lfd/storefront-layout";

import type { StorefrontContentInput } from "../storefront-content.js";
import { InvalidStorefrontError, StorefrontNotComposedError } from "../storefront-errors.js";
import { StorefrontImage, type StorefrontFocal } from "../storefront-image.js";
import type { StorefrontPageInput } from "../storefront-page.js";
import { Storefront } from "../storefront.js";
import { object, settings } from "./storefront-fixtures.js";

/**
 * **Le point focal jusqu'à la vitrine** (L10 du plan de la médiathèque) :
 * l'image le porte, facultatif ; l'agrégat le recadre quand la médiathèque
 * redécrit l'image, compte ses porteurs, et ne monte la révision que s'il a
 * changé quelque chose. Aucune horloge ici : l'instant n'est qu'inscrit.
 */
const URL = "https://media.example/products/a.jpg";
const OTHER = "https://media.example/products/b.jpg";
const AT = new Date(Date.UTC(2026, 9, 11, 8, 0));
const AUTHOR = "fiche-communication";
const MISSING = "L'image manque.";

function info(url: string | null, focal?: StorefrontFocal | null): StorefrontContentInput {
  return {
    kind: "info",
    badge: null,
    title: { fr: "Galette" },
    lede: null,
    image: url === null ? null : { url, alt: null, ...(focal === undefined ? {} : { focal }) },
    linkShelfKey: null,
  };
}

function stored(
  door: string | null,
  contents: readonly StorefrontContentInput[][],
  author: string | null = AUTHOR,
): Storefront {
  const pages: StorefrontPageInput[] = [
    { shelfKey: "all", rows: 4 },
    {
      shelfKey: HOME_PAGE,
      rows: 4,
      pickupDoorImage: door === null ? null : { url: door, alt: null },
    },
  ];
  return Storefront.reconstitute({
    revision: 3,
    updatedAt: null,
    updatedByStaffId: author,
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

describe("StorefrontImage — le point focal, facultatif", () => {
  it("vaut `null` quand l'éditeur ne l'envoie pas : la boutique recadre au centre", () => {
    expect(StorefrontImage.of({ url: URL, alt: null }, MISSING).state.focal).toBeNull();
  });

  it("garde le point envoyé, bords compris", () => {
    expect(
      StorefrontImage.of({ url: URL, alt: null, focal: { x: 0, y: 1 } }, MISSING).state,
    ).toEqual({ url: URL, alt: null, focal: { x: 0, y: 1 } });
  });

  it.each([
    { x: 1.2, y: 0.5 },
    { x: 0.5, y: -0.1 },
    { x: Number.NaN, y: 0.5 },
  ])("refuse un point hors de l'image (%o)", (focal) => {
    expect(() => StorefrontImage.of({ url: URL, alt: null, focal }, MISSING)).toThrow(
      InvalidStorefrontError,
    );
  });
});

describe("Storefront.refocus", () => {
  it("recadre contenus et porte, compte un porteur par objet, et monte la révision", () => {
    const storefront = stored(URL, [[info(URL), info(URL)], [info(OTHER)], [info(null)]]);

    expect(storefront.refocus(URL, { x: 0.2, y: 0.8 }, AT)).toBe(2);

    const written = storefront.toPersistence();
    expect(written.revision).toBe(4);
    expect(written.expectedRevision).toBe(3);
    expect(written.updatedAt).toBe(AT);
    expect(written.archivedObjectIds).toEqual([]);
    const focals = written.objects.flatMap((item) =>
      item.contents.map((content) => (content.kind === "info" ? content.image?.focal : undefined)),
    );
    expect(focals).toEqual([{ x: 0.2, y: 0.8 }, { x: 0.2, y: 0.8 }, null, undefined]);
    expect(written.pages.find((page) => page.shelfKey === HOME_PAGE)?.pickupDoorImage).toEqual({
      url: URL,
      alt: null,
      focal: { x: 0.2, y: 0.8 },
    });
  });

  it("garde l'auteur du dernier enregistrement : le recadrage n'est le geste de personne ici", () => {
    const storefront = stored(null, [[info(URL)]]);

    storefront.refocus(URL, { x: 0.5, y: 0.1 }, AT);

    expect(storefront.toPersistence().updatedByStaffId).toBe(AUTHOR);
  });

  it("revient au centre quand la médiathèque retire le point", () => {
    const storefront = stored(null, [[info(URL, { x: 0.1, y: 0.1 })]]);

    expect(storefront.refocus(URL, null, AT)).toBe(1);

    const [content] = storefront.toPersistence().objects[0]?.contents ?? [];
    expect(content?.kind === "info" ? content.image?.focal : undefined).toBeNull();
  });

  it("n'écrit rien quand le point est déjà celui-là : un éditeur ouvert n'est pas refusé pour rien", () => {
    const storefront = stored(null, [[info(URL, { x: 0.3, y: 0.3 })]]);

    expect(storefront.refocus(URL, { x: 0.3, y: 0.3 }, AT)).toBe(0);
    expect(storefront.revision).toBe(3);
    expect(() => storefront.toPersistence()).toThrow(StorefrontNotComposedError);
  });

  it("n'écrit rien quand la vitrine ne montre pas l'image", () => {
    const storefront = stored(OTHER, [[info(OTHER)]]);

    expect(storefront.refocus(URL, { x: 0.3, y: 0.3 }, AT)).toBe(0);
    expect(storefront.revision).toBe(3);
  });

  it("n'écrit rien sur une vitrine jamais enregistrée", () => {
    const storefront = stored(null, [], null);

    expect(storefront.refocus(URL, { x: 0.3, y: 0.3 }, AT)).toBe(0);
  });

  it("refuse un point hors de l'image, avant d'avoir rien touché", () => {
    const storefront = stored(URL, [[info(URL)]]);

    expect(() => storefront.refocus(URL, { x: 2, y: 0 }, AT)).toThrow(InvalidStorefrontError);
    expect(storefront.revision).toBe(3);
  });
});
