/**
 * E2E du **journal tarifaire paginé** — sur un vrai Postgres.
 *
 * Plan : `documentation/journalisation/plan-journal-d-activite.md`, lot 5, dans
 * sa forme amendée (2026-09-19) : un paginateur à l'écran, donc un numéro de
 * page et un total, plutôt que le curseur `before` du plan.
 *
 * Ce que seul le vrai SQL prouve : que `skip`/`take` et `count` lisent le même
 * sujet, que l'ordre est TOTAL (deux actes à la même milliseconde ne se
 * dupliquent ni ne disparaissent entre deux pages), et que l'ancienne route
 * rend toujours son tableau nu au front en ligne.
 *
 * 🔴 Les actes se sèment en Prisma direct, par `eventRow` — la conversion de
 * PRODUCTION d'un acte du domaine en ligne. Un acte n'a pas d'agrégat : c'est un
 * fait append-only, écrit avec la mutation qu'il raconte. Le produire par HTTP
 * demanderait quarante-cinq gestes, et aucun ne saurait tomber sur la même
 * milliseconde qu'un autre — c'est pourtant le cas à éprouver. Un test passe
 * par la vraie écriture pour tenir le chemin complet.
 *
 * Aucune date du calendrier : chaque instant dérive de `daysAgo`, et le code
 * testé ne compare ces dates qu'entre elles.
 */
import type { PricingJournalEntryView, PricingJournalPageView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import type { PricingAct, PricingSubjectType } from "../src/b2b/pricing/domain/pricing-act.js";
import { eventRow } from "../src/b2b/pricing/infrastructure/pricing-journal.writer.js";
import { bootstrapE2e, daysAgo, E2E_STAFF_ID, jsonBody, type E2eContext } from "./e2e-harness.js";

/** Staff doublé : accepte n'importe quel jeton porteur comme staff synthétique. */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
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

const staff = () => ctx.asSub("staff-e2e");

const RULE_ID = "rule_paginee";
const ACTS_ON_RULE = 45;
const MINUTE_MS = 60_000;

/** Le premier acte de la série ; les suivants s'égrènent minute par minute. */
const SERIES_START = new Date(daysAgo(3)).getTime();

function act(subjectType: PricingSubjectType, subjectId: string, at: Date): PricingAct {
  return {
    subjectType,
    subjectId,
    kind: "paused",
    actor: E2E_STAFF_ID,
    at,
    reason: null,
    summary: `Acte du ${at.toISOString()}`,
  };
}

/** L'id d'un acte : ULID-like, triable, et lisible dans un échec. */
function actId(rank: number): string {
  return `01ACT${String(rank).padStart(21, "0")}`;
}

async function seedActs(
  subjectType: PricingSubjectType,
  subjectId: string,
  instants: readonly Date[],
): Promise<void> {
  await ctx.prisma.pricingEvent.createMany({
    data: instants.map((at, rank) => eventRow(actId(rank), act(subjectType, subjectId, at))),
  });
}

/** `count` actes sur la règle, une minute d'écart : l'acte de rang N est le N-ième plus ancien. */
function minuteSeries(count: number): Date[] {
  return Array.from({ length: count }, (_, rank) => new Date(SERIES_START + rank * MINUTE_MS));
}

const pageOf = (subjectType: string, subjectId: string, query = "") =>
  staff().get(`/admin/pricing/journal/${subjectType}/${subjectId}/pages${query}`);

async function readPage(query: string): Promise<PricingJournalPageView> {
  return jsonBody<PricingJournalPageView>(await pageOf("rule", RULE_ID, query).expect(200));
}

describe("paginer le journal d'une règle", () => {
  it("rend les vingt actes les plus récents en page 1, et le total du sujet", async () => {
    await seedActs("rule", RULE_ID, minuteSeries(ACTS_ON_RULE));

    const first = await readPage("");

    // Sans `asOf`, l'ancre est l'acte le plus récent du sujet, et elle revient.
    expect(first).toMatchObject({
      total: ACTS_ON_RULE,
      page: 1,
      pageSize: 20,
      asOf: actId(ACTS_ON_RULE - 1),
    });
    expect(first.entries.map((entry) => entry.id)).toEqual(
      Array.from({ length: 20 }, (_, index) => actId(ACTS_ON_RULE - 1 - index)),
    );
  });

  it("rend les cinq plus anciens en page 3", async () => {
    await seedActs("rule", RULE_ID, minuteSeries(ACTS_ON_RULE));

    const third = await readPage("?page=3");

    expect(third.total).toBe(ACTS_ON_RULE);
    expect(third.entries.map((entry) => entry.id)).toEqual([4, 3, 2, 1, 0].map(actId));
  });

  it("parcourt tout le sujet sans doublon ni trou, deux actes à la même milliseconde compris", async () => {
    // Les rangs 9 et 10 partagent leur instant, et tombent de part et d'autre
    // de la frontière des pages de 10 : c'est l'`id` qui les départage.
    const instants = minuteSeries(20);
    instants[10] = instants[9] ?? new Date(SERIES_START);
    await seedActs("rule", RULE_ID, instants);

    const pages = [await readPage("?pageSize=10"), await readPage("?page=2&pageSize=10")];
    const read = pages.flatMap((page) => page.entries.map((entry) => entry.id));

    expect(new Set(read).size).toBe(20);
    expect(read.slice(9, 11)).toEqual([actId(10), actId(9)]);
  });

  it("rend une page vide au-delà du total, et le total juste", async () => {
    await seedActs("rule", RULE_ID, minuteSeries(ACTS_ON_RULE));

    const beyond = await readPage("?page=4");

    expect(beyond).toEqual({
      entries: [],
      total: ACTS_ON_RULE,
      page: 4,
      pageSize: 20,
      asOf: actId(ACTS_ON_RULE - 1),
    });
  });

  it("rend une ancre nulle pour un sujet sans acte", async () => {
    expect(await readPage("")).toEqual({
      entries: [],
      total: 0,
      page: 1,
      pageSize: 20,
      asOf: null,
    });
  });

  it("ne compte ni ne rend les actes d'un autre sujet", async () => {
    await seedActs("rule", RULE_ID, minuteSeries(3));
    await ctx.prisma.pricingEvent.create({
      data: eventRow("01AUTRE", act("rule", "rule_voisine", new Date(SERIES_START))),
    });

    const page = await readPage("");

    expect(page.total).toBe(3);
    expect(page.entries.every((entry) => entry.subjectId === RULE_ID)).toBe(true);
  });

  it("refuse une taille de page au-delà de cent", async () => {
    expect((await pageOf("rule", RULE_ID, "?pageSize=101")).status).toBe(400);
  });

  it("refuse une page zéro", async () => {
    expect((await pageOf("rule", RULE_ID, "?page=0")).status).toBe(400);
  });

  it("refuse un sujet inventé, comme l'ancienne route", async () => {
    const response = await pageOf("licorne", "x");

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: "pricing.subject.unknown" });
  });

  it("nomme l'auteur d'un acte écrit par le vrai chemin", async () => {
    const posed = await staff()
      .post("/admin/pricing/rules")
      .send({
        stage: "promotion",
        scope: { type: "global", id: null },
        audience: { type: "all", id: null },
        minQuantity: null,
        effect: { nature: "alter", direction: "decrease", mode: "percent", value: 1000 },
        label: "Promo paginée",
        validFrom: daysAgo(1),
        validTo: null,
      })
      .expect(201);
    const { id } = jsonBody<{ id: string }>(posed);

    const page = jsonBody<PricingJournalPageView>(await pageOf("rule", id).expect(200));

    expect(page.total).toBe(1);
    expect(page.entries[0]).toMatchObject({
      act: "posed",
      actor: E2E_STAFF_ID,
      actorName: "Opérateur E2E",
    });
  });
});

/**
 * L'ancre : un numéro de page glisse sur un fil append-only lu par la tête.
 * Sans elle, l'acte écrit entre la page 1 et la page 2 pousserait tout d'un
 * rang, et le dernier acte de la page 1 réapparaîtrait en tête de la 2.
 */
describe("parcourir un instantané", () => {
  it("n'ajoute pas en page 2 un acte écrit après la page 1, et garde le total", async () => {
    await seedActs("rule", RULE_ID, minuteSeries(30));
    const first = await readPage("?pageSize=10");
    await ctx.prisma.pricingEvent.create({
      data: eventRow("01ZZ_APRES", act("rule", RULE_ID, new Date(SERIES_START + 60 * MINUTE_MS))),
    });

    const second = await readPage(`?page=2&pageSize=10&asOf=${first.asOf ?? ""}`);

    expect(second).toMatchObject({ total: 30, asOf: first.asOf });
    expect(second.entries.map((entry) => entry.id)).toEqual(
      Array.from({ length: 10 }, (_, index) => actId(19 - index)),
    );
  });

  /**
   * La borne est le COUPLE (instant, id) de l'ancre, pas `id <= asOf` : un
   * acte PLUS ANCIEN dont l'id trie après l'ancre — deux horloges, deux ordres —
   * appartient à l'instantané, puisque la page 1 l'aurait lu.
   */
  it("garde un acte plus ancien que l'ancre même si son id trie après elle", async () => {
    await seedActs("rule", RULE_ID, minuteSeries(3));
    await ctx.prisma.pricingEvent.create({
      data: eventRow("01ZZ_ANCIEN", act("rule", RULE_ID, new Date(SERIES_START - MINUTE_MS))),
    });

    const page = await readPage(`?asOf=${actId(2)}`);

    expect(page.total).toBe(4);
    expect(page.entries.map((entry) => entry.id)).toEqual([
      actId(2),
      actId(1),
      actId(0),
      "01ZZ_ANCIEN",
    ]);
  });

  it("refuse une ancre qui n'est pas un acte de ce sujet", async () => {
    await seedActs("rule", RULE_ID, minuteSeries(1));
    // Un acte qui EXISTE, mais sur un autre sujet : une ancre ne se prête pas.
    await ctx.prisma.pricingEvent.create({
      data: eventRow("01AUTRE_SUJET", act("floor", "global:", new Date(SERIES_START))),
    });

    for (const asOf of ["inconnue", "01AUTRE_SUJET"]) {
      const response = await pageOf("rule", RULE_ID, `?asOf=${asOf}`);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: "pricing.journal.anchor_unknown" });
    }
  });
});

/**
 * Régression : le lecteur rangeait tout sujet qui n'était pas `floor` sous
 * `rule` — un acte de barème ou de mercuriale ressortait `subjectType: "rule"`,
 * et l'écran l'aurait envoyé chercher parmi les règles (corrigé le 2026-09-19).
 */
describe("le sujet d'un acte ressort tel qu'il a été écrit", () => {
  it("un acte de barème reste un acte de barème", async () => {
    await seedActs("ladder", "ladder_7", minuteSeries(1));

    const entries = jsonBody<PricingJournalEntryView[]>(
      await staff().get("/admin/pricing/journal/ladder/ladder_7").expect(200),
    );

    expect(entries.map((entry) => entry.subjectType)).toEqual(["ladder"]);
  });

  it("un acte de mercuriale reste un acte de mercuriale, sur les deux routes", async () => {
    await seedActs("mercuriale", "merc_1", minuteSeries(1));

    const legacy = jsonBody<PricingJournalEntryView[]>(
      await staff().get("/admin/pricing/journal/mercuriale/merc_1").expect(200),
    );
    const page = jsonBody<PricingJournalPageView>(await pageOf("mercuriale", "merc_1").expect(200));

    expect(legacy.map((entry) => entry.subjectType)).toEqual(["mercuriale"]);
    expect(page.entries.map((entry) => entry.subjectType)).toEqual(["mercuriale"]);
  });
});

describe("l'ancienne route, que lit le front en ligne", () => {
  it("rend toujours un tableau nu, du plus récent au plus ancien", async () => {
    await seedActs("rule", RULE_ID, minuteSeries(3));

    const response = await staff().get(`/admin/pricing/journal/rule/${RULE_ID}`).expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(jsonBody<PricingJournalEntryView[]>(response).map((entry) => entry.id)).toEqual(
      [2, 1, 0].map(actId),
    );
  });
});
