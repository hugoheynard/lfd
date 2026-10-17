import type { CommerceOperationView, ShopCatalogueView } from "@lfd/contracts";
import request from "supertest";

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
import {
  depositImage,
  noelBody,
  OPERATIONS,
  stubAdminVerifier,
} from "./operations-at-commerce-scene.js";

/**
 * E2E — **les opérations au commerce, après la bascule** (lot 3 de
 * `documentation/operations-datees/plan-l-operation-passe-au-commerce.md`).
 *
 * Ce que seul ce niveau prouve, sur le vrai module et la vraie base : la
 * boutique lit l'opération du commerce : son encart sans
 * article pendant l'annonce, `awaitingProducts`, le texte alternatif de la
 * médiathèque.
 *
 * La migration depuis le référentiel et ce que la bascule coupait au push
 * s'éprouvaient sur un miroir de COPIES que le push écrivait : depuis X1, plus
 * rien ne peut produire cet état, et leurs cas sont partis avec lui. Le refus
 * du référentiel d'écrire une opération est parti en X4, avec ses routes.
 */

let ctx: E2eContext;

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

const staff = (): ReturnType<E2eContext["http"]> => ctx.asSub(E2E_STAFF_SUB);

describe("les lectures de l'écran et la boutique", () => {
  const shop = async (): Promise<ShopCatalogueView> =>
    jsonBody<ShopCatalogueView>(
      await request(ctx.app.getHttpServer()).get("/shop/catalogue").expect(200),
    );

  /** Annoncée depuis hier, commandes dans cinq jours : la fenêtre d'annonce court. */
  const announced = () =>
    noelBody({
      announceFrom: daysAgo(1),
      orderFrom: daysAgo(-5),
      orderUntil: daysAgo(-20),
      pickupFrom: serviceDay(22),
      pickupUntil: serviceDay(24),
    });

  it("pendant l'annonce, le rayon paraît sur son seul encart ; commandes ouvertes, il attend ses produits", async () => {
    const body = announced();
    await staff().post(OPERATIONS).send(body).expect(201);

    const [shown, ...others] = (await shop()).operations;
    expect(others).toEqual([]);
    expect(shown).toMatchObject({
      key: "noel-2026",
      state: "announced",
      skus: [],
      awaitingProducts: false,
    });
    expect(shown?.announceFrom).toBe(new Date(body.announceFrom).toISOString());
    const view = jsonBody<CommerceOperationView>(
      await staff().get(`${OPERATIONS}/noel-2026`).expect(200),
    );
    expect(view).toMatchObject({
      state: "announced",
      withoutSellingArticle: true,
      shopDisplay: "announcement_only",
      awaitingProducts: false,
    });

    const { announceFrom, orderUntil, pickupFrom, pickupUntil } = body;
    await staff()
      .put(`${OPERATIONS}/noel-2026/schedule`)
      .send({ announceFrom, orderFrom: daysAgo(0.5), orderUntil, pickupFrom, pickupUntil })
      .expect(200);

    expect((await shop()).operations[0]).toMatchObject({ state: "open", awaitingProducts: true });
  });

  it("masquée : rien en boutique, et l'écran le dit", async () => {
    await staff().post(OPERATIONS).send(announced()).expect(201);
    await staff().put(`${OPERATIONS}/noel-2026/visibility`).send({ hidden: true }).expect(200);

    expect((await shop()).operations).toEqual([]);
    const [view] = jsonBody<CommerceOperationView[]>(await staff().get(OPERATIONS).expect(200));
    expect(view).toMatchObject({ hidden: true, shopDisplay: "nothing" });
  });

  it("le texte alternatif vient de la médiathèque, à l'écran comme en boutique", async () => {
    const url = await depositImage(ctx, 1004, { x: 0.3, y: 0.7 });
    await staff()
      .put("/media")
      .send({
        url,
        name: "bûche",
        tags: [],
        alt: { fr: "Une bûche roulée" },
        focal: { x: 0.3, y: 0.7 },
      })
      .expect(200);
    await staff()
      .post(OPERATIONS)
      .send({ ...announced(), image: { url } })
      .expect(201);

    const view = jsonBody<CommerceOperationView>(
      await staff().get(`${OPERATIONS}/noel-2026`).expect(200),
    );
    expect(view.image).toEqual({ url, alt: "Une bûche roulée", focal: { x: 0.3, y: 0.7 } });
    expect((await shop()).operations[0]?.image).toMatchObject({ url, alt: "Une bûche roulée" });
    expect(
      await ctx.prisma.catalogOperation.findUniqueOrThrow({ where: { key: "noel-2026" } }),
    ).toMatchObject({ imageAlt: null });
  });
});
