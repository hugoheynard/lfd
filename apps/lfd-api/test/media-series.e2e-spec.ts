/**
 * E2E des **séries de la médiathèque** — ouvrir, corriger, lister, déposer
 * dans une série, rattacher et détacher, filtrer, trier (plan L3, 2026-10-10).
 *
 * Ce que seul ce niveau prouve : la clé étrangère et la colonne `date` réelles,
 * le compte d'images en base, le multipart du dépôt, le redépôt qui tombe sur
 * l'URL unique (D2), et qu'une série inconnue ne laisse RIEN — ni objet au
 * bucket, ni ligne en base.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { MediaStore } from "../src/platform/storage/media-store.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { InMemoryMediaStore } from "./in-memory-media-store.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token === "staff-e2e" ? E2E_STAFF_SUB : token, scopes: [] }),
};

const MEDIA = "/media";
const SERIES = "/media/series";

interface SeriesView {
  readonly id: string;
  readonly title: string;
  readonly shotOn: string | null;
  readonly note: string | null;
  readonly images: number;
  readonly createdAt: string;
}

interface UploadView {
  readonly url: string;
  readonly seriesId: string | null;
  readonly alreadyInLibrary: boolean;
}

interface PageView {
  readonly items: readonly {
    readonly url: string;
    readonly series: { id: string; title: string; shotOn: string | null } | null;
  }[];
  readonly total: number;
  readonly next: string | null;
}

let ctx: E2eContext;
const store = new InMemoryMediaStore();

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: MediaStore, value: store },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = (): ReturnType<E2eContext["http"]> =>
  ctx.http().set("Authorization", "Bearer staff-e2e");

/** Un PNG minimal et valide ; deux tailles distinctes font deux images. */
function png(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(0x0d0a1a0a, 4);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

/** Une charge JSON lue comme un objet — `{}` si elle n'en est pas un. */
function jsonRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

/** Un jour de prise de vue PASSÉ, relatif à aujourd'hui — jamais une date en dur. */
const dayAgo = (days: number): string => daysAgo(days).slice(0, 10);

async function openSeries(title: string, shotOn: string | null = null): Promise<string> {
  const response = await staff().post(SERIES).send({ title, shotOn, note: null });
  expect(response.status).toBe(201);
  return jsonBody<{ id: string }>(response).id;
}

async function deposit(width: number, seriesId?: string): Promise<UploadView> {
  const request = staff().post(MEDIA);
  if (seriesId !== undefined) {
    void request.field("seriesId", seriesId);
  }
  const response = await request.attach("file", png(width, 600), "image.png");
  expect(response.status).toBe(201);
  return jsonBody<UploadView>(response);
}

async function seriesList(): Promise<readonly SeriesView[]> {
  const response = await staff().get(SERIES);
  expect(response.status).toBe(200);
  return jsonBody<readonly SeriesView[]>(response);
}

async function seriesOf(url: string): Promise<string | null> {
  return (await ctx.prisma.mediaAsset.findUniqueOrThrow({ where: { url } })).seriesId;
}

async function facts(type: string) {
  return ctx.prisma.activityEvent.findMany({
    where: { type },
    select: { subjectType: true, subjectId: true, payload: true },
    orderBy: { occurredAt: "asc" },
  });
}

describe("POST /media/series et PUT /media/series/:id", () => {
  it("ouvre une série, rend son id, et trace son ouverture", async () => {
    const shotOn = dayAgo(3);
    const response = await staff()
      .post(SERIES)
      .send({ title: "  Atelier  ", shotOn, note: "four à bois" });

    expect(response.status).toBe(201);
    const { id } = jsonBody<{ id: string }>(response);
    expect(Object.keys(jsonBody<object>(response))).toEqual(["id"]);
    expect(await seriesList()).toMatchObject([
      { id, title: "Atelier", shotOn, note: "four à bois", images: 0 },
    ]);
    expect(await facts("media_series.created")).toEqual([
      {
        subjectType: "media_series",
        subjectId: id,
        payload: { subjectLabel: "Atelier", title: "Atelier", shotOn, note: "four à bois" },
      },
    ]);
  });

  it("refuse un titre vide et une prise de vue à venir (400)", async () => {
    const empty = await staff().post(SERIES).send({ title: "  ", shotOn: null, note: null });
    const future = await staff()
      .post(SERIES)
      .send({ title: "Plus tard", shotOn: serviceDay(), note: null });

    expect(empty.status).toBe(400);
    expect(future.status).toBe(400);
    expect(await seriesList()).toEqual([]);
  });

  it("corrige titre, jour et note, et trace le diff", async () => {
    const id = await openSeries("Été");
    const shotOn = dayAgo(10);

    const response = await staff()
      .put(`${SERIES}/${id}`)
      .send({ title: "Été au fournil", shotOn, note: null });

    expect(response.status).toBe(204);
    expect(await seriesList()).toMatchObject([{ id, title: "Été au fournil", shotOn }]);
    const [fact] = await facts("media_series.described");
    expect(fact?.payload).toEqual({
      subjectLabel: "Été au fournil",
      changes: { title: { from: "Été", to: "Été au fournil" }, shotOn: { from: null, to: shotOn } },
    });
  });

  it("rend 404 sur une série inconnue", async () => {
    const response = await staff()
      .put(`${SERIES}/inconnue`)
      .send({ title: "x", shotOn: null, note: null });

    expect(response.status).toBe(404);
  });
});

describe("GET /media/series", () => {
  it("trie par prise de vue décroissante, sans date en dernier, et compte les images", async () => {
    const undated = await openSeries("Sans date");
    const older = await openSeries("Ancienne", dayAgo(30));
    const recent = await openSeries("Récente", dayAgo(2));
    await deposit(1001, recent);
    await deposit(1002, recent);
    await deposit(1003, older);

    const list = await seriesList();

    expect(list.map((series) => [series.id, series.images])).toEqual([
      [recent, 2],
      [older, 1],
      [undated, 0],
    ]);
  });
});

describe("POST /media dans une série", () => {
  it("range l'image neuve dans la série, et le fait de dépôt la nomme", async () => {
    const id = await openSeries("Été");

    const uploaded = await deposit(1001, id);

    expect(uploaded).toMatchObject({ seriesId: id, alreadyInLibrary: false });
    expect(await seriesOf(uploaded.url)).toBe(id);
    const [fact] = await facts("media_asset.deposited");
    expect(fact?.payload).toMatchObject({ series: { id, name: "Été" } });
  });

  it("un redépôt dans une AUTRE série garde la série d'origine, et le dit (D2)", async () => {
    const spring = await openSeries("Printemps");
    const summer = await openSeries("Été");
    const first = await deposit(1001, spring);

    const again = await deposit(1001, summer);

    expect(again).toMatchObject({ url: first.url, seriesId: spring, alreadyInLibrary: true });
    expect(await seriesOf(first.url)).toBe(spring);
    expect(await facts("media_asset.deposited")).toHaveLength(1);
  });

  it("une série inconnue rend 404, et RIEN n'est stocké — ni bucket, ni base", async () => {
    const before = store.keys().length;

    const response = await staff()
      .post(MEDIA)
      .field("seriesId", "inconnue")
      .attach("file", png(1777, 600), "image.png");

    expect(response.status).toBe(404);
    expect(store.keys()).toHaveLength(before);
    expect(await ctx.prisma.mediaAsset.count()).toBe(0);
  });

  it("sans série, l'image n'en a pas (D3)", async () => {
    const uploaded = await deposit(1001);

    expect(uploaded).toMatchObject({ seriesId: null, alreadyInLibrary: false });
  });
});

describe("PUT /media — rattacher, détacher", () => {
  const details = (url: string, extra: object = {}) => ({
    url,
    name: "Croissant",
    tags: ["beurre"],
    focal: null,
    ...extra,
  });

  it("rattache, détache, et un champ ABSENT ne change rien", async () => {
    const id = await openSeries("Été");
    const { url } = await deposit(1001);

    expect(
      (
        await staff()
          .put(MEDIA)
          .send(details(url, { seriesId: id }))
      ).status,
    ).toBe(200);
    expect(await seriesOf(url)).toBe(id);

    // Le panneau renvoie tous ses champs, et un écran qui ignore les séries
    // ne doit pas détacher l'image en enregistrant son étiquette.
    expect(
      (
        await staff()
          .put(MEDIA)
          .send(details(url, { name: "Pain" }))
      ).status,
    ).toBe(200);
    expect(await seriesOf(url)).toBe(id);

    expect(
      (
        await staff()
          .put(MEDIA)
          .send(details(url, { name: "Pain", seriesId: null }))
      ).status,
    ).toBe(200);
    expect(await seriesOf(url)).toBeNull();

    const described = await facts("media_asset.described");
    const changes = described.map((fact) => jsonRecord(fact.payload)["changes"]);
    expect(jsonRecord(changes[0])["series"]).toEqual({ from: null, to: { id, name: "Été" } });
    expect(changes[1]).toEqual({ name: { from: "Croissant", to: "Pain" } });
    expect(changes[2]).toEqual({ series: { from: { id, name: "Été" }, to: null } });
  });

  it("refuse une série inconnue (404) sans toucher l'image", async () => {
    const { url } = await deposit(1001);

    const response = await staff()
      .put(MEDIA)
      .send(details(url, { seriesId: "inconnue" }));

    expect(response.status).toBe(404);
    expect(await seriesOf(url)).toBeNull();
  });
});

describe("GET /media — le fil par série", () => {
  it("filtre par série", async () => {
    const id = await openSeries("Été");
    const inside = await deposit(1001, id);
    await deposit(1002);

    const response = await staff().get(MEDIA).query({ series: id });

    expect(response.status).toBe(200);
    const page = jsonBody<PageView>(response);
    expect(page.total).toBe(1);
    expect(page.items).toEqual([
      expect.objectContaining({ url: inside.url, series: { id, title: "Été", shotOn: null } }),
    ]);
  });

  it("trie par prise de vue, sans date en dernier, et se lit par curseur", async () => {
    const older = await openSeries("Ancienne", dayAgo(30));
    const recent = await openSeries("Récente", dayAgo(2));
    const undated = await openSeries("Sans date");
    const a = await deposit(1001, older);
    const b = await deposit(1002, recent);
    const c = await deposit(1003, undated);
    const d = await deposit(1004);

    const urls: string[] = [];
    let after: string | null = null;
    do {
      const response = await staff()
        .get(MEDIA)
        .query({ sort: "shot", limit: 1, ...(after === null ? {} : { after }) });
      expect(response.status).toBe(200);
      const page: PageView = jsonBody<PageView>(response);
      urls.push(...page.items.map((item) => item.url));
      after = page.next;
    } while (after !== null);

    const undatedTail = [c.url, d.url].sort();
    expect(urls).toEqual([b.url, a.url, ...undatedTail]);
  });
});

describe("le mur des séries", () => {
  const SALES = "staff-commercial";

  beforeEach(async () => {
    await ctx.prisma.staffUser.create({
      data: {
        id: "fiche-commercial",
        firstName: "Fiche",
        lastName: "commercial",
        email: "commercial@lfc.test",
        role: "commercial",
        status: "active",
        auth0Id: SALES,
      },
    });
  });

  const sales = (): ReturnType<E2eContext["http"]> =>
    ctx.http().set("Authorization", `Bearer ${SALES}`);

  it("refuse la lecture et l'écriture à un rôle sans le droit", async () => {
    const id = await openSeries("Été");

    expect((await sales().get(SERIES)).status).toBe(403);
    expect((await sales().post(SERIES).send({ title: "x", shotOn: null, note: null })).status).toBe(
      403,
    );
    expect(
      (await sales().put(`${SERIES}/${id}`).send({ title: "x", shotOn: null, note: null })).status,
    ).toBe(403);
  });

  it("refuse un anonyme", async () => {
    expect((await ctx.http().get(SERIES)).status).toBe(401);
    expect(
      (await ctx.http().post(SERIES).send({ title: "x", shotOn: null, note: null })).status,
    ).toBe(401);
  });
});
