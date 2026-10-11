/**
 * E2E — **l'accueil de la vitrine** (cf.
 * `documentation/mediatheque/mediatheque.md` §7 bis).
 *
 * Ce que seul ce niveau prouve : que la page `home` et sa porte passent les
 * CHECK de la migration `20261010220000_l_accueil_de_la_vitrine`, que la
 * route publique les sert sans connexion, que la bannière et la porte sont
 * BRANCHÉES comme porteurs de la médiathèque (le retrait est refusé), et que
 * l'accueil n'entre dans aucune liste de rayons.
 */
import type {
  PublicStorefrontPageView,
  StorefrontCatalogView,
  StorefrontPayloadInput,
  StorefrontView,
} from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const MEDIA = "/media";
const ADMIN = "/admin/storefront";

let ctx: E2eContext;
let BANNER_IMAGE = "";
let DOOR_IMAGE = "";
let COURIER_IMAGE = "";

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  BANNER_IMAGE = await deposit("banniere.png", 2100, 900);
  DOOR_IMAGE = await deposit("fournil.png", 800, 600);
  COURIER_IMAGE = await deposit("coursier.png", 600, 800);
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

/** Un PNG minimal et valide — signature, largeur, hauteur : deux tailles, deux images. */
async function deposit(name: string, width: number, height: number): Promise<string> {
  const png = Buffer.alloc(24);
  png.writeUInt32BE(0x89504e47, 0);
  png.writeUInt32BE(0x0d0a1a0a, 4);
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(height, 20);
  const response = await staff().post(MEDIA).attach("file", png, name);
  expect(response.status).toBe(201);
  return jsonBody<{ url: string }>(response).url;
}

type ObjectInput = StorefrontPayloadInput["objects"][number];

function banner(url: string, title = "Bienvenue"): ObjectInput {
  return {
    shape: "banner",
    applyOnMobile: true,
    mediaFit: "cover",
    mediaSide: "full",
    multiple: false,
    carousel: { nav: "dots", autoplay: false, intervalSeconds: 5, firstSeconds: 8, sampleCount: 3 },
    column: 1,
    row: 1,
    shelves: ["home"],
    contents: [
      {
        kind: "info",
        badge: null,
        title: { fr: title },
        lede: null,
        image: { url, alt: { fr: "Les vitrines du fournil" } },
        linkShelfKey: null,
        operationKey: null,
      },
    ],
  };
}

function homeBody(revision: number, objects: readonly ObjectInput[]): StorefrontPayloadInput {
  return {
    revision,
    pages: [
      { shelfKey: "all", rows: 4 },
      {
        shelfKey: "home",
        rows: 3,
        pickupDoorImage: { url: DOOR_IMAGE, alt: { fr: "Le fournil" } },
      },
    ],
    objects: [...objects],
    templates: [],
  };
}

async function discard(url: string): Promise<number> {
  return (await staff().delete(`${MEDIA}?url=${encodeURIComponent(url)}`)).status;
}

describe("la page d'accueil", () => {
  it("s'enregistre avec sa bannière et sa porte, et se relit dans l'éditeur", async () => {
    await staff()
      .put(ADMIN)
      .send(homeBody(0, [banner(BANNER_IMAGE)]))
      .expect(204);

    const view = jsonBody<StorefrontView>(await staff().get(ADMIN).expect(200));

    expect(view.pages).toEqual([
      { shelfKey: "all", rows: 4 },
      {
        shelfKey: "home",
        rows: 3,
        pickupDoorImage: { url: DOOR_IMAGE, alt: { fr: "Le fournil" }, focal: null },
        deliveryDoorImage: null,
      },
    ]);
    expect(view.objects[0]).toMatchObject({
      shape: "banner",
      mediaSide: "full",
      shelves: ["home"],
    });
  });

  it("se lit SANS connexion par la route publique, porte comprise", async () => {
    await staff()
      .put(ADMIN)
      .send(homeBody(0, [banner(BANNER_IMAGE)]))
      .expect(204);

    const page = jsonBody<PublicStorefrontPageView>(
      await ctx.http().get("/shop/storefront/home").expect(200),
    );

    expect(page.rows).toBe(3);
    expect(page.pickupDoorImage).toEqual({
      url: DOOR_IMAGE,
      alt: { fr: "Le fournil" },
      focal: null,
    });
    expect(page.objects).toHaveLength(1);
    expect(page.objects[0]).toMatchObject({ shape: "banner", column: 1, row: 1 });
  });

  it("un accueil jamais composé se lit vide, porte à `null` ; un rayon ne porte pas de porte", async () => {
    const home = jsonBody<PublicStorefrontPageView>(
      await ctx.http().get("/shop/storefront/home").expect(200),
    );
    const all = jsonBody<PublicStorefrontPageView>(
      await ctx.http().get("/shop/storefront/all").expect(200),
    );

    expect(home).toEqual({ rows: 0, objects: [], pickupDoorImage: null, deliveryDoorImage: null });
    expect(all).toEqual({ rows: 0, objects: [] });
  });

  it("refuse une porte posée sur un rayon (400)", async () => {
    const body: StorefrontPayloadInput = {
      revision: 0,
      pages: [{ shelfKey: "all", rows: 4, pickupDoorImage: { url: DOOR_IMAGE, alt: null } }],
      objects: [],
      templates: [],
    };

    await staff().put(ADMIN).send(body).expect(400);
  });

  it("le CHECK refuse une porte hors de l'accueil écrite à la main", async () => {
    await expect(
      ctx.prisma.$executeRawUnsafe(
        `INSERT INTO "public"."storefront_page" ("shelf_key", "rows", "pickup_door_image_url") VALUES ('all', 4, 'https://x/y.png')`,
      ),
    ).rejects.toThrow(/storefront_page_door_on_home/u);
  });

  it("n'entre pas dans la liste des rayons de l'éditeur", async () => {
    await staff()
      .put(ADMIN)
      .send(homeBody(0, [banner(BANNER_IMAGE)]))
      .expect(204);

    const catalog = jsonBody<StorefrontCatalogView>(
      await staff().get(`${ADMIN}/catalog`).expect(200),
    );

    expect(catalog.shelves.map((shelf) => shelf.key)).not.toContain("home");
  });
});

describe("l'accueil, porteur de la médiathèque", () => {
  it("REFUSE de retirer l'image de la bannière ou de la porte (409)", async () => {
    await staff()
      .put(ADMIN)
      .send(homeBody(0, [banner(BANNER_IMAGE)]))
      .expect(204);

    expect(await discard(BANNER_IMAGE)).toBe(409);
    expect(await discard(DOOR_IMAGE)).toBe(409);
  });

  it("nomme la porte de l'accueil", async () => {
    await staff().put(ADMIN).send(homeBody(0, [])).expect(204);

    const response = await staff().get(`${MEDIA}/carriers`).query({ url: DOOR_IMAGE }).expect(200);

    expect(jsonBody<unknown>(response)).toEqual([
      { kind: "storefront", id: "home", label: "Accueil — porte « Je passe la prendre »" },
    ]);
  });

  it("nomme « Accueil — bannière » une bannière au titre hérité d'une opération", async () => {
    // Le seul cas d'une info sans titre : liée à une opération, elle en hérite
    // le nom à la lecture — le porteur, lui, n'a que la forme pour se nommer.
    const linked = banner(BANNER_IMAGE, "");
    const withOperation: ObjectInput = {
      ...linked,
      contents: linked.contents.map((content) =>
        content.kind === "info" ? { ...content, operationKey: "noel-2026" } : content,
      ),
    };
    await staff()
      .put(ADMIN)
      .send(homeBody(0, [withOperation]))
      .expect(204);
    const objectId = (await ctx.prisma.storefrontObject.findFirstOrThrow()).id;

    const response = await staff()
      .get(`${MEDIA}/carriers`)
      .query({ url: BANNER_IMAGE })
      .expect(200);

    expect(jsonBody<unknown>(response)).toEqual([
      { kind: "storefront", id: objectId, label: "Accueil — bannière" },
    ]);
  });

  it("nomme la bannière titrée « Accueil — <titre> »", async () => {
    await staff()
      .put(ADMIN)
      .send(homeBody(0, [banner(BANNER_IMAGE)]))
      .expect(204);
    const objectId = (await ctx.prisma.storefrontObject.findFirstOrThrow()).id;

    const response = await staff()
      .get(`${MEDIA}/carriers`)
      .query({ url: BANNER_IMAGE })
      .expect(200);

    expect(jsonBody<unknown>(response)).toEqual([
      { kind: "storefront", id: objectId, label: "Accueil — Bienvenue" },
    ]);
  });

  it("libère l'image de la porte une fois retirée de l'accueil", async () => {
    await staff().put(ADMIN).send(homeBody(0, [])).expect(204);
    const body = homeBody(1, []);

    await staff()
      .put(ADMIN)
      .send({ ...body, pages: [{ shelfKey: "home", rows: 3, pickupDoorImage: null }] })
      .expect(204);

    expect(await discard(DOOR_IMAGE)).toBe(204);
  });
});

/** L'accueil avec ses DEUX portes : la retrait sur le fournil, la livraison sur le coursier. */
function bothDoors(revision: number): StorefrontPayloadInput {
  return {
    revision,
    pages: [
      {
        shelfKey: "home",
        rows: 3,
        pickupDoorImage: { url: DOOR_IMAGE, alt: { fr: "Le fournil" } },
        deliveryDoorImage: {
          url: COURIER_IMAGE,
          alt: { fr: "Le coursier" },
          focal: { x: 0.4, y: 0.6 },
        },
      },
    ],
    objects: [],
    templates: [],
  };
}

describe("la porte livraison de l'accueil", () => {
  it("s'enregistre à côté de la porte retrait, et se lit SANS connexion", async () => {
    await staff().put(ADMIN).send(bothDoors(0)).expect(204);

    const page = jsonBody<PublicStorefrontPageView>(
      await ctx.http().get("/shop/storefront/home").expect(200),
    );

    expect(page.deliveryDoorImage).toEqual({
      url: COURIER_IMAGE,
      alt: { fr: "Le coursier" },
      focal: { x: 0.4, y: 0.6 },
    });
    expect(page.pickupDoorImage?.url).toBe(DOOR_IMAGE);
  });

  it("refuse une porte livraison posée sur un rayon (400)", async () => {
    const body: StorefrontPayloadInput = {
      revision: 0,
      pages: [{ shelfKey: "all", rows: 4, deliveryDoorImage: { url: COURIER_IMAGE, alt: null } }],
      objects: [],
      templates: [],
    };

    await staff().put(ADMIN).send(body).expect(400);
  });

  it("le CHECK refuse une porte livraison hors de l'accueil, ou à une seule coordonnée, écrite à la main", async () => {
    await expect(
      ctx.prisma.$executeRawUnsafe(
        `INSERT INTO "public"."storefront_page" ("shelf_key", "rows", "delivery_door_image_url") VALUES ('all', 4, 'https://x/y.png')`,
      ),
    ).rejects.toThrow(/storefront_page_delivery_door_on_home/u);
    await expect(
      ctx.prisma.$executeRawUnsafe(
        `INSERT INTO "public"."storefront_page" ("shelf_key", "rows", "delivery_door_image_url", "delivery_door_focal_x") VALUES ('home', 4, 'https://x/y.png', 0.5)`,
      ),
    ).rejects.toThrow(/storefront_page_delivery_door_focal_check/u);
  });

  it("est un porteur de la médiathèque : nommée, et son image ne se retire pas (409)", async () => {
    await staff().put(ADMIN).send(bothDoors(0)).expect(204);

    const response = await staff()
      .get(`${MEDIA}/carriers`)
      .query({ url: COURIER_IMAGE })
      .expect(200);

    expect(jsonBody<unknown>(response)).toEqual([
      { kind: "storefront", id: "home", label: "Accueil — porte livraison" },
    ]);
    expect(await discard(COURIER_IMAGE)).toBe(409);
  });

  it("libère son image une fois retirée, la porte retrait gardant la sienne", async () => {
    await staff().put(ADMIN).send(bothDoors(0)).expect(204);

    await staff().put(ADMIN).send(homeBody(1, [])).expect(204);

    expect(await discard(COURIER_IMAGE)).toBe(204);
    expect(await discard(DOOR_IMAGE)).toBe(409);
  });
});
