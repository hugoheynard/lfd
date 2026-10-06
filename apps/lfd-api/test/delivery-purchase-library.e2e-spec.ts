/**
 * E2E de la **bibliothèque d'achat** — véhicules et formats de bacs candidats
 * (`documentation/livraisons/plan-bibliotheque-d-achat.md`, lot B1).
 *
 * Ce que seul l'e2e prouve : l'aller-retour par les colonnes et le volume
 * dérivé, l'index partiel sur le nom, les CHECK de la migration, les faits
 * relus en base, les droits du simulateur relus en base (B-D6) — et surtout
 * B-D1 : un candidat n'apparaît NI dans la flotte, NI dans le catalogue des bacs.
 */
import type {
  BinTypesView,
  CreatedIdResponse,
  PurchaseBinCandidatesView,
  PurchaseVehicleCandidatesView,
  VehiclesView,
} from "@lfd/contracts";
import { checkJournalFact } from "@lfd/contracts/journal-facts";

import { ADMIN_VERIFIER_OVERRIDE, admin, VEHICLES } from "./delivery-rounds-scene.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";

const LIBRARY_VEHICLES = "/admin/livraison/bibliotheque/vehicules";
const LIBRARY_BINS = "/admin/livraison/bibliotheque/bacs";
const REAL_BINS = "/admin/livraison/bacs";

const KANGOO = {
  name: "Kangoo L2",
  cargo: { lengthCm: 220, widthCm: 150, heightCm: 125 },
  wheelArches: { lengthCm: 80, protrusionCm: 20, fromBackCm: 30, heightCm: 25 },
  reference: "KL2-2026",
  purchaseUrl: "https://exemple.fr/kangoo",
  priceCentsExclVat: 2_500_000,
};

const CAISSE = {
  name: "Caisse Dupont 50",
  outer: { lengthMm: 600, widthMm: 400, heightMm: 300 },
  inner: { lengthMm: 560, widthMm: 360, heightMm: 270 },
  isotherm: false,
  maxStack: 5,
  supplier: "Dupont",
  reference: null,
  purchaseUrl: null,
  unitPriceCentsExclVat: 1_290,
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

function code(response: Parameters<typeof jsonBody>[0]): string {
  return jsonBody<{ readonly code: string }>(response).code;
}

async function declare(path: string, body: object): Promise<string> {
  const response = await admin(ctx).post(path).send(body).expect(201);
  return jsonBody<CreatedIdResponse>(response).id;
}

async function vehicles(query = ""): Promise<PurchaseVehicleCandidatesView> {
  return jsonBody<PurchaseVehicleCandidatesView>(
    await admin(ctx).get(`${LIBRARY_VEHICLES}${query}`).expect(200),
  );
}

async function bins(query = ""): Promise<PurchaseBinCandidatesView> {
  return jsonBody<PurchaseBinCandidatesView>(
    await admin(ctx).get(`${LIBRARY_BINS}${query}`).expect(200),
  );
}

/** Une fiche `support` qui ne LIT que les tournées, par dérogation. */
async function roundsReader(): Promise<ReturnType<E2eContext["asSub"]>> {
  const sub = "staff-rounds-reader";
  const row = await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: "Lecteur",
      email: "lecteur@lfc.test",
      role: "support",
      status: "active",
      auth0Id: sub,
    },
  });
  await ctx.prisma.staffPermissionOverride.create({
    data: { staffUserId: row.id, resource: "delivery_rounds", action: "read", effect: "allow" },
  });
  return ctx.asSub(sub);
}

describe("les véhicules candidats", () => {
  it("rend la fiche, le volume DÉRIVÉ, l'auteur, et se corrige", async () => {
    const id = await declare(LIBRARY_VEHICLES, KANGOO);

    const [candidate] = (await vehicles()).candidates;
    expect(candidate).toMatchObject({
      id,
      ...KANGOO,
      cargo: { ...KANGOO.cargo, volumeLiters: 4125 },
      archivedAt: null,
    });
    expect(candidate?.updatedBy.staffUserId).not.toBe("");

    await admin(ctx)
      .put(`${LIBRARY_VEHICLES}/${id}`)
      .send({ ...KANGOO, wheelArches: null, priceCentsExclVat: null })
      .expect(204);
    expect((await vehicles()).candidates[0]).toMatchObject({
      wheelArches: null,
      priceCentsExclVat: null,
    });
  });

  it("archive hors de la liste courante, visible sur demande ; libère le nom", async () => {
    const id = await declare(LIBRARY_VEHICLES, KANGOO);
    await admin(ctx).post(`${LIBRARY_VEHICLES}/${id}/archiver`).expect(204);
    expect(code(await admin(ctx).post(`${LIBRARY_VEHICLES}/${id}/archiver`).expect(409))).toBe(
      "delivery.purchase_vehicle_candidate_already_archived",
    );

    expect((await vehicles()).candidates).toEqual([]);
    expect((await vehicles("?archives=inclure")).candidates.map((c) => c.id)).toEqual([id]);

    await declare(LIBRARY_VEHICLES, KANGOO);
    expect(code(await admin(ctx).post(`${LIBRARY_VEHICLES}/${id}/reactiver`).expect(409))).toBe(
      "delivery.purchase_vehicle_candidate_name_taken",
    );
    expect(await ctx.prisma.deliveryPurchaseVehicleCandidate.count()).toBe(2); // jamais supprimé
  });

  it("refuse un doublon de nom, un lien http, un prix négatif, un identifiant inconnu", async () => {
    await declare(LIBRARY_VEHICLES, KANGOO);

    expect(code(await admin(ctx).post(LIBRARY_VEHICLES).send(KANGOO).expect(409))).toBe(
      "delivery.purchase_vehicle_candidate_name_taken",
    );
    const http = { ...KANGOO, name: "Autre", purchaseUrl: "http://exemple.fr/kangoo" };
    expect(code(await admin(ctx).post(LIBRARY_VEHICLES).send(http).expect(400))).toBe(
      "delivery.purchase_url_invalid",
    );
    const js = { ...KANGOO, name: "Autre", purchaseUrl: "javascript:alert(1)" };
    expect(code(await admin(ctx).post(LIBRARY_VEHICLES).send(js).expect(400))).toBe(
      "delivery.purchase_url_invalid",
    );
    const negative = { ...KANGOO, name: "Autre", priceCentsExclVat: -1 };
    expect(code(await admin(ctx).post(LIBRARY_VEHICLES).send(negative).expect(400))).toBe(
      "delivery.purchase_price_invalid",
    );
    expect(code(await admin(ctx).post(`${LIBRARY_VEHICLES}/nope/archiver`).expect(404))).toBe(
      "delivery.purchase_vehicle_candidate_not_found",
    );
  });

  it("refuse des passages sans hauteur (400) : un candidat se mesure comme un vrai véhicule", async () => {
    const { heightCm: _height, ...flat } = KANGOO.wheelArches;
    await admin(ctx)
      .post(LIBRARY_VEHICLES)
      .send({ ...KANGOO, wheelArches: flat })
      .expect(400);
  });
});

describe("les formats de bacs candidats", () => {
  it("rend la fiche, le volume intérieur DÉRIVÉ ; archive et réactive", async () => {
    const id = await declare(LIBRARY_BINS, CAISSE);
    expect((await bins()).candidates).toMatchObject([
      { id, ...CAISSE, innerVolumeLiters: 54, archivedAt: null },
    ]);

    await admin(ctx).post(`${LIBRARY_BINS}/${id}/archiver`).expect(204);
    expect((await bins()).candidates).toEqual([]);
    await admin(ctx).post(`${LIBRARY_BINS}/${id}/reactiver`).expect(204);
    expect(code(await admin(ctx).post(`${LIBRARY_BINS}/${id}/reactiver`).expect(409))).toBe(
      "delivery.purchase_bin_candidate_not_archived",
    );
  });

  it("refuse un intérieur trop grand, un prix non entier, un doublon", async () => {
    await declare(LIBRARY_BINS, CAISSE);

    const tooWide = { ...CAISSE, name: "X", inner: { ...CAISSE.inner, widthMm: 410 } };
    expect(code(await admin(ctx).post(LIBRARY_BINS).send(tooWide).expect(400))).toBe(
      "delivery.bin_inner_exceeds_outer",
    );
    const negative = { ...CAISSE, name: "X", unitPriceCentsExclVat: -100 };
    expect(code(await admin(ctx).post(LIBRARY_BINS).send(negative).expect(400))).toBe(
      "delivery.purchase_price_invalid",
    );
    await admin(ctx)
      .post(LIBRARY_BINS)
      .send({ ...CAISSE, name: "X", unitPriceCentsExclVat: 12.5 })
      .expect(400);
    expect(code(await admin(ctx).post(LIBRARY_BINS).send(CAISSE).expect(409))).toBe(
      "delivery.purchase_bin_candidate_name_taken",
    );
  });
});

describe("les formats de bacs candidats — au millimètre (2026-10-07)", () => {
  const MANNE = {
    ...CAISSE,
    name: "Manne à pain",
    outer: { lengthMm: 665, widthMm: 460, heightMm: 715 },
    inner: { lengthMm: 645, widthMm: 440, heightMm: 695 },
    maxStack: 1,
  };

  it("garde le demi-centimètre de bout en bout, et n'écrit plus les colonnes en cm", async () => {
    const id = await declare(LIBRARY_BINS, MANNE);

    // 645 × 440 × 695 mm = 197 241 000 mm³ → 197 L.
    expect((await bins()).candidates).toMatchObject([
      { id, outer: MANNE.outer, inner: MANNE.inner, innerVolumeLiters: 197 },
    ]);
    const row = await ctx.prisma.deliveryPurchaseBinCandidate.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ outerLengthMm: 665, innerHeightMm: 695 });
    expect([row.outerLengthCm, row.outerWidthCm, row.innerHeightCm]).toEqual([null, null, null]);
  });

  it("refuse une dimension non entière en mm (400)", async () => {
    await admin(ctx)
      .post(LIBRARY_BINS)
      .send({ ...MANNE, outer: { ...MANNE.outer, lengthMm: 665.5 } })
      .expect(400);
  });

  it("trace la fiche au journal en millimètres, et relit un ancien fait en centimètres", async () => {
    await declare(LIBRARY_BINS, MANNE);
    const fact = await ctx.prisma.activityEvent.findFirstOrThrow({
      where: { type: "delivery_purchase_bin_candidate.declared" },
      select: { type: true, payload: true },
    });
    expect(fact.payload).toMatchObject({ candidate: { outer: MANNE.outer, inner: MANNE.inner } });
    expect(checkJournalFact(fact.type, fact.payload)).toBeNull();

    // Un fait écrit avant le 2026-10-07 porte des cm entiers : il se lit encore.
    const before = {
      subjectLabel: "Caisse Dupont 50",
      candidate: {
        ...CAISSE,
        outer: { lengthCm: 60, widthCm: 40, heightCm: 30 },
        inner: { lengthCm: 56, widthCm: 36, heightCm: 27 },
      },
    };
    expect(checkJournalFact("delivery_purchase_bin_candidate.declared", before)).toBeNull();
  });
});

describe("séparés du réel (B-D1)", () => {
  it("un candidat n'apparaît ni dans la flotte, ni dans le catalogue des bacs", async () => {
    await declare(LIBRARY_VEHICLES, KANGOO);
    await declare(LIBRARY_BINS, CAISSE);

    const fleet = jsonBody<VehiclesView>(await admin(ctx).get(VEHICLES).expect(200));
    const catalog = jsonBody<BinTypesView>(await admin(ctx).get(REAL_BINS).expect(200));

    expect(fleet.vehicles).toEqual([]);
    expect(catalog.types).toEqual([]);
    expect(await ctx.prisma.deliveryVehicle.count()).toBe(0);
    expect(await ctx.prisma.deliveryBinType.count()).toBe(0);
  });
});

describe("la base tient ce que le domaine refuse", () => {
  it("refuse des passages de roue à moitié décrits, et un prix négatif", async () => {
    const id = await declare(LIBRARY_VEHICLES, KANGOO);

    await expect(
      ctx.prisma.deliveryPurchaseVehicleCandidate.update({
        where: { id },
        data: { wheelArchHeightCm: null },
      }),
    ).rejects.toThrow(/wheel_arches_all_or_none/u);
    await expect(
      ctx.prisma.deliveryPurchaseVehicleCandidate.update({
        where: { id },
        data: { priceCentsExclVat: -1 },
      }),
    ).rejects.toThrow(/delivery_purchase_vehicle_candidate_price/u);
  });
});

describe("la base tient les dimensions en millimètres", () => {
  it("le CHECK reporté sur les colonnes en mm refuse un intérieur plus grand ou nul", async () => {
    const id = await declare(LIBRARY_BINS, CAISSE);

    await expect(
      ctx.prisma.$executeRawUnsafe(
        `UPDATE "delivery"."delivery_purchase_bin_candidate" SET "inner_height_mm" = 301 WHERE "id" = $1`,
        id,
      ),
    ).rejects.toThrow(/delivery_purchase_bin_candidate_dimensions/u);
    await expect(
      ctx.prisma.$executeRawUnsafe(
        `UPDATE "delivery"."delivery_purchase_bin_candidate" SET "inner_length_mm" = 0 WHERE "id" = $1`,
        id,
      ),
    ).rejects.toThrow(/delivery_purchase_bin_candidate_dimensions/u);
  });
});

describe("le journal", () => {
  it("trace chaque geste, et chaque charge passe le catalogue des faits", async () => {
    const vehicle = await declare(LIBRARY_VEHICLES, KANGOO);
    await admin(ctx)
      .put(`${LIBRARY_VEHICLES}/${vehicle}`)
      .send({ ...KANGOO, priceCentsExclVat: 2_400_000 })
      .expect(204);
    await admin(ctx).post(`${LIBRARY_VEHICLES}/${vehicle}/archiver`).expect(204);
    await admin(ctx).post(`${LIBRARY_VEHICLES}/${vehicle}/reactiver`).expect(204);
    const bin = await declare(LIBRARY_BINS, CAISSE);
    await admin(ctx)
      .put(`${LIBRARY_BINS}/${bin}`)
      .send({ ...CAISSE, maxStack: 4 })
      .expect(204);

    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: { startsWith: "delivery_purchase_" } },
      orderBy: { id: "asc" },
      select: { type: true, payload: true },
    });
    expect(facts.map((fact) => fact.type)).toEqual([
      "delivery_purchase_vehicle_candidate.declared",
      "delivery_purchase_vehicle_candidate.corrected",
      "delivery_purchase_vehicle_candidate.archived",
      "delivery_purchase_vehicle_candidate.reactivated",
      "delivery_purchase_bin_candidate.declared",
      "delivery_purchase_bin_candidate.corrected",
    ]);
    for (const fact of facts) {
      expect(checkJournalFact(fact.type, fact.payload)).toBeNull();
    }
  });
});

describe("les droits du simulateur (B-D6)", () => {
  it("un lecteur des tournées lit la bibliothèque, mais n'y écrit pas (403)", async () => {
    const reader = await roundsReader();

    await reader.get(LIBRARY_VEHICLES).expect(200);
    await reader.get(LIBRARY_BINS).expect(200);
    await reader.post(LIBRARY_VEHICLES).send(KANGOO).expect(403);
    await reader.post(LIBRARY_BINS).send(CAISSE).expect(403);
  });

  it("sans droit sur les tournées, rien ne se lit (403)", async () => {
    await ctx.prisma.staffUser.create({
      data: {
        firstName: "Test",
        lastName: "Support",
        email: "support@lfc.test",
        role: "support",
        status: "active",
        auth0Id: "staff-support",
      },
    });
    const support = ctx.asSub("staff-support");

    await support.get(LIBRARY_VEHICLES).expect(403);
    await support.get(LIBRARY_BINS).expect(403);
  });
});
