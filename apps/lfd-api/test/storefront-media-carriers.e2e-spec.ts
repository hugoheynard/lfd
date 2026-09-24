/**
 * E2E — **la vitrine, porteur de la médiathèque** (plan
 * `documentation/order/plan-vitrine-enregistrement.md`, D9).
 *
 * 🔴 Ce que seul ce niveau prouve : que le fil est BRANCHÉ. Le composite et
 * l'adaptateur sont éprouvés unitairement ; mais un `MediaCarriers` resté lié
 * au seul référentiel passerait tous ces tests-là, et la route de la
 * médiathèque supprimerait en production une image que la vitrine affiche.
 */
import type { StorefrontPayloadInput } from "@lfd/contracts";

import { StorefrontMediaUsage } from "../src/b2b/storefront/channels/media/storefront-media-usage.js";
import { PrismaStorefrontMediaUsage } from "../src/b2b/storefront/infrastructure/prisma-storefront-media-usage.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { PrismaService } from "../src/platform/database/prisma.service.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

/**
 * Le VRAI adaptateur de la vitrine, qu'on peut faire tomber en panne.
 *
 * ⚠️ Un doublé d'un provider interne, ce que le harnais déconseille — mais il
 * DÉLÈGUE au vrai : le SQL passe toujours, seule la panne est simulée. C'est
 * le seul moyen d'éprouver de bout en bout qu'un porteur muet arrête la
 * suppression, sans couper la base pour toute l'application.
 */
class BreakableUsage extends StorefrontMediaUsage {
  inner: StorefrontMediaUsage | null = null;
  broken = false;

  usesOf(urls: readonly string[]): ReturnType<StorefrontMediaUsage["usesOf"]> {
    return this.live().usesOf(urls);
  }

  usagesOf(url: string): ReturnType<StorefrontMediaUsage["usagesOf"]> {
    return this.live().usagesOf(url);
  }

  private live(): StorefrontMediaUsage {
    if (this.broken || this.inner === null) {
      throw new Error("vitrine injoignable (panne simulée)");
    }
    return this.inner;
  }
}

const usage = new BreakableUsage();
const MEDIA = "/media";
const STOREFRONT = "/admin/storefront";

let ctx: E2eContext;
let IMAGE = "";

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: StorefrontMediaUsage, value: usage },
    ],
  });
  usage.inner = new PrismaStorefrontMediaUsage(ctx.app.get(PrismaService));
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  usage.broken = false;
  await ctx.reset();
  IMAGE = await deposit();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

/** Un PNG minimal et valide — signature, largeur, hauteur. */
async function deposit(): Promise<string> {
  const png = Buffer.alloc(24);
  png.writeUInt32BE(0x89504e47, 0);
  png.writeUInt32BE(0x0d0a1a0a, 4);
  png.writeUInt32BE(640, 16);
  png.writeUInt32BE(480, 20);
  const response = await staff().post(MEDIA).attach("file", png, "noel.png");
  expect(response.status).toBe(201);
  return jsonBody<{ url: string }>(response).url;
}

type ObjectInput = StorefrontPayloadInput["objects"][number];

/** Une tuile qui montre l'image dans une info. */
function tileShowing(url: string): ObjectInput {
  return {
    shape: "card",
    applyOnMobile: true,
    mediaFit: "cover",
    mediaSide: "top",
    multiple: false,
    carousel: { nav: "dots", autoplay: false, intervalSeconds: 5, firstSeconds: 8, sampleCount: 3 },
    column: 1,
    row: 1,
    shelves: ["all"],
    contents: [
      {
        kind: "info",
        badge: null,
        title: { fr: "Tuile Noël" },
        lede: null,
        image: { url, alt: null },
        linkShelfKey: null,
      },
    ],
  };
}

async function saveStorefront(revision: number, objects: readonly ObjectInput[]): Promise<void> {
  const body: StorefrontPayloadInput = {
    revision,
    pages: [{ shelfKey: "all", rows: 4 }],
    objects: [...objects],
    templates: [],
  };
  await staff().put(STOREFRONT).send(body).expect(204);
}

async function discard(url: string): Promise<number> {
  return (await staff().delete(`${MEDIA}?url=${encodeURIComponent(url)}`)).status;
}

async function inLibrary(url: string): Promise<boolean> {
  const response = await staff().get(MEDIA).expect(200);
  return jsonBody<{ items: readonly { url: string }[] }>(response).items.some(
    (item) => item.url === url,
  );
}

describe("la vitrine, porteur de la médiathèque", () => {
  it("REFUSE de retirer une image qu'un objet de vitrine affiche", async () => {
    await saveStorefront(0, [tileShowing(IMAGE)]);

    expect(await discard(IMAGE)).toBe(409);
    expect(await inLibrary(IMAGE)).toBe(true);
  });

  it("nomme l'objet de vitrine parmi les porteurs", async () => {
    await saveStorefront(0, [tileShowing(IMAGE)]);
    const objectId = (
      await ctx.prisma.storefrontObject.findFirstOrThrow({ where: { archivedAt: null } })
    ).id;

    const response = await staff().get(`${MEDIA}/carriers`).query({ url: IMAGE }).expect(200);

    expect(jsonBody<unknown>(response)).toEqual([
      { kind: "storefront", id: objectId, label: "Tuile Noël" },
    ]);
  });

  it("retire l'image une fois l'objet ARCHIVÉ", async () => {
    await saveStorefront(0, [tileShowing(IMAGE)]);
    // Un objet absent du payload est archivé (D6) : il n'affiche plus rien.
    await saveStorefront(1, []);

    expect(await discard(IMAGE)).toBe(204);
    expect(await inLibrary(IMAGE)).toBe(false);
  });

  /**
   * 🔴 Le silence d'un porteur ne vaut pas « zéro emploi ». Si le composite
   * avalait la panne de la vitrine, le référentiel seul répondrait « personne »
   * et l'image partirait.
   */
  it("ne retire RIEN quand la vitrine ne répond pas", async () => {
    usage.broken = true;

    expect(await discard(IMAGE)).toBe(500);

    usage.broken = false;
    expect(await inLibrary(IMAGE)).toBe(true);
  });
});
