import { HOME_PAGE } from "@lfd/storefront-layout";

import { ObjectSettings } from "../object-settings.js";
import { ShelfKey } from "../shelf-key.js";
import { StorefrontContent } from "../storefront-content.js";
import { InvalidStorefrontError } from "../storefront-errors.js";
import { StorefrontObject } from "../storefront-object.js";
import { StorefrontPage, type StorefrontPageInput } from "../storefront-page.js";
import { Storefront, type StorefrontComposition } from "../storefront.js";
import { object, settings } from "./storefront-fixtures.js";

/**
 * L'accueil de la vitrine (plan de la médiathèque, L6, D7, D9) : la page
 * `home`, la bannière 21/9, et l'image de la porte « Je passe la prendre ».
 * Les instants ne sont comparés qu'à eux-mêmes : aucune horloge ici.
 */
const SAVING = { at: new Date(Date.UTC(2026, 9, 10, 8, 0)), staffId: "fiche-communication" };
const DOOR = { url: "https://media.example/fournil.jpg", alt: { fr: "Le fournil" } };
const PAGES: readonly StorefrontPageInput[] = [
  { shelfKey: "all", rows: 4 },
  { shelfKey: HOME_PAGE, rows: 4, pickupDoorImage: null },
];

function stored(pages: readonly StorefrontPageInput[] = PAGES): Storefront {
  return Storefront.reconstitute({
    revision: 1,
    updatedAt: null,
    pages,
    objects: [],
    templates: [],
  });
}

function composition(
  objects: readonly StorefrontObject[],
  pages: readonly StorefrontPageInput[] = PAGES,
): StorefrontComposition {
  return {
    expectedRevision: 1,
    pages: pages.map((page) => StorefrontPage.of(page)),
    objects: objects.map((value) => ({ value, isNew: true })),
    templates: [],
  };
}

describe("la page `home`", () => {
  it("est une clé de page valide, mais pas un rayon qu'une annonce ouvre", () => {
    expect(ShelfKey.of(HOME_PAGE).value).toBe("home");
    expect(() =>
      StorefrontContent.of({
        kind: "info",
        badge: null,
        title: { fr: "Venez" },
        lede: null,
        image: null,
        linkShelfKey: HOME_PAGE,
      }),
    ).toThrow("Une annonce n'ouvre pas l'accueil");
  });

  it("porte l'image de sa porte, nettoyée", () => {
    const page = StorefrontPage.of({
      shelfKey: HOME_PAGE,
      rows: 2,
      pickupDoorImage: { url: `  ${DOOR.url} `, alt: { fr: " Le fournil " } },
    });
    expect(page.state.pickupDoorImage).toEqual(DOOR);
  });

  it("une porte absente vaut `null`", () => {
    expect(StorefrontPage.of({ shelfKey: HOME_PAGE, rows: 2 }).state.pickupDoorImage).toBeNull();
  });

  it("refuse une porte sur un rayon, en renvoyant à l'accueil", () => {
    expect(() => StorefrontPage.of({ shelfKey: "all", rows: 2, pickupDoorImage: DOOR })).toThrow(
      "son image se règle sur la page d'accueil",
    );
  });

  it("refuse une porte sans adresse d'image", () => {
    expect(() =>
      StorefrontPage.of({ shelfKey: HOME_PAGE, rows: 2, pickupDoorImage: { url: " ", alt: null } }),
    ).toThrow(InvalidStorefrontError);
  });
});

describe("la bannière 21/9", () => {
  it("n'a qu'une image pleine", () => {
    expect(ObjectSettings.of(settings({ shape: "banner", mediaSide: "full" })).state.shape).toBe(
      "banner",
    );
    expect(() => ObjectSettings.of(settings({ shape: "banner", mediaSide: "left" }))).toThrow(
      "ne place pas son image « left »",
    );
  });

  it("se pose sur l'accueil ET sur un rayon, à la même place", () => {
    const storefront = stored();
    const banner = StorefrontObject.of(object("b", "banner", [1, 1], [HOME_PAGE, "all"]));
    const changes = storefront.compose(composition([banner]), SAVING);
    expect(changes.shelves).toEqual(["all", "home"]);
  });

  it("refuse un objet posé à côté d'elle, en nommant l'accueil", () => {
    const banner = StorefrontObject.of(object("b", "banner", [1, 1], [HOME_PAGE]));
    const card = StorefrontObject.of(object("c", "card", [5, 2], [HOME_PAGE]));
    expect(() => stored().compose(composition([banner, card]), SAVING)).toThrow(
      "Sur le rayon « Accueil », chevauche « Carte 1×1 »",
    );
  });
});

describe("la porte au journal", () => {
  it("changer l'image de la porte touche l'accueil, et s'écrit", () => {
    const storefront = stored();
    const pages = [
      { shelfKey: "all", rows: 4 },
      { shelfKey: HOME_PAGE, rows: 4, pickupDoorImage: DOOR },
    ];
    const changes = storefront.compose(composition([], pages), SAVING);
    expect(changes.shelves).toEqual(["home"]);
    expect(storefront.toPersistence().pages).toContainEqual({
      shelfKey: HOME_PAGE,
      rows: 4,
      pickupDoorImage: DOOR,
    });
  });
});
