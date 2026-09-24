import {
  InvalidStorefrontError,
  StorefrontChangedError,
  StorefrontObjectUnknownError,
} from "../storefront-errors.js";
import { StorefrontObject, type StorefrontObjectInput } from "../storefront-object.js";
import { StorefrontPage } from "../storefront-page.js";
import { StorefrontTemplate } from "../storefront-template.js";
import { type Proposed, Storefront, type StorefrontComposition } from "../storefront.js";
import { object, settings } from "./storefront-fixtures.js";

/**
 * L'agrégat de la vitrine. Les instants ne sont comparés qu'à eux-mêmes (le
 * refus 409 affiche l'heure de la dernière modification) : aucune horloge ici.
 */
const SAVED_AT = new Date(Date.UTC(2026, 8, 24, 8, 30));
const SAVING = { at: SAVED_AT, staffId: "fiche-communication" };

const PAGES = [
  { shelfKey: "all", rows: 4 },
  { shelfKey: "choco", rows: 3 },
];

function stored(objects: readonly StorefrontObjectInput[] = [], revision = 3): Storefront {
  return Storefront.reconstitute({
    revision,
    updatedAt: SAVED_AT,
    pages: PAGES,
    objects,
    templates: [],
  });
}

function kept(input: StorefrontObjectInput): Proposed<StorefrontObject> {
  return { value: StorefrontObject.of(input), isNew: false };
}

function fresh(input: StorefrontObjectInput): Proposed<StorefrontObject> {
  return { value: StorefrontObject.of(input), isNew: true };
}

function composition(
  objects: readonly Proposed<StorefrontObject>[],
  overrides: Partial<StorefrontComposition> = {},
): StorefrontComposition {
  return {
    expectedRevision: 3,
    pages: PAGES.map((page) => StorefrontPage.of(page)),
    objects,
    templates: [],
    ...overrides,
  };
}

describe("Storefront.compose — la collision se juge sur CHAQUE rayon", () => {
  it("refuse un objet qui en chevauche un autre sur un rayon qu'ils PARTAGENT seul", () => {
    // Pâques en rangée 1 de « Tout » ET de « choco » ; la tuile, seulement sur
    // « choco », s'y pose en travers. Sur « Tout », elles ne se voient pas.
    const easter = object("easter", "band", [1, 1], ["all", "choco"]);
    const tile = object("tile", "tile", [2, 1], ["choco"]);

    expect(() => stored().compose(composition([fresh(easter), fresh(tile)]), SAVING)).toThrow(
      /L'objet « Bande simple 5×1 » posé en colonne 1, rangée 1 : Sur le rayon « choco », chevauche « Tuile 2×1 » posé en colonne 2, rangée 1\./u,
    );
  });

  it("laisse deux objets à la même place sur deux rayons DIFFÉRENTS", () => {
    const onAll = object("a", "tile", [1, 1], ["all"]);
    const onChoco = object("b", "tile", [1, 1], ["choco"]);

    expect(() =>
      stored().compose(composition([fresh(onAll), fresh(onChoco)]), SAVING),
    ).not.toThrow();
  });

  it("refuse un objet qui déborde des rangées de la page d'UN de ses rayons", () => {
    // Rangée 3 tient sur « Tout » (4 rangées), pas une bande double sur « choco » (3).
    const band = object("d", "doubleBand", [1, 3], ["all", "choco"]);

    expect(() => stored().compose(composition([fresh(band)]), SAVING)).toThrow(
      /sur le rayon « choco » : Déborde des 3 rangées de la page/u,
    );
  });

  it("refuse un objet qui déborde des 5 colonnes", () => {
    const hero = object("h", "hero", [4, 1]);

    expect(() => stored().compose(composition([fresh(hero)]), SAVING)).toThrow(
      /Déborde des 5 colonnes/u,
    );
  });

  it("refuse un objet posé sur un rayon qui n'a pas de page", () => {
    const card = object("c", "card", [1, 1], ["pain"]);

    expect(() => stored().compose(composition([fresh(card)]), SAVING)).toThrow(
      /paraît sur le rayon « pain », qui n'a pas de page/u,
    );
  });

  it("refuse deux pages pour un même rayon", () => {
    const pages = [
      StorefrontPage.of({ shelfKey: "all", rows: 2 }),
      StorefrontPage.of({ shelfKey: "all", rows: 3 }),
    ];

    expect(() => stored().compose(composition([], { pages }), SAVING)).toThrow(
      /Le rayon « Tout » a deux pages/u,
    );
  });
});

describe("Storefront.compose — la révision", () => {
  it("refuse une révision périmée, en donnant l'heure de Paris de la dernière modification", () => {
    expect(() => stored().compose(composition([], { expectedRevision: 2 }), SAVING)).toThrow(
      new StorefrontChangedError(SAVED_AT),
    );
    expect(new StorefrontChangedError(SAVED_AT).message).toBe(
      "La vitrine a été modifiée à 10:30 pendant que vous travailliez — rechargez pour reprendre la dernière version.",
    );
  });

  it("avance d'une révision, et l'écrit avec l'auteur INTERNE", () => {
    const storefront = stored();
    storefront.compose(composition([]), SAVING);

    expect(storefront.revision).toBe(4);
    expect(storefront.toPersistence()).toMatchObject({
      expectedRevision: 3,
      revision: 4,
      updatedAt: SAVED_AT,
      updatedByStaffId: "fiche-communication",
    });
  });

  it("n'a rien à écrire tant que rien n'est composé", () => {
    expect(() => stored().toPersistence()).toThrow(/aucune composition reçue/u);
  });
});

describe("Storefront.compose — archiver plutôt que supprimer", () => {
  it("archive l'objet absent, et dit ce qui a été ajouté, déplacé, archivé", () => {
    const easter = object("easter", "band", [1, 1], ["all", "choco"]);
    const noel = object("noel", "tile", [1, 2], ["all"]);
    const storefront = stored([easter, noel]);

    const changes = storefront.compose(
      composition([kept({ ...noel, row: 3 }), fresh(object("new", "card", [5, 1], ["all"]))]),
      SAVING,
    );

    expect(changes).toEqual({
      added: ["new"],
      moved: ["noel"],
      archived: ["easter"],
      shelves: ["all", "choco"],
    });
    expect(storefront.toPersistence().archivedObjectIds).toEqual(["easter"]);
  });

  it("ne touche aucun rayon quand rien n'a changé", () => {
    const noel = object("noel", "tile", [1, 2], ["all"]);

    const changes = stored([noel]).compose(composition([kept(noel)]), SAVING);

    expect(changes).toEqual({ added: [], moved: [], archived: [], shelves: [] });
  });

  it("refuse un objet cité qui n'est pas dans la vitrine chargée", () => {
    expect(() =>
      stored().compose(composition([kept(object("ghost", "card", [1, 1]))]), SAVING),
    ).toThrow(StorefrontObjectUnknownError);
  });
});

describe("Storefront.compose — contenus et gabarits", () => {
  it("refuse deux contenus sur un objet qui n'en montre qu'un", () => {
    const product = { kind: "product", sku: "CRO-01" } as const;

    expect(() =>
      StorefrontObject.of(object("c", "card", [1, 1], ["all"], { contents: [product, product] })),
    ).toThrow(/ne montre qu'un contenu : passez-le à « plusieurs »/u);
  });

  it("refuse un objet sur aucun rayon", () => {
    expect(() => StorefrontObject.of(object("c", "card", [1, 1], []))).toThrow(
      /ne paraît sur aucun rayon/u,
    );
  });

  it("refuse deux gabarits au même nom, à la casse et aux accents près", () => {
    const template = (id: string, name: string) => ({
      value: StorefrontTemplate.of({ id, name, description: null, settings: settings() }),
      isNew: true,
    });

    expect(() =>
      stored().compose(
        composition([], { templates: [template("t1", "Noël"), template("t2", " noel ")] }),
        SAVING,
      ),
    ).toThrow(/Le gabarit « Noël » existe déjà/u);
  });

  it("refuse un gabarit sans nom", () => {
    expect(() =>
      StorefrontTemplate.of({ id: "t", name: "  ", description: null, settings: settings() }),
    ).toThrow(InvalidStorefrontError);
  });
});
