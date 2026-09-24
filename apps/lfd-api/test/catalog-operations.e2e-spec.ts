import type { StoredCatalogSnapshot, SyncOperation } from "@lfd/catalog-sync";
import type { PendingDeliveryView, ReceivedOperationView } from "@lfd/contracts";

import { CatalogDelivery } from "../src/b2b/catalog/domain/entities/catalog-delivery.js";
import { CatalogDeliveryRepository } from "../src/b2b/catalog/domain/ports/catalog-delivery.repository.js";
import { CatalogOperationsReader } from "../src/b2b/catalog/domain/ports/catalog-operations.reader.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { snapshotOf } from "./catalog-ingest-fixtures.js";
import { bootstrapE2e, daysAgo, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";

/**
 * **Les opérations datées traversent le fil v11, jusqu'au miroir du commerce**
 * (lot 2 de `documentation/order/architecture-operations-datees.md`).
 *
 * Ce que seul ce niveau prouve : l'acceptation d'un envoi écrit VRAIMENT le
 * miroir des opérations, un envoi suivant les MARQUE retirées sans rien
 * supprimer — la surcharge garde son parent, sous une clé étrangère réelle —,
 * un envoi v10 resté en file se relit après le déploiement, et le mur d'accès
 * tient sur les deux routes.
 */

/** Le jeton porteur EST le `sub` : plusieurs personnes dans une même suite. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const OPERATIONS = "/admin/catalog/operations";
const DELIVERY = "/admin/catalog/delivery";

/** Deux rôles non-admin : l'un lit le catalogue vendu sans l'écrire, l'autre n'y a aucun droit. */
const ACCOUNTANT = { sub: "staff-comptable", role: "comptabilite", id: "fiche-comptable" } as const;
const COMMUNICATION = {
  sub: "staff-communication",
  role: "communication",
  id: "fiche-communication",
} as const;

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
  for (const person of [ACCOUNTANT, COMMUNICATION]) {
    await ctx.prisma.staffUser.create({
      data: {
        id: person.id,
        firstName: "Fiche",
        lastName: person.role,
        email: `${person.role}@lfc.test`,
        role: person.role,
        status: "active",
        auth0Id: person.sub,
      },
    });
  }
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub("staff-e2e");

/**
 * Noël, RELATIF à maintenant : annoncé dans un mois, clos dans onze semaines,
 * retiré la semaine d'après. Rien ici ne compare ces dates à l'horloge — le
 * lot 2 n'a pas d'état —, mais le lot 3 le fera, et la fixture ne doit pas
 * devenir une bombe à retardement ce jour-là.
 */
const ANNOUNCE_FROM = daysAgo(-30);
const ORDER_UNTIL = daysAgo(-77);
/** Plus tôt et plus tard que la clôture du référentiel, pour la surcharge. */
const EARLIER = daysAgo(-60);
const LATER = daysAgo(-90);
const PICKUP_FROM = serviceDay(78);
const PICKUP_UNTIL = serviceDay(84);

function noel(over: Partial<SyncOperation> = {}): SyncOperation {
  return {
    key: "noel-2026",
    name: { fr: "Noël", en: "Christmas" },
    lede: { fr: "La bûche revient" },
    image: null,
    announceFrom: ANNOUNCE_FROM,
    orderFrom: null,
    orderUntil: ORDER_UNTIL,
    pickupFrom: PICKUP_FROM,
    pickupUntil: PICKUP_UNTIL,
    audience: "both",
    skus: ["PAT-002-1", "VIE-001-1"],
    ...over,
  };
}

/** Le croissant courant, la bûche réservée aux opérations — et les opérations données. */
function v11(operations: readonly SyncOperation[]): StoredCatalogSnapshot {
  return snapshotOf(
    [
      { sku: "VIE-001", priceMillicents: 210_000 },
      { sku: "PAT-002", priceMillicents: 2_900_000, operationOnly: true },
    ],
    [],
    operations,
  );
}

/**
 * Un envoi **v10**, tel qu'il dormait en file avant le déploiement : ni
 * `operations`, ni `operationOnly`. Construit en retirant les champs, pas en
 * les posant à vide — c'est leur ABSENCE que le stockage doit relire.
 */
function v10(): StoredCatalogSnapshot {
  const { operations, ...rest } = v11([]);
  void operations;
  return {
    ...rest,
    version: 10,
    products: rest.products.map(({ operationOnly, ...product }) => {
      void operationOnly;
      return product;
    }),
  };
}

let seq = 0;

/** Dépose une arrivée par le port — le drapeau de la boîte n'est pas ouvert en test. */
async function toInbox(delivered: StoredCatalogSnapshot): Promise<void> {
  seq += 1;
  await ctx.app.get(CatalogDeliveryRepository).deliver(
    CatalogDelivery.receive({
      id: `d_op_${String(seq)}`,
      revisionId: `rev_op_${String(seq)}`,
      snapshot: delivered,
      fingerprint: `empreinte-op-${String(seq)}`,
      receivedAt: new Date(daysAgo(0)),
    }),
  );
}

/** Relit l'arrivée en attente PAR HTTP, puis l'accepte — le geste de la réception. */
async function acceptPending(): Promise<void> {
  const pending = jsonBody<PendingDeliveryView>(await staff().get(DELIVERY).expect(200));
  await staff()
    .post(`${DELIVERY}/accept`)
    .send({ deliveryId: pending.id, excludedSkus: [] })
    .expect(201);
}

async function deliverAndAccept(delivered: StoredCatalogSnapshot): Promise<void> {
  await toInbox(delivered);
  await acceptPending();
}

async function received(): Promise<ReceivedOperationView[]> {
  return jsonBody<ReceivedOperationView[]>(await staff().get(OPERATIONS).expect(200));
}

const restrict = (body: Record<string, unknown>, key = "noel-2026") =>
  staff()
    .put(`${OPERATIONS}/${key}/override`)
    .send({ isHidden: false, orderUntil: null, audience: null, hiddenSkus: [], ...body });

describe("un envoi v11 accepté remplit le miroir", () => {
  it("écrit l'opération, sa sélection dans l'ordre, et le drapeau des articles", async () => {
    await deliverAndAccept(v11([noel()]));

    const [shown] = await received();
    expect(shown).toMatchObject({
      key: "noel-2026",
      name: { fr: "Noël", en: "Christmas" },
      lede: { fr: "La bûche revient" },
      pickupFrom: PICKUP_FROM,
      pickupUntil: PICKUP_UNTIL,
      audience: "both",
      skus: ["PAT-002-1", "VIE-001-1"],
      withdrawn: false,
      override: null,
    });
    const flags = await ctx.prisma.catalogItem.findMany({
      where: { sku: { in: ["PAT-002-1", "VIE-001-1"] } },
      select: { sku: true, operationOnly: true },
      orderBy: { sku: "asc" },
    });
    expect(flags).toEqual([
      { sku: "PAT-002-1", operationOnly: true },
      { sku: "VIE-001-1", operationOnly: false },
    ]);
  });

  /** D10 : « qu'était-il possible de commander le 20 décembre ? » doit avoir une réponse. */
  it("photographie les opérations avec la version posée", async () => {
    await deliverAndAccept(v11([noel()]));

    const version = await ctx.prisma.catalogVersion.findFirstOrThrow({
      select: { operations: true },
    });
    expect(version.operations).toEqual([
      expect.objectContaining({ key: "noel-2026", skus: ["PAT-002-1", "VIE-001-1"] }),
    ]);
  });

  /**
   * ⚠️ Le lecteur du lot 3 est posé, lu par personne encore : tant que la garde
   * n'existe pas, le drapeau ne restreint aucune vente. Il rend déjà la bonne
   * réponse.
   */
  it("sert au lecteur des vendeurs les opérations appliquées et les articles exclusifs", async () => {
    await deliverAndAccept(v11([noel()]));
    await restrict({ hiddenSkus: ["VIE-001-1"] }).expect(204);

    const reader = ctx.app.get(CatalogOperationsReader);

    expect((await reader.sellableOperations()).map((operation) => operation.skus)).toEqual([
      ["PAT-002-1"],
    ]);
    expect([...(await reader.operationOnlySkus())]).toEqual(["PAT-002-1"]);
  });
});

describe("un envoi suivant qui ne porte plus l'opération", () => {
  /**
   * 🔴 Le cœur de D9 : une clé ne se réemploie pas, et la surcharge garde son
   * parent. Un `DELETE` ici échouerait sur la clé étrangère de la surcharge —
   * ou, pire, l'emporterait avec lui.
   */
  it("la MARQUE retirée, sans rien supprimer, et garde sa surcharge", async () => {
    await deliverAndAccept(v11([noel()]));
    await restrict({ isHidden: true }).expect(204);

    await deliverAndAccept(v11([]));

    const [shown] = await received();
    expect(shown).toMatchObject({
      key: "noel-2026",
      withdrawn: true,
      skus: ["PAT-002-1", "VIE-001-1"],
      override: { isHidden: true },
    });
    expect(shown?.override?.decidedBy).not.toBeNull();
    // L'auteur est nommé, comme celui d'une décision d'article (lot 5).
    expect(shown?.override?.decidedByName).toBe("Opérateur E2E");
    expect(shown?.withdrawnAt).not.toBeNull();
    expect(await ctx.prisma.catalogOperationOverride.count()).toBe(1);
    expect(await ctx.app.get(CatalogOperationsReader).sellableOperations()).toEqual([]);
  });

  it("la remet en tenue quand un envoi la rapporte", async () => {
    await deliverAndAccept(v11([noel()]));
    await deliverAndAccept(v11([]));

    await deliverAndAccept(v11([noel()]));

    expect((await received())[0]).toMatchObject({ withdrawn: false, withdrawnAt: null });
  });
});

describe("un envoi v10 resté en file au déploiement", () => {
  /**
   * D10 : il se RELIT — le rendre illisible le ferait disparaître de l'écran —,
   * et se lit « aucune opération, aucun article exclusif ». Il marque donc
   * retirées les opérations tenues : voulu, sans danger, et dit au runbook.
   */
  it("se relit, s'accepte, et marque retirées les opérations tenues", async () => {
    await deliverAndAccept(v11([noel()]));
    await toInbox(v10());

    const pending = jsonBody<PendingDeliveryView>(await staff().get(DELIVERY).expect(200));
    expect(pending.changes).toEqual([
      expect.objectContaining({ sku: "PAT-002-1", fields: ["operationOnly"] }),
    ]);
    await acceptPending();

    expect((await received())[0]).toMatchObject({ key: "noel-2026", withdrawn: true });
    expect(
      await ctx.prisma.catalogItem.count({ where: { withdrawnAt: null, operationOnly: true } }),
    ).toBe(0);
  });
});

describe("la surcharge à la réception (D9)", () => {
  beforeEach(async () => {
    await deliverAndAccept(v11([noel()]));
  });

  it("ferme au plus tôt : une clôture plus précoce que le référentiel s'applique", async () => {
    await restrict({ orderUntil: EARLIER }).expect(204);

    const [shown] = await received();
    expect(shown?.effective.orderUntil).toBe(EARLIER);
    expect(shown?.orderUntil).toBe(ORDER_UNTIL);
  });

  /** Elle ne se confronte pas au référentiel : acceptée, et sans effet. */
  it("n'étend jamais : une clôture plus tardive s'enregistre et laisse celle du référentiel", async () => {
    await restrict({ orderUntil: LATER }).expect(204);

    expect((await received())[0]?.effective.orderUntil).toBe(ORDER_UNTIL);
  });

  it("restreint la clientèle en intersection, et retire les articles demandés", async () => {
    await restrict({ audience: "pro", hiddenSkus: ["PAT-002-1"] }).expect(204);

    expect((await received())[0]?.effective).toMatchObject({
      audience: "pro",
      skus: ["VIE-001-1"],
    });
  });

  it("rend « personne » quand le référentiel ne recouvre plus la restriction", async () => {
    await restrict({ audience: "pro" }).expect(204);

    await deliverAndAccept(v11([noel({ audience: "public" })]));

    expect((await received())[0]?.effective.audience).toBe("none");
  });

  it("journalise la décision au nom de l'opération", async () => {
    await restrict({ isHidden: true }).expect(204);
    await ctx.drain();

    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "catalog_operation.override_set" },
      select: { subjectId: true, payload: true },
    });
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      subjectId: "noel-2026",
      payload: { subjectLabel: "Noël", isHidden: true },
    });
  });

  it("refuse une opération jamais reçue — 404", async () => {
    await restrict({}, "paques-2027").expect(404);
  });

  it("refuse une forme fausse — 400, et rien n'est écrit", async () => {
    await restrict({ hiddenSkus: ["PAT-002-1", "PAT-002-1"] }).expect(400);
    await restrict({ audience: "tout-le-monde" }).expect(400);

    expect(await ctx.prisma.catalogOperationOverride.count()).toBe(0);
  });
});

describe("le mur d'accès — le droit du catalogue vendu", () => {
  beforeEach(async () => {
    await deliverAndAccept(v11([noel()]));
  });

  it("ouvre la lecture à qui lit le catalogue vendu, et lui ferme l'écriture", async () => {
    await ctx.asSub(ACCOUNTANT.sub).get(OPERATIONS).expect(200);
    await ctx
      .asSub(ACCOUNTANT.sub)
      .put(`${OPERATIONS}/noel-2026/override`)
      .send({ isHidden: true, orderUntil: null, audience: null, hiddenSkus: [] })
      .expect(403);

    expect(await ctx.prisma.catalogOperationOverride.count()).toBe(0);
  });

  it("ferme tout à qui n'a aucun droit sur le catalogue vendu", async () => {
    await ctx.asSub(COMMUNICATION.sub).get(OPERATIONS).expect(403);
  });

  it("refuse sans jeton", async () => {
    await ctx.http().get(OPERATIONS).expect(401);
  });
});
