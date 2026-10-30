/**
 * E2E des **points de retrait** (globaux) : lecture publique + gestion staff
 * (ajouter / supprimer — qui archive depuis le lot S1 des sites). Le site par
 * défaut a disparu le 2026-10-15 (Hugo) : plus de geste « défaut », plus de
 * point en tête.
 */
import type {
  AudiencePickupDiscount,
  CreatedPickupResponse,
  PickupAddressView,
} from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";

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

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

const point = (label: string): Record<string, unknown> => ({
  label,
  ligne1: "1 rue du Test",
  ligne2: "",
  codePostal: "75001",
  ville: "Paris",
  pays: "France",
});

async function create(label: string): Promise<string> {
  const response = await staff().post("/admin/pickup-addresses").send(point(label)).expect(201);
  return jsonBody<CreatedPickupResponse>(response).id;
}

async function list(): Promise<readonly PickupAddressView[]> {
  const response = await ctx.http().get("/pickup-addresses").expect(200);
  return jsonBody<readonly PickupAddressView[]>(response);
}

describe("points de retrait", () => {
  it("sert les points par ancienneté, sans aucun rang de défaut", async () => {
    const first = await create("Labo Paris");
    const second = await create("Labo Lyon");

    const points = await list();
    expect(points.map((p) => p.id)).toEqual([first, second]);
    expect(points.every((p) => !("isDefault" in p))).toBe(true);
  });

  /** Le geste a quitté l'API (Hugo, 2026-10-15 — pré-release, contrat cassable). */
  it("ne sert plus la route « définir par défaut »", async () => {
    const id = await create("Labo Paris");
    await staff().patch(`/admin/pickup-addresses/${id}/default`).expect(404);
    await staff().patch(`/admin/sites/${id}/default`).expect(404);
  });

  /**
   * Depuis le lot S1 des sites (2026-10-13), « supprimer » ARCHIVE : la ligne
   * reste (commandes, abonnements et départ la référencent), le point quitte
   * la liste publique.
   */
  it("supprimer un point l'archive : il quitte la liste publique, la ligne reste", async () => {
    await create("Labo Paris");
    const second = await create("Labo Lyon");

    await staff().delete(`/admin/pickup-addresses/${second}`).expect(204);

    expect((await list()).map((p) => p.label)).toEqual(["Labo Paris"]);
    const row = await ctx.prisma.site.findUniqueOrThrow({ where: { id: second } });
    expect(row.archivedAt).not.toBeNull();
  });

  /** Sans défaut, plus rien ne retient le premier point ni le dernier. */
  it("archive le premier point créé comme un autre", async () => {
    const first = await create("Labo Paris");
    await create("Labo Lyon");

    await staff().delete(`/admin/pickup-addresses/${first}`).expect(204);

    expect((await list()).map((p) => p.label)).toEqual(["Labo Lyon"]);
  });
});

/**
 * Les remises d'un point, une par clientèle (plan
 * `plan-remise-retrait-par-clientele-et-exclusions.md`, lot A, 2026-10-22).
 *
 * RÉÉCRIT en L12 (2026-10-30, plan des promotions) : la remise d'un point se
 * règle dans l'écran Promotions, et les colonnes de la fiche ne sont plus ni
 * écrites ni lues. Les cas qui éprouvaient l'écriture des remises (règles
 * relues de leur table, remplacement en bloc, refus de forme, case des pros)
 * éprouvaient un éditeur retiré : ils deviennent son refus. Les refus de
 * forme restent éprouvés au domaine (`pickup-discount.spec.ts`), l'annonce
 * tirée des promotions dans `promotions-l12.e2e-spec.ts`.
 */
describe("points de retrait — une remise par clientèle", () => {
  const PRO: AudiencePickupDiscount = {
    adjustment: { mode: "percent", bp: 1_000 },
    scope: "all_except",
    categories: [{ categoryId: "c_boissons", eligible: false }],
    products: [{ productId: "p_jus", eligible: true }],
  };

  async function only(): Promise<PickupAddressView> {
    const [first] = await list();
    if (first === undefined) {
      throw new Error("aucun point servi");
    }
    return first;
  }

  it("à la création, sans remises : aucune clientèle n'en reçoit", async () => {
    await create("Labo Paris");

    expect((await only()).discounts).toEqual({ b2b: null, b2c: null });
  });

  it("refuse (409) de créer un point avec une remise, en nommant l'écran Promotions", async () => {
    const response = await staff()
      .post("/admin/pickup-addresses")
      .send({ ...point("Labo Paris"), discounts: { b2b: PRO, b2c: null } })
      .expect(409);

    expect((response.body as { code?: string }).code).toBe("promotions.legacy_editor_closed");
    expect(await list()).toEqual([]);
  });

  it("refuse (409) un PATCH qui porte des remises ; sans elles, le lieu s'écrit", async () => {
    const id = await create("Labo Paris");

    const refused = await staff()
      .patch(`/admin/pickup-addresses/${id}`)
      .send({ ...point("Labo Paris"), discounts: { b2b: PRO, b2c: null } })
      .expect(409);
    expect((refused.body as { message?: string }).message).toContain(
      "Nouvelle promotion pour ce site",
    );

    await staff()
      .patch(`/admin/pickup-addresses/${id}`)
      .send({ ...point("Labo Paris — renommé") })
      .expect(204);
    const served = await only();
    expect(served.label).toBe("Labo Paris — renommé");
    expect(served.discounts).toEqual({ b2b: null, b2c: null });
  });
});
