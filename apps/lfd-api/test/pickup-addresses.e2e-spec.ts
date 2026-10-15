/**
 * E2E des **points de retrait** (globaux) : lecture publique + gestion staff
 * (ajouter / supprimer — qui archive depuis le lot S1 des sites). Le site par
 * défaut a disparu le 2026-10-15 (Hugo) : plus de geste « défaut », plus de
 * point en tête.
 */
import type { CreatedPickupResponse, PickupAddressView } from "@lfd/contracts";

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
 * Les clientèles de la remise d'un point (plan `remise-et-livraison-par-clientele`, D2).
 */
describe("points de retrait — clientèles de la remise", () => {
  const TEN_PERCENT = { mode: "percent", bp: 1_000 } as const;

  async function createWith(body: Record<string, unknown>): Promise<string> {
    const response = await staff()
      .post("/admin/pickup-addresses")
      .send({ ...point("Labo Paris"), ...body })
      .expect(201);
    return jsonBody<CreatedPickupResponse>(response).id;
  }

  async function only(): Promise<PickupAddressView> {
    const [first] = await list();
    if (first === undefined) {
      throw new Error("aucun point servi");
    }
    return first;
  }

  it("à la création, sans clientèles : la remise vaut pour les deux — l'existant", async () => {
    await createWith({ discount: TEN_PERCENT });

    expect((await only()).discountAudiences).toEqual({ b2b: true, b2c: true });
  });

  it("sert les clientèles posées, sur la liste publique", async () => {
    await createWith({ discount: TEN_PERCENT, discountAudiences: { b2b: true, b2c: false } });

    const served = await only();
    expect(served.discount).toEqual(TEN_PERCENT);
    expect(served.discountAudiences).toEqual({ b2b: true, b2c: false });
  });

  /**
   * Régression (vitruve, S2) : un onglet du back-office ouvert avant le
   * déploiement renvoie une charge SANS clientèles. Validée avec le schéma de
   * création, elle prenait le défaut « les deux » et rouvrait au public une
   * remise fermée, en silence.
   */
  it("un PATCH sans discountAudiences ne rouvre rien", async () => {
    const id = await createWith({
      discount: TEN_PERCENT,
      discountAudiences: { b2b: true, b2c: false },
    });

    await staff()
      .patch(`/admin/pickup-addresses/${id}`)
      .send({ ...point("Labo Paris — renommé"), discount: TEN_PERCENT })
      .expect(204);

    const served = await only();
    expect(served.label).toBe("Labo Paris — renommé");
    expect(served.discountAudiences).toEqual({ b2b: true, b2c: false });
  });

  it("refuse (400) une réduction qui ne vise aucune clientèle, à la création", async () => {
    const response = await staff()
      .post("/admin/pickup-addresses")
      .send({
        ...point("Labo Paris"),
        discount: TEN_PERCENT,
        discountAudiences: { b2b: false, b2c: false },
      })
      .expect(400);

    expect((response.body as { code?: string }).code).toBe("pickup.discount.no_audience");
    expect(await list()).toHaveLength(0);
  });

  it("refuse (400) la même chose en modification, et n'écrit rien", async () => {
    const id = await createWith({ discount: TEN_PERCENT });

    const response = await staff()
      .patch(`/admin/pickup-addresses/${id}`)
      .send({
        ...point("Labo Paris"),
        discount: { mode: "amount", cents: 300 },
        discountAudiences: { b2b: false, b2c: false },
      })
      .expect(400);

    expect((response.body as { code?: string }).code).toBe("pickup.discount.no_audience");
    expect((await only()).discount).toEqual(TEN_PERCENT);
  });

  it("sans réduction, accepte les deux cases décochées et les conserve", async () => {
    const id = await createWith({ discount: TEN_PERCENT });

    await staff()
      .patch(`/admin/pickup-addresses/${id}`)
      .send({
        ...point("Labo Paris"),
        discount: null,
        discountAudiences: { b2b: false, b2c: false },
      })
      .expect(204);

    const served = await only();
    expect(served.discount).toBeNull();
    expect(served.discountAudiences).toEqual({ b2b: false, b2c: false });
  });
});
