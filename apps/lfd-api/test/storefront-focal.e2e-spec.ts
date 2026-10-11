/**
 * E2E — **le point focal jusqu'à la vitrine** (cf.
 * `documentation/mediatheque/mediatheque.md` §7 bis, 2026-10-11).
 *
 * Ce que seul ce niveau prouve : que les colonnes et leurs CHECK de
 * `20261011140000_le_point_focal_jusqu_a_la_vitrine` tiennent, que le point
 * envoyé par l'éditeur se relit à la boutique, et que la médiathèque le fait
 * suivre par la vraie boîte d'envoi — deux blocs, un fait durable, la révision
 * de la vitrine montée, et l'éditeur ouvert avant refusé.
 */
import type { PublicStorefrontPageView, StorefrontPayloadInput } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const MEDIA = "/media";
const ADMIN = "/admin/storefront";

let ctx: E2eContext;
let BANNER_IMAGE = "";
let DOOR_IMAGE = "";

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

type Focal = { readonly x: number; readonly y: number } | null;

/** L'accueil : une bannière et la porte, chacune avec le point que l'éditeur a lu. */
function homeBody(revision: number, banner: Focal, door: Focal): StorefrontPayloadInput {
  return {
    revision,
    pages: [
      { shelfKey: "all", rows: 4 },
      { shelfKey: "home", rows: 3, pickupDoorImage: { url: DOOR_IMAGE, alt: null, focal: door } },
    ],
    objects: [
      {
        shape: "banner",
        applyOnMobile: true,
        mediaFit: "cover",
        mediaSide: "full",
        multiple: false,
        carousel: {
          nav: "dots",
          autoplay: false,
          intervalSeconds: 5,
          firstSeconds: 8,
          sampleCount: 3,
        },
        column: 1,
        row: 1,
        shelves: ["home"],
        contents: [
          {
            kind: "info",
            badge: null,
            title: { fr: "Bienvenue" },
            lede: null,
            image: { url: BANNER_IMAGE, alt: null, focal: banner },
            linkShelfKey: null,
            operationKey: null,
          },
        ],
      },
    ],
    templates: [],
  };
}

async function home(): Promise<PublicStorefrontPageView> {
  return jsonBody<PublicStorefrontPageView>(
    await ctx.http().get("/shop/storefront/home").expect(200),
  );
}

function bannerFocal(page: PublicStorefrontPageView): unknown {
  const [content] = page.objects[0]?.contents ?? [];
  return content?.kind === "info" ? content.image?.focal : undefined;
}

/** Livre tout ce qui attend dans la boîte d'envoi. */
async function settle(): Promise<void> {
  for (let round = 0; round < 2; round += 1) {
    await ctx.drain();
    await ctx
      .http()
      .post("/admin/outbox/sweep")
      .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
      .expect(200);
  }
}

describe("le point focal à l'enregistrement de la vitrine", () => {
  it("se relit à la boutique tel que l'éditeur l'a envoyé, porte et bannière", async () => {
    await staff()
      .put(ADMIN)
      .send(homeBody(0, { x: 0.25, y: 0.75 }, { x: 0, y: 1 }))
      .expect(204);

    const page = await home();

    expect(bannerFocal(page)).toEqual({ x: 0.25, y: 0.75 });
    expect(page.pickupDoorImage?.focal).toEqual({ x: 0, y: 1 });
  });

  it("absent, il se lit `null` : la boutique recadre au centre", async () => {
    const body = homeBody(0, null, null);
    const withoutFocal: StorefrontPayloadInput = {
      ...body,
      pages: [
        { shelfKey: "all", rows: 4 },
        { shelfKey: "home", rows: 3, pickupDoorImage: { url: DOOR_IMAGE, alt: null } },
      ],
    };
    await staff().put(ADMIN).send(withoutFocal).expect(204);

    expect((await home()).pickupDoorImage?.focal).toBeNull();
  });

  it("refuse un point hors de l'image (400), sans rien écrire", async () => {
    await staff()
      .put(ADMIN)
      .send(homeBody(0, { x: 1.5, y: 0.5 }, null))
      .expect(400);

    expect((await home()).objects).toEqual([]);
  });

  it("le CHECK refuse une coordonnée seule écrite à la main", async () => {
    await staff()
      .put(ADMIN)
      .send(homeBody(0, null, null))
      .expect(204);

    await expect(
      ctx.prisma.$executeRawUnsafe(
        `UPDATE "public"."storefront_page" SET "pickup_door_focal_x" = 0.5 WHERE "shelf_key" = 'home'`,
      ),
    ).rejects.toThrow(/storefront_page_pickup_door_focal_check/);
  });
});

describe("le point focal suit quand la médiathèque redécrit l'image", () => {
  it("recadre bannière et porte sans réenregistrer, et refuse l'éditeur ouvert avant (409)", async () => {
    await staff()
      .put(ADMIN)
      .send(homeBody(0, null, null))
      .expect(204);

    for (const url of [BANNER_IMAGE, DOOR_IMAGE]) {
      await staff()
        .put(MEDIA)
        .send({ url, name: "vitrine", tags: [], focal: { x: 0.2, y: 0.7 } })
        .expect(200);
      await settle();
    }

    const page = await home();
    expect(bannerFocal(page)).toEqual({ x: 0.2, y: 0.7 });
    expect(page.pickupDoorImage?.focal).toEqual({ x: 0.2, y: 0.7 });
    // L'éditeur ouvert sur la révision 1 aurait réécrit l'ancien point.
    await staff()
      .put(ADMIN)
      .send(homeBody(1, null, null))
      .expect(409);
  });

  it("ne touche pas la vitrine quand l'image redécrite n'y paraît pas", async () => {
    await staff()
      .put(ADMIN)
      .send(homeBody(0, null, null))
      .expect(204);
    const elsewhere = await deposit("ailleurs.png", 640, 480);

    await staff()
      .put(MEDIA)
      .send({ url: elsewhere, name: "ailleurs", tags: [], focal: { x: 0.9, y: 0.9 } })
      .expect(200);
    await settle();

    await staff()
      .put(ADMIN)
      .send(homeBody(1, null, null))
      .expect(204);
  });
});
