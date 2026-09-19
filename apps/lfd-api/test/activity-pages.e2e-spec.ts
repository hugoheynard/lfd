/**
 * E2E des **pages numérotées** du journal d'activité (`GET /admin/activity?page=`).
 *
 * Ajoutées le 2026-09-19 à côté du curseur, pour un paginateur qui saute à une
 * page et annonce un total. Seul le vrai Postgres prouve ce qui compte : que le
 * `total` compte le même `WHERE` que les pages — filtres et recherche compris —,
 * que l'ancre `asOf` fige l'instantané contre un fait écrit pendant la lecture,
 * et que le curseur du front en ligne marche encore.
 *
 * Les faits s'écrivent par l'adaptateur réel (`ActivityRecorder`) : leur `id`
 * est un vrai ULID, et c'est sur lui que l'ordre et l'ancre reposent.
 */
import type { ActivityEventView, ActivityPageView } from "@lfd/contracts";

import { ActivityRecorder } from "../src/b2b/growth/domain/ports/activity-recorder.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

let ctx: E2eContext;

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
});

const operator = (): ReturnType<E2eContext["asSub"]> => ctx.asSub("staff-e2e");

/**
 * Deux types témoins, pris au catalogue des faits : le journal est strict sous
 * le harnais, et un type inventé y serait refusé. Chacun porte le nom cherché
 * dans une valeur de sa charge — c'est tout ce que la recherche éprouve.
 */
const WITNESS = "lead.captured";
const OTHER = "legal_entity.corrected";

/** Le filtre éprouvé partout : un type ET une recherche, pour que les deux comptent. */
const FILTERS = { type: WITNESS, q: "martin" };

let written = 0;
async function fact(type: typeof WITNESS | typeof OTHER, name: string): Promise<void> {
  written += 1;
  await ctx.app.get(ActivityRecorder).record({
    type,
    subjectType: type === WITNESS ? "lead" : "legal_entity",
    subjectId: `subject_${String(written)}`,
    idempotencyKey: `${type}:${String(written)}`,
    payload:
      type === WITNESS
        ? { businessName: `Boulangerie ${name}`, email: "" }
        : { name: `Boulangerie ${name}` },
  });
}

/**
 * Douze faits qui répondent aux filtres, noyés parmi d'autres : même type sans
 * le nom cherché, ou le nom cherché sous un autre type.
 */
async function seedJournal(): Promise<void> {
  for (let index = 0; index < 12; index += 1) {
    await fact(WITNESS, "Martin");
    await fact(WITNESS, "Durand");
    await fact(OTHER, "Martin");
  }
  await ctx.drain();
}

const MATCHING = 12;

async function read(query: Record<string, string>): Promise<ActivityPageView> {
  return jsonBody<ActivityPageView>(
    await operator().get("/admin/activity").query(query).expect(200),
  );
}

const idsOf = (events: readonly ActivityEventView[]): string[] => events.map((event) => event.id);

describe("les pages numérotées du journal", () => {
  it("se suivent sans doublon ni trou, et annoncent le total des filtres", async () => {
    await seedJournal();
    const all = idsOf((await read({ ...FILTERS, limit: "200" })).events);

    const first = await read({ ...FILTERS, limit: "5", page: "1" });
    const asOf = first.asOf ?? "";
    const rest = [
      await read({ ...FILTERS, limit: "5", page: "2", asOf }),
      await read({ ...FILTERS, limit: "5", page: "3", asOf }),
    ];
    const pages = [first, ...rest];

    expect(all).toHaveLength(MATCHING);
    expect(pages.flatMap((page) => idsOf(page.events))).toEqual(all);
    expect(pages.map((page) => page.total)).toEqual([MATCHING, MATCHING, MATCHING]);
    expect(pages.map((page) => page.page)).toEqual([1, 2, 3]);
    expect(pages.map((page) => page.events.length)).toEqual([5, 5, 2]);
    // L'ancre est le fait le plus récent QUI RÉPOND AUX FILTRES.
    expect(first.asOf).toBe(all[0]);
  });

  it("n'ajoute pas en page 2 un fait écrit après la page 1, et garde le total", async () => {
    await seedJournal();
    const before = idsOf((await read({ ...FILTERS, limit: "200" })).events);
    const first = await read({ ...FILTERS, limit: "5", page: "1" });
    await fact(WITNESS, "Martin");
    await ctx.drain();

    const anchored = await read({ ...FILTERS, limit: "5", page: "2", asOf: first.asOf ?? "" });
    const fresh = await read({ ...FILTERS, limit: "5", page: "1" });

    expect(anchored.total).toBe(MATCHING);
    expect(anchored.asOf).toBe(first.asOf);
    // Sans l'ancre, le fait neuf aurait poussé le dernier de la page 1 en tête
    // de la page 2 : elle rend exactement la tranche d'avant l'écriture.
    expect(idsOf(anchored.events)).toEqual(before.slice(5, 10));
    // Le témoin : sans l'ancre, le fait neuf est bien là, et le total a bougé.
    expect(fresh.total).toBe(MATCHING + 1);
    expect(idsOf(anchored.events)).not.toContain(fresh.asOf);
  });

  it("rend une page vide au-delà du total, et le total juste", async () => {
    await seedJournal();

    const beyond = await read({ ...FILTERS, limit: "5", page: "9" });

    expect(beyond).toMatchObject({ events: [], total: MATCHING, page: 9, nextBefore: null });
  });

  it("rend une ancre nulle et un total nul quand rien ne répond", async () => {
    await seedJournal();

    const none = await read({ type: WITNESS, q: "personne", page: "1" });

    expect(none).toEqual({ events: [], nextBefore: null, total: 0, page: 1, asOf: null });
  });

  it("refuse `page` et `before` ensemble", async () => {
    const response = await operator()
      .get("/admin/activity")
      .query({ page: "2", before: "01K00000000000000000000000" });

    expect(response.status).toBe(400);
  });
});

describe("le curseur, que lit le front en ligne", () => {
  it("parcourt encore le flux filtré, et porte désormais le total", async () => {
    await seedJournal();
    const all = idsOf((await read({ ...FILTERS, limit: "200" })).events);

    const walked: string[] = [];
    const numbers: (number | null)[] = [];
    let before: string | null = null;
    do {
      const page = await read({ ...FILTERS, limit: "5", ...(before === null ? {} : { before }) });
      expect(page.total).toBe(MATCHING);
      walked.push(...idsOf(page.events));
      numbers.push(page.page);
      before = page.nextBefore;
    } while (before !== null);

    expect(walked).toEqual(all);
    // Lue par curseur, une page n'a pas de numéro — sauf la première.
    expect(numbers).toEqual([1, null, null]);
  });
});
