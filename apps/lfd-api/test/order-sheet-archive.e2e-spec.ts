import { randomUUID } from "node:crypto";
/**
 * E2E de l'**archivage du bon de commande** — sur un vrai MinIO, pas une `Map`.
 *
 * ## Pourquoi cette suite existe
 *
 * Le rangement du bon est **best-effort** : un stockage muet ne doit pas priver
 * un client de son document. C'est la bonne conduite, et c'est aussi ce qui
 * rendait le chemin INVISIBLE — `R2_CUSTOMERS_*` n'était posé nulle part dans
 * les tests, le `save` échouait en silence, et aucune suite ne rougissait. On
 * avait un handler dont personne n'avait jamais exécuté la moitié utile.
 *
 * ## Ce que seul le vrai stockage prouve
 *
 * - que la clé composée avec des `/` range vraiment sous son préfixe ;
 * - que le document est **relu** au second téléchargement, et non refabriqué —
 *   c'est toute la raison d'archiver : le papier parti du comptoir est un fait,
 *   et un avenant ne doit pas réécrire ce que le client a dans la poche ;
 * - que le bon atterrit dans le bucket `customers` et **pas** dans celui des
 *   KBIS. Cette confusion a existé : la première version du handler écrivait les
 *   bons chez les pièces d'identité, avec leurs clés. Aucun test ne pouvait le
 *   voir tant que les deux usages partageaient un bucket.
 */
import type { BillingAddressPayload, PlacedOrderResponse } from "@lfd/contracts";

import { CustomerRole } from "../src/platform/database/client/client.js";
import { DocumentStorageUnavailableError } from "../src/platform/shared/errors/storage-errors.js";
import { CustomerDocumentStore } from "../src/platform/storage/customer-document-store.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { deleteStorageObject, putStorageObject, storageKeys } from "./storage.js";

const CLIENT = "auth0|client";

/** Passerelle doublée : un e2e n'a pas à joindre Stripe. */
const fakeGateway = {
  createIntent: () => Promise.resolve({ paymentIntentId: "pi_e2e", clientSecret: "pi_e2e_secret" }),
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [{ token: PaymentGateway, value: fakeGateway }] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const SERVICE_DAY = serviceDay();

const LABO: BillingAddressPayload = {
  label: "Labo",
  ligne1: "5 rue du Four",
  ligne2: "",
  codePostal: "75002",
  ville: "Paris",
  pays: "France",
};

/** Une commande retrait passée par le client, et l'identifiant qu'elle rend. */
async function placeOrder(): Promise<PlacedOrderResponse> {
  const user = await createUser(ctx.prisma, { auth0Sub: CLIENT });
  const company = await createCompany(ctx.prisma, { status: "active" });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  const point = await ctx.prisma.pickupAddress.create({
    data: { ...LABO, isDefault: true },
    select: { id: true },
  });

  return jsonBody<PlacedOrderResponse>(
    await ctx
      .asSub(CLIENT)
      .post("/orders")
      .send({
        companyId: company.id,
        idempotencyKey: randomUUID(),
        pickupAddressId: point.id,
        requestedDeliveryDate: SERVICE_DAY,
        fulfillmentMethod: "pickup",
        note: "",
        lines: [{ sku: "VIE-001", quantity: 3 }],
      })
      .expect(201),
  );
}

/** Télécharge le bon et rend ses octets — `supertest` les rend en `Buffer`. */
async function downloadBon(orderId: string): Promise<Buffer> {
  const response = await ctx
    .asSub(CLIENT)
    .get(`/orders/${orderId}/bon.pdf`)
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => callback(null, Buffer.concat(chunks)));
    })
    .expect(200);
  return response.body as Buffer;
}

describe("le bon de commande s'archive", () => {
  it("n'écrit RIEN à la passation — le rangement se fait au téléchargement", async () => {
    // Le pari du handler : l'immense majorité des commandes ne verra jamais son
    // PDF demandé. Fabriquer à la passation en produirait un pour chacune.
    await placeOrder();

    expect(await storageKeys("customers")).toEqual([]);
  });

  it("range le bon au PREMIER téléchargement, sous la clé de sa révision", async () => {
    const placed = await placeOrder();

    await downloadBon(placed.id);

    // La révision est DANS le nom de fichier, et pas seulement dans le
    // document : le port dit qu'« une même clé écrase », donc un chemin sans
    // révision ferait disparaître, au premier avenant, le PDF qui circule déjà.
    expect(await storageKeys("customers")).toEqual([`orders/${placed.id}/bon-de-commande-r0.pdf`]);
  });

  it("ne range RIEN dans les autres usages — chaque usage a son bucket", async () => {
    // Régression : la première version du handler prenait `DocumentStore` (les
    // pièces que le CLIENT nous donne) au lieu de `CustomerDocumentStore`. Les
    // bons partaient donc chez les KBIS, avec leurs clés, ce qui défaisait
    // l'isolation que la configuration établit — « un jeton n'ouvre que le
    // sien ». Ça ne se voyait nulle part.
    const placed = await placeOrder();

    await downloadBon(placed.id);

    expect(await storageKeys("kbis")).toEqual([]);
    // `production` porte ce qui documente NOTRE travail, et n'a encore aucun
    // écrivain. L'assertion n'est donc pas creuse : elle tient qu'un bon de
    // commande — une pièce opposable, qui porte des montants — ne dérive pas
    // vers un bucket dont la rétention se compte en semaines.
    expect(await storageKeys("production")).toEqual([]);
  });

  it("RELIT l'archive au second téléchargement plutôt que de refabriquer", async () => {
    const placed = await placeOrder();
    const first = await downloadBon(placed.id);

    const second = await downloadBon(placed.id);

    // Ce que ce cas tient est étroit, et il faut le dire : le rendu étant
    // déterministe, l'égalité des octets serait vraie même si la route
    // refabriquait à chaque fois. Ce qu'il prouve, c'est qu'un second
    // téléchargement ne crée pas une SECONDE clé. La relecture, elle, est
    // établie par le cas suivant.
    expect(second.equals(first)).toBe(true);
    expect(await storageKeys("customers")).toHaveLength(1);
  });

  it("sert les octets ARCHIVÉS, même s'ils ne sont plus ceux qu'on fabriquerait", async () => {
    const placed = await placeOrder();
    const original = await downloadBon(placed.id);
    const key = `orders/${placed.id}/bon-de-commande-r0.pdf`;

    // On substitue des octets DIFFÉRENTS sous la même clé. Si la route les rend,
    // elle lit l'archive ; si elle rend l'original, elle refabrique — et alors
    // le document qu'un client a dans la poche n'est garanti par rien.
    const altered = Buffer.concat([original, Buffer.from("\n% marqueur\n")]);
    await putStorageObject("customers", key, altered);

    const served = await downloadBon(placed.id);

    expect(served.equals(altered)).toBe(true);
    expect(served.equals(original)).toBe(false);
  });

  it("sert le bon même si le stockage refuse — un client ne paie pas notre panne", async () => {
    // Régression : le handler rattrapait TOUTE erreur de lecture, ce qui rendait
    // un stockage cassé indiscernable d'une pièce pas encore archivée. Le
    // rattrapage est désormais étroit — l'indisponibilité seulement, journalisée
    // en ERREUR par l'adaptateur avant d'arriver ici — mais il doit RESTER : en
    // production `R2_CUSTOMERS_*` peut être absent, et un défaut de
    // configuration ne regarde pas le client.
    const placed = await placeOrder();
    const usable = await downloadBon(placed.id);

    // Remplacement à la main plutôt qu'un espion : l'instance est celle que Nest
    // a injectée, et la rendre à son état dans un `finally` garantit qu'un échec
    // d'assertion ne laisse pas le stockage cassé pour le test suivant.
    const store = ctx.app.get(CustomerDocumentStore);
    const original = store.readIfPresent.bind(store);
    store.readIfPresent = () =>
      Promise.reject(new DocumentStorageUnavailableError("stockage indisponible (cas de test)"));

    try {
      const served = await downloadBon(placed.id);
      expect(served.equals(usable)).toBe(true);
    } finally {
      store.readIfPresent = original;
    }
  });

  it("refabrique à l'identique quand l'archive a disparu", async () => {
    // La propriété sur laquelle repose TOUTE l'absence de verrou : deux
    // téléchargements simultanés entrent tous les deux dans la branche « la clé
    // manque » et écrivent tous les deux. C'est sans conséquence parce que le
    // rendu est déterministe — le second `save` écrase le premier par un objet
    // identique, et peu importe qui gagne.
    const placed = await placeOrder();
    const first = await downloadBon(placed.id);

    await deleteStorageObject("customers", `orders/${placed.id}/bon-de-commande-r0.pdf`);
    const refabricated = await downloadBon(placed.id);

    expect(refabricated.equals(first)).toBe(true);
  });
});
