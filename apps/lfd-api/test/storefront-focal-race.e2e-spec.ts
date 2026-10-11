/**
 * E2E — **deux recadrages de la vitrine qui se disputent la révision** (cf.
 * `documentation/mediatheque/mediatheque.md` §7 bis, 2026-10-11).
 *
 * La médiathèque redécrit deux fois la même image ; chaque description écrit
 * un fait durable, et deux relais peuvent livrer les deux recadrages en même
 * temps. Tous deux chargent la vitrine à la même révision : le verrou n'en
 * laisse passer qu'un, l'autre échoue — et c'est la livraison REJOUÉE qui doit
 * finir sur le dernier point, parce que l'abonné relit le point d'aujourd'hui
 * à la médiathèque au lieu de celui du geste.
 *
 * Le croisement est rendu certain, pas espéré : le réveil du relais est coupé
 * (chaque livraison part d'un `sweep()` explicite), et une transaction de test
 * tient la ligne `storefront` jusqu'à ce que les DEUX livraisons attendent son
 * verrou. Sans elle, la première finirait souvent avant que la seconde charge,
 * et le test passerait sans avoir rien éprouvé.
 */
import type { PublicStorefrontPageView, StorefrontPayloadInput } from "@lfd/contracts";

import { REFOCUS_STOREFRONT_IMAGES } from "../src/appBootstrap/storefront-media-focus.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { OutboxRelay } from "../src/platform/outbox/outbox-relay.js";
import { OutboxRelayTrigger } from "../src/platform/outbox/outbox-relay-trigger.js";
import { bootstrapE2e, daysAgo, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

/** Le réveil coupé : rien ne part tant que le test ne balaie pas lui-même. */
const silentTrigger = { wake: (): void => undefined };

const MEDIA = "/media";
const ADMIN = "/admin/storefront";
const FIRST = { x: 0.1, y: 0.2 };
const LAST = { x: 0.9, y: 0.8 };
/** Combien de fois sonder les attentes de verrou avant d'abandonner (×50 ms). */
const WAIT_ROUNDS = 200;
const WAIT_STEP_MS = 50;

let ctx: E2eContext;
let relay: OutboxRelay;
let image = "";

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: OutboxRelayTrigger, value: silentTrigger },
    ],
  });
  relay = ctx.app.get(OutboxRelay);
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  image = await deposit();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

/** Un PNG minimal et valide — signature, largeur, hauteur. */
async function deposit(): Promise<string> {
  const png = Buffer.alloc(24);
  png.writeUInt32BE(0x89504e47, 0);
  png.writeUInt32BE(0x0d0a1a0a, 4);
  png.writeUInt32BE(2100, 16);
  png.writeUInt32BE(900, 20);
  const response = await staff().post(MEDIA).attach("file", png, "banniere.png");
  expect(response.status).toBe(201);
  return jsonBody<{ url: string }>(response).url;
}

/** L'accueil : une bannière qui montre l'image, sans point. */
function homeBody(): StorefrontPayloadInput {
  return {
    revision: 0,
    pages: [
      { shelfKey: "all", rows: 4 },
      { shelfKey: "home", rows: 3 },
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
            image: { url: image, alt: null, focal: null },
            linkShelfKey: null,
            operationKey: null,
          },
        ],
      },
    ],
    templates: [],
  };
}

async function describeImage(focal: { readonly x: number; readonly y: number }): Promise<void> {
  await staff().put(MEDIA).send({ url: image, name: "vitrine", tags: [], focal }).expect(200);
}

async function bannerFocal(): Promise<unknown> {
  const page = jsonBody<PublicStorefrontPageView>(
    await ctx.http().get("/shop/storefront/home").expect(200),
  );
  const [content] = page.objects[0]?.contents ?? [];
  return content?.kind === "info" ? content.image?.focal : undefined;
}

/** Combien de connexions de la base attendent un verrou en ce moment. */
async function lockWaiters(): Promise<number> {
  const [row] = await ctx.prisma.$queryRaw<{ readonly n: number }[]>`
    SELECT count(*)::int AS n FROM pg_stat_activity
    WHERE datname = current_database() AND wait_event_type = 'Lock'`;
  return row?.n ?? 0;
}

async function untilLockWaiters(expected: number): Promise<void> {
  for (let round = 0; round < WAIT_ROUNDS; round += 1) {
    if ((await lockWaiters()) >= expected) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS));
  }
  throw new TypeError(`${String(expected)} attente(s) de verrou jamais observée(s)`);
}

/**
 * Tient la ligne de la vitrine pendant que `race` lance ses livraisons, et ne
 * la rend qu'une fois `waiters` d'entre elles bloquées sur elle.
 */
async function holdingStorefront<T>(waiters: number, race: () => Promise<T>): Promise<T> {
  let release = (): void => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let locked = (): void => undefined;
  const isLocked = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const holder = ctx.prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "public"."storefront" FOR UPDATE`;
      locked();
      await released;
    },
    { timeout: WAIT_ROUNDS * WAIT_STEP_MS * 2 },
  );
  await isLocked;
  const racing = race();
  await untilLockWaiters(waiters);
  release();
  await holder;
  return racing;
}

/** Les livraisons du recadrage qui n'ont pas abouti. */
async function pendingRefocus(): Promise<number> {
  return ctx.prisma.outboxDelivery.count({
    where: { subscriber: REFOCUS_STOREFRONT_IMAGES, deliveredAt: null },
  });
}

describe("deux recadrages quasi simultanés de la même image", () => {
  it("le perdant échoue au verrou, et sa livraison rejouée finit sur le dernier point", async () => {
    await staff().put(ADMIN).send(homeBody()).expect(204);
    await relay.sweep();

    const reports = await holdingStorefront(2, async () => {
      // Premier relais : il ne voit que la première description, lit FIRST
      // à la médiathèque, puis attend le verrou.
      await describeImage(FIRST);
      const first = relay.sweep();
      await untilLockWaiters(1);
      // Second relais : la seconde description, lue LAST, bloquée elle aussi.
      await describeImage(LAST);
      const second = relay.sweep();
      return Promise.all([first, second]);
    });

    // Un seul a passé le verrou ; l'autre a échoué sur la révision montée.
    expect(reports.map((report) => report.failed).sort()).toEqual([0, 1]);
    expect(await pendingRefocus()).toBe(1);

    // Le délai de relance, avancé : la livraison rejouée relit le point
    // d'aujourd'hui, quel qu'ait été le perdant.
    await ctx.prisma.outboxDelivery.updateMany({
      where: { subscriber: REFOCUS_STOREFRONT_IMAGES, deliveredAt: null },
      data: { nextAttemptAt: daysAgo(1) },
    });
    await relay.sweep();

    expect(await pendingRefocus()).toBe(0);
    expect(await bannerFocal()).toEqual(LAST);
  });
});
