/**
 * E2E de la **frise des couleurs** — `GET /media/palette-strip` (plan L9,
 * 2026-10-11).
 *
 * Ce que seul ce niveau prouve : que le filtre du feed s'applique au vrai
 * Postgres, que les colonnes sont des quantiles par rang dans l'ordre du dépôt,
 * que `columns` est borné au bord, et que le mur `media_library` tient.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { MediaStore } from "../src/platform/storage/media-store.js";
import { bootstrapE2e, daysAgo, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { InMemoryMediaStore } from "./in-memory-media-store.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token === "staff-e2e" ? E2E_STAFF_SUB : token, scopes: [] }),
};

const MEDIA = "/media";
const STRIP = "/media/palette-strip";
const SALES = "staff-commercial";
const RED = JSON.stringify([{ hex: "#ff0000", share: 1, outlier: false }]);
const BLUE = JSON.stringify([{ hex: "#0000ff", share: 1, outlier: false }]);

interface StripView {
  readonly columns: readonly {
    readonly from: string;
    readonly to: string;
    readonly count: number;
    readonly palette: readonly { readonly hex: string; readonly share: number }[];
    readonly sampleUrl: string;
  }[];
  readonly total: number;
  readonly unpainted: number;
}

let ctx: E2eContext;
let width = 2000;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: MediaStore, value: new InMemoryMediaStore() },
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

/** Des octets distincts à chaque appel : une image = un contenu = une URL. */
function png(): Buffer {
  width += 1;
  const buffer = Buffer.alloc(24);
  buffer.writeUInt32BE(0x89504e47, 0);
  buffer.writeUInt32BE(0x0d0a1a0a, 4);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(600, 20);
  return buffer;
}

async function deposit(palette?: string, tags?: readonly string[]): Promise<string> {
  const request = staff().post(MEDIA).attach("file", png(), "image.png");
  const response = await (palette === undefined ? request : request.field("palette", palette));
  expect(response.status).toBe(201);
  const { url } = jsonBody<{ url: string }>(response);
  if (tags !== undefined) {
    await staff().put(MEDIA).send({ url, name: "", tags, focal: null }).expect(200);
  }
  return url;
}

async function strip(query: Record<string, string | number>): Promise<StripView> {
  return jsonBody<StripView>(await staff().get(STRIP).query(query).expect(200));
}

const dayAgo = (days: number): string => daysAgo(days).slice(0, 10);

async function feedUrls(query: Record<string, string>): Promise<readonly string[]> {
  const page = jsonBody<{ items: readonly { url: string }[] }>(
    await staff().get(MEDIA).query(query).expect(200),
  );
  return page.items.map((item) => item.url);
}

describe("GET /media/palette-strip", () => {
  it("découpe le fonds en quantiles par rang, du dépôt le plus ancien au plus récent", async () => {
    const urls: string[] = [];
    for (let rank = 0; rank < 5; rank += 1) {
      urls.push(await deposit(rank < 2 ? RED : rank === 4 ? BLUE : undefined));
    }

    const view = await strip({ columns: 2 });

    expect(view.total).toBe(5);
    expect(view.unpainted).toBe(2);
    expect(view.columns.map((column) => column.count)).toEqual([2, 3]);
    expect(view.columns[0]).toMatchObject({ sampleUrl: urls[0], palette: [{ hex: "#ff0000" }] });
    expect(view.columns[1]).toMatchObject({ sampleUrl: urls[4], palette: [{ hex: "#0000ff" }] });
    expect(view.columns[0]?.from.localeCompare(view.columns[1]?.from ?? "")).toBeLessThan(0);
  });

  it("rend une colonne par image sous la borne, et une palette vide sans image peinte", async () => {
    const url = await deposit();
    const view = await strip({});
    expect(view.columns).toEqual([
      expect.objectContaining({ count: 1, palette: [], sampleUrl: url }),
    ]);
  });

  it("applique les filtres du feed", async () => {
    await deposit(RED, ["levain"]);
    await deposit(BLUE, ["seigle"]);
    await deposit(undefined, ["levain"]);

    const view = await strip({ tags: "levain" });
    expect(view.total).toBe(2);
    expect(view.unpainted).toBe(1);

    const untagged = await strip({ untagged: 1 });
    expect(untagged.total).toBe(0);
    expect(untagged.columns).toEqual([]);
  });

  it("filtre le feed ET la frise par prise de vue — série, sinon dépôt (L11)", async () => {
    const shotOn = dayAgo(30);
    const opened = await staff()
      .post("/media/series")
      .send({ title: "Fournil", shotOn, note: null });
    expect(opened.status).toBe(201);
    const seriesId = jsonBody<{ id: string }>(opened).id;
    const shot = jsonBody<{ url: string }>(
      await staff()
        .post(MEDIA)
        .field("seriesId", seriesId)
        .attach("file", png(), "image.png")
        .expect(201),
    ).url;
    const loose = await deposit(RED);

    // Le jour de la série, et lui seul : l'image de la série, déposée aujourd'hui.
    const onShotDay = { shotFrom: shotOn, shotTo: shotOn };
    expect(await feedUrls(onShotDay)).toEqual([shot]);
    expect((await strip(onShotDay)).columns.map((column) => column.sampleUrl)).toEqual([shot]);

    // Autour d'aujourd'hui : l'image sans série, par son dépôt — pas celle de la série.
    const aroundToday = { shotFrom: dayAgo(2), shotTo: dayAgo(-2) };
    expect(await feedUrls(aroundToday)).toEqual([loose]);
    expect((await strip(aroundToday)).total).toBe(1);

    for (const path of [MEDIA, STRIP]) {
      await staff()
        .get(path)
        .query({ shotFrom: dayAgo(1), shotTo: dayAgo(3) })
        .expect(400);
    }
  });

  it("refuse en 400 un nombre de colonnes hors de 1 à 400", async () => {
    for (const columns of ["0", "401", "deux", "1.5"]) {
      await staff().get(STRIP).query({ columns }).expect(400);
    }
    await staff().get(STRIP).query({ columns: 400 }).expect(200);
  });

  it("refuse un rôle sans le droit de la médiathèque, et un anonyme", async () => {
    await ctx.prisma.staffUser.create({
      data: {
        id: "frise-commercial",
        firstName: "Frise",
        lastName: "commercial",
        email: "frise-commercial@lfc.test",
        role: "commercial",
        status: "active",
        auth0Id: SALES,
      },
    });
    await ctx.http().get(STRIP).set("Authorization", `Bearer ${SALES}`).expect(403);
    await ctx.http().get(STRIP).expect(401);
  });
});
