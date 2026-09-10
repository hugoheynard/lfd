import { randomUUID } from "node:crypto";
/**
 * E2E du **lot de production** — ce que le labo imprime pour une journée.
 *
 * Une seule chose se prouve ici, et elle ne se prouve qu'avec du vrai SQL : une
 * fiche dit ce qui a été **convenu à la passation**, et rien d'autre. Le
 * carnet d'adresses peut bouger après coup — il bougera — sans qu'un bon déjà
 * parti en tournée se mette à dire autre chose que le papier.
 *
 * C'est un test de non-régression, pas de fonctionnalité : le code lisait le
 * carnet, et personne ne l'aurait vu avant qu'un client change son contact
 * entre la commande et la livraison.
 */
import type { ProductionBatchView } from "@lfd/contracts";

import { CustomerRole } from "../src/platform/database/client/client.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const MEMBER = "auth0|member";
const SERVICE_DAY = serviceDay();

/** Le contact que la société a renseigné sur son adresse, AVANT de commander. */
const CONTACT_DU_JOUR = { prenom: "Camille", nom: "Rousseau", telephone: "0142710844" };
/** Celui qu'elle mettra APRÈS — la fiche ne doit jamais le voir. */
const CONTACT_D_APRES = { prenom: "Yanis", nom: "Delorme", telephone: "0600000000" };

const SITE = {
  label: "Boutique",
  ligne1: "12 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

/** Signature du jeton staff doublée : le reste du mur admin est réel. */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

const fakeGateway = {
  createIntent: () => Promise.resolve({ paymentIntentId: "pi_e2e", clientSecret: "pi_e2e_secret" }),
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: PaymentGateway, value: fakeGateway },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** Sème une société active, son membre, sa zone, et son adresse de carnet. */
async function seedSociete(): Promise<{ companyId: string; addressId: string }> {
  const member = await createUser(ctx.prisma, { auth0Sub: MEMBER });
  const company = await createCompany(ctx.prisma, { status: "active" });
  await attachTo(ctx.prisma, member.id, company.id, CustomerRole.owner);
  await ctx.prisma.deliveryZone.create({
    data: { postalPrefixes: ["73150"], label: "Val d'Isère", feeMode: "amount", feeValue: 2000 },
  });
  const address = await ctx.prisma.address.create({
    data: {
      ...SITE,
      companyId: company.id,
      kind: "delivery",
      isDefault: true,
      deliverySpecs: {
        note: "",
        slots: { mode: "everyday", slot: null },
        deliveryContact: CONTACT_DU_JOUR,
        gps: null,
        signatureRequired: true,
      },
    },
    select: { id: true },
  });
  return { companyId: company.id, addressId: address.id };
}

async function batch(): Promise<ProductionBatchView> {
  const response = await ctx
    .asSub("staff-e2e")
    .get(`/admin/production/batch?date=${SERVICE_DAY}`)
    .expect(200);
  return jsonBody<ProductionBatchView>(response);
}

describe("la fiche de production lit ce qui a été convenu", () => {
  it("garde le contact de la commande même quand le carnet change APRÈS", async () => {
    const { companyId, addressId } = await seedSociete();

    await ctx
      .asSub(MEMBER)
      .post(`/orders`)
      .send({
        idempotencyKey: randomUUID(),
        companyId,
        requestedDeliveryDate: SERVICE_DAY,
        fulfillmentMethod: "delivery",
        deliveryAddress: SITE,
        deliveryAddressId: addressId,
        note: "",
        lines: [{ sku: "VIE-001", quantity: 2 }],
      })
      .expect(201);

    // Le client change son contact sur place — après avoir commandé.
    await ctx.prisma.address.update({
      where: { id: addressId },
      data: {
        deliverySpecs: {
          note: "",
          slots: { mode: "everyday", slot: null },
          deliveryContact: CONTACT_D_APRES,
          gps: null,
          signatureRequired: false,
        },
      },
    });

    const sheet = (await batch()).sheets[0];
    expect(sheet?.fulfillment.contact).toEqual({
      source: "order",
      name: "Camille Rousseau",
      phone: "0142710844",
    });
    // La signature aussi est figée : elle vaut pour ce qui part, pas pour le
    // réglage d'aujourd'hui.
    expect(sheet?.fulfillment.signatureRequired).toBe(true);
  });

  it("écrit « aucun contact » plutôt que d'aller en chercher un ailleurs", async () => {
    // Adresse dictée à la volée : rien de convenu, et la société n'a pas de
    // détenteur nommé. Le livreur doit le savoir avant de sonner.
    await createUser(ctx.prisma, { auth0Sub: MEMBER });
    await ctx.prisma.deliveryZone.create({
      data: { postalPrefixes: ["73150"], label: "Val d'Isère", feeMode: "amount", feeValue: 2000 },
    });

    await ctx
      .asSub(MEMBER)
      .post(`/orders`)
      .send({
        idempotencyKey: randomUUID(),
        companyId: null,
        requestedDeliveryDate: SERVICE_DAY,
        fulfillmentMethod: "delivery",
        deliveryAddress: SITE,
        note: "",
        lines: [{ sku: "VIE-001", quantity: 2 }],
      })
      .expect(201);

    const sheet = (await batch()).sheets[0];
    // Commande personnelle : pas de société, donc pas de détenteur à qui se
    // rabattre. La fiche le dit au lieu de laisser un blanc.
    expect(sheet?.fulfillment.contact).toBeNull();
    // Et elle porte son heure d'arrêt : sans elle, deux tirages du même jour
    // circulent au fournil sans qu'on puisse les distinguer.
    expect(sheet?.issuedAt).toBe(sheet?.placedAt);
    expect(sheet?.revision).toBe(0);
    expect(sheet?.fulfillment.signatureRequired).toBe(false);
  });
});

/**
 * Le **colisage** : le scan qui déclare une commande prête.
 *
 * Deux choses ne se prouvent qu'ici. La **course** — deux postes qui scannent la
 * même feuille au même moment ne doivent produire qu'un seul fait, et c'est la
 * base qui arbitre. Et le fait que la lecture se fasse par le **numéro**, qui
 * est imprimé en clair : rien à protéger, mais rien à deviner non plus.
 */
/**
 * Arrête la journée d'une commande, puis déclare son bac fait.
 *
 * 🔴 Le colisage est un fait de la PRODUCTION depuis le 2026-09-07 : il passe
 * par sa route, dans sa journée, et une commande qu'aucune clôture n'a inscrite
 * n'est pas colisable. Les blocs qui l'utilisaient comme un simple `POST` sur le
 * commerce doivent donc clôturer d'abord — ce que l'ancienne route, hébergée
 * chez le commerce, n'exigeait pas.
 */
async function closeAndPack(
  context: E2eContext,
  day: string,
  reference: string,
  expected = 201,
): Promise<void> {
  await context.asSub("staff-e2e").post(`/admin/production/batch/${day}/close`);
  await context
    .asSub("staff-e2e")
    .post(`/admin/production/batch/${day}/sheets/${reference}/packed`)
    .expect(expected);
}

describe("le colisage", () => {
  /** Passe une commande personnelle et rend son numéro. */
  async function placeOne(): Promise<string> {
    await createUser(ctx.prisma, { auth0Sub: MEMBER });
    await ctx.prisma.deliveryZone.create({
      data: { postalPrefixes: ["73150"], label: "Val d'Isère", feeMode: "amount", feeValue: 2000 },
    });
    const response = await ctx
      .asSub(MEMBER)
      .post(`/orders`)
      .send({
        idempotencyKey: randomUUID(),
        companyId: null,
        requestedDeliveryDate: SERVICE_DAY,
        fulfillmentMethod: "delivery",
        deliveryAddress: SITE,
        note: "",
        lines: [{ sku: "VIE-001", quantity: 2 }],
      })
      .expect(201);
    return jsonBody<{ orderNumber: string }>(response).orderNumber;
  }

  /**
   * Passe une commande ET arrête la journée.
   *
   * 🔴 Le colisage est désormais un fait de la PRODUCTION, et une commande
   * qu'aucune clôture n'a inscrite n'est pas à fabriquer aujourd'hui. Le
   * scénario du fournil commence donc à la clôture, ce que l'ancienne route —
   * hébergée par le commerce — n'exigeait pas.
   */
  async function placeAndClose(): Promise<string> {
    const reference = await placeOne();
    await ctx.asSub("staff-e2e").post(`/admin/production/batch/${SERVICE_DAY}/close`).expect(201);
    return reference;
  }

  /** Déclare le bac fait, par la route du fournil. */
  function packing(reference: string) {
    return ctx
      .asSub("staff-e2e")
      .post(`/admin/production/batch/${SERVICE_DAY}/sheets/${reference}/packed`);
  }

  /** Attend que le COMMERCE ait appris — il l'apprend par un abonné. */
  async function eventuallyReady(reference: string): Promise<string> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const row = await ctx.prisma.order.findUniqueOrThrow({
        where: { orderNumber: reference },
        select: { status: true },
      });
      if (row.status === "ready") {
        return row.status;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const last = await ctx.prisma.order.findUniqueOrThrow({
      where: { orderNumber: reference },
      select: { status: true },
    });
    return last.status;
  }

  it("grave le colisage CHEZ LA PRODUCTION, et le commerce l'apprend", async () => {
    // Les deux moitiés du couplage : le fournil ferme le bac et publie ; le
    // commerce s'abonne et fait avancer SON statut. Deux faits, deux tables.
    const reference = await placeAndClose();

    await packing(reference).expect(201);

    const packed = await ctx.prisma.productionOrder.findFirstOrThrow({
      where: { reference },
      select: { packedAt: true, packedBy: true },
    });
    expect(packed.packedAt).not.toBeNull();
    expect(packed.packedBy).toBe("staff-e2e");
    expect(await eventuallyReady(reference)).toBe("ready");
  });

  it("date la transition du COLISAGE, pas de sa réception", async () => {
    // L'abonné tourne un instant plus tard. Prendre l'heure à la réception
    // daterait la transition du moment où on l'a apprise, pas de celui où elle a
    // eu lieu — et c'est cette heure-là qu'on cherche quand une commande arrive
    // en retard.
    const reference = await placeAndClose();
    await packing(reference).expect(201);
    await eventuallyReady(reference);

    const packed = await ctx.prisma.productionOrder.findFirstOrThrow({
      where: { reference },
      select: { packedAt: true },
    });
    const order = await ctx.prisma.order.findUniqueOrThrow({
      where: { orderNumber: reference },
      select: { readyAt: true, readyBy: true },
    });
    expect(order.readyAt?.toISOString()).toBe(packed.packedAt?.toISOString());
    expect(order.readyBy).toBe("staff-e2e");
  });

  it("RÉANNONCE au second scan, sans toucher à l'attestation", async () => {
    // 🔴 Ce cas attendait un 409 jusqu'au 2026-09-08, et c'était le piège : le
    // bus vit en processus et n'est pas rejoué, donc un abonné qui échoue
    // laissait la commande en arrière POUR TOUJOURS — le refus fermait le seul
    // geste qui répare. Deux mains sur la même feuille est d'ailleurs le cas
    // normal au fournil.
    const reference = await placeAndClose();
    const first = jsonBody<{ packedAt: string; packedBy: string; alreadyPacked: boolean }>(
      await packing(reference).expect(201),
    );
    expect(first.alreadyPacked).toBe(false);

    const again = jsonBody<{ packedAt: string; packedBy: string; alreadyPacked: boolean }>(
      await packing(reference).expect(201),
    );

    expect(again.alreadyPacked).toBe(true);
    // L'heure et l'auteur restent ceux du PREMIER scan : c'est à ce moment-là
    // que le bac a été fermé, et une réannonce n'est pas un second colisage.
    expect(again.packedAt).toBe(first.packedAt);
    expect(again.packedBy).toBe(first.packedBy);
  });

  it("RATTRAPE un commerce resté en arrière, en rescannant la feuille", async () => {
    // Le scénario entier, joué : on colise, on remet la commande en arrière à la
    // main — ce que ferait un abonné mort en vol —, et on rescanne. Sans la
    // réannonce, il n'existait aucun moyen de la faire avancer.
    const reference = await placeAndClose();
    await packing(reference).expect(201);
    await eventuallyReady(reference);

    await ctx.prisma.order.update({
      where: { orderNumber: reference },
      data: { status: "confirmed", readyAt: null, readyBy: null },
    });

    await packing(reference).expect(201);

    expect(await eventuallyReady(reference)).toBe("ready");
  });

  it("REFUSE de coliser sur une journée qui n'est pas arrêtée", async () => {
    // Une commande qu'aucune clôture n'a inscrite n'est pas à fabriquer
    // aujourd'hui. Le refus dit le geste de sortie : clôturer d'abord.
    const reference = await placeOne();

    const refused = await packing(reference).expect(409);

    expect(jsonBody<{ message: string }>(refused).message).toContain("Clôturez le plan du soir");
  });

  it("REFUSE une référence qui n'est pas dans cette journée", async () => {
    await placeAndClose();

    const refused = await ctx
      .asSub("staff-e2e")
      .post(`/admin/production/batch/${SERVICE_DAY}/sheets/ORD-INEXISTANTE/packed`)
      .expect(404);

    expect(jsonBody<{ message: string }>(refused).message).toContain("Aucune feuille d'atelier");
  });

  it("ne produit QU'UN colisage quand deux postes scannent en même temps", async () => {
    // La course, la seule chose que le vrai SQL prouve : le `where packed_at IS
    // NULL` fait arbitrer la BASE, pas l'ordre d'arrivée des requêtes. Une
    // `load` → `save` de l'agrégat ne le pourrait pas — elle réécrit la journée
    // entière, et le second écrasement effacerait le premier.
    const reference = await placeAndClose();

    const results = await Promise.all([packing(reference), packing(reference)]);

    // Les deux répondent `201` depuis que le second scan réannonce ; ce qui les
    // distingue est `alreadyPacked`, et un seul peut le porter à `false`.
    const acks = results.map((response) =>
      jsonBody<{ packedAt: string; packedBy: string; alreadyPacked: boolean }>(response),
    );
    expect(acks.filter((ack) => !ack.alreadyPacked)).toHaveLength(1);

    // 🔴 Et surtout : les DEUX annoncent le même instant. Le perdant relit
    // l'attestation du gagnant plutôt que de publier la sienne — publier son
    // propre `now` daterait le bac d'un moment qui n'a rien fermé, et le
    // commerce recopierait cette heure-là.
    expect(acks[0]?.packedAt).toBe(acks[1]?.packedAt);
    expect(acks[0]?.packedBy).toBe(acks[1]?.packedBy);

    const row = await ctx.prisma.productionOrder.findFirstOrThrow({
      where: { reference },
      select: { packedAt: true },
    });
    expect(row.packedAt?.toISOString()).toBe(acks[0]?.packedAt);
  });

  it("lit la commande derrière le code AVANT de déclarer quoi que ce soit", async () => {
    const reference = await placeOne();

    const view = jsonBody<{ reference: string; totalUnits: number; blockedReason: null }>(
      await ctx.asSub("staff-e2e").get(`/admin/production/packing/${reference}`).expect(200),
    );

    expect(view.reference).toBe(reference);
    expect(view.totalUnits).toBe(2);
    expect(view.blockedReason).toBeNull();
  });

  it("répond 404 sur une feuille d'un autre jour, en nommant la cause probable", async () => {
    const refused = await ctx
      .asSub("staff-e2e")
      .get(`/admin/production/packing/ORD-INEXISTANTE`)
      .expect(404);

    expect(jsonBody<{ message: string }>(refused).message).toContain("autre jour");
  });
});

/**
 * **Les courriels partent-ils vraiment ?**
 *
 * Un abonné tourne hors de la requête : rien, dans la réponse HTTP, ne dit qu'un
 * courriel a été rendu. Un gabarit débranché du bus, un abonné oublié dans le
 * module, une dépendance qui ne se résout pas — trois pannes silencieuses que
 * seul le journal d'envois révèle.
 *
 * En e2e, aucune clé Resend n'est configurée : le mailer tourne à blanc. C'est
 * exactement ce qu'on veut ici — on éprouve que le message est **rendu et
 * journalisé**, pas qu'un tiers l'accepte.
 */
describe("les courriels d'une commande", () => {
  async function placeOne(): Promise<string> {
    await createUser(ctx.prisma, { auth0Sub: MEMBER, email: "camille@halles.test" });
    await ctx.prisma.deliveryZone.create({
      data: { postalPrefixes: ["73150"], label: "Val d'Isère", feeMode: "amount", feeValue: 2000 },
    });
    const point = await ctx.prisma.pickupAddress.create({
      data: { ...SITE, isDefault: true },
      select: { id: true },
    });
    const response = await ctx
      .asSub(MEMBER)
      .post(`/orders`)
      .send({
        idempotencyKey: randomUUID(),
        companyId: null,
        requestedDeliveryDate: SERVICE_DAY,
        fulfillmentMethod: "pickup",
        pickupAddressId: point.id,
        note: "",
        lines: [{ sku: "VIE-001", quantity: 2 }],
      })
      .expect(201);
    return jsonBody<{ orderNumber: string }>(response).orderNumber;
  }

  /**
   * Les gabarits journalisés, dans l'ordre où ils sont partis.
   *
   * On **draine d'abord** : un abonné tourne hors de la requête, et lire le
   * journal sans l'attendre le trouverait vide une fois sur deux — le pire genre
   * de rouge, intermittent et qui accuse le mauvais coupable.
   */
  async function templatesSent(): Promise<readonly string[]> {
    await ctx.drain();
    const rows = await ctx.prisma.mailSend.findMany({
      orderBy: { sentAt: "asc" },
      select: { template: true },
    });
    return rows.map((row) => row.template);
  }

  it("écrit au client À LA PASSATION", async () => {
    await placeOne();

    expect(await templatesSent()).toContain("customer.order-placed");
  });

  it("écrit à nouveau QUAND LA COMMANDE EST PRÊTE", async () => {
    // Le seul courriel qui parte à un moment où le client a quelque chose à
    // faire. Avant le 2026-09-07, il n'y en avait qu'un, et c'était le premier.
    const reference = await placeOne();
    await closeAndPack(ctx, SERVICE_DAY, reference);
    await ctx.drain();

    expect(await templatesSent()).toEqual(["customer.order-placed", "customer.order-ready"]);
  });

  it("n'écrit qu'UNE fois quand deux postes scannent en même temps", async () => {
    // La garantie ne vient pas de la clé d'idempotence — elle vient de
    // l'écriture conditionnée en base : un seul poste gagne, un seul publie.
    const reference = await placeOne();

    await ctx.asSub("staff-e2e").post(`/admin/production/batch/${SERVICE_DAY}/close`);
    await Promise.all([
      ctx
        .asSub("staff-e2e")
        .post(`/admin/production/batch/${SERVICE_DAY}/sheets/${reference}/packed`),
      ctx
        .asSub("staff-e2e")
        .post(`/admin/production/batch/${SERVICE_DAY}/sheets/${reference}/packed`),
    ]);
    await ctx.drain();

    const ready = (await templatesSent()).filter((name) => name === "customer.order-ready");
    expect(ready).toHaveLength(1);
  });
});

/**
 * **Le journal d'une commande** — le seul endroit append-only du système.
 *
 * L'attestation de colisage et celle de remise vivent sur la ligne de commande,
 * qui s'`UPDATE` : un avenant, un correctif, un script de rattrapage peuvent les
 * réécrire sans laisser de trace. Le journal les **double** — il ne les remplace
 * pas — et c'est lui qui reste quand la ligne a bougé.
 *
 * Ce que seul le vrai SQL prouve ici : que les faits atterrissent vraiment, et
 * qu'un second scan n'en fabrique pas un second.
 */
describe("le journal d'une commande", () => {
  async function placeAndReady(): Promise<string> {
    await createUser(ctx.prisma, { auth0Sub: MEMBER, email: "camille@halles.test" });
    const point = await ctx.prisma.pickupAddress.create({
      data: { ...SITE, isDefault: true },
      select: { id: true },
    });
    const placed = jsonBody<{ orderNumber: string }>(
      await ctx
        .asSub(MEMBER)
        .post(`/orders`)
        .send({
          idempotencyKey: randomUUID(),
          companyId: null,
          requestedDeliveryDate: SERVICE_DAY,
          fulfillmentMethod: "pickup",
          pickupAddressId: point.id,
          note: "",
          lines: [{ sku: "VIE-001", quantity: 2 }],
        })
        .expect(201),
    );
    return placed.orderNumber;
  }

  /** Les types journalisés, drainés d'abord — les abonnés tournent hors requête. */
  async function journalTypes(): Promise<readonly string[]> {
    await ctx.drain();
    const rows = await ctx.prisma.activityEvent.findMany({ select: { type: true } });
    return rows.map((row) => row.type).sort();
  }

  it("garde une trace du COLISAGE, que la ligne de commande peut perdre", async () => {
    const reference = await placeAndReady();
    await closeAndPack(ctx, SERVICE_DAY, reference);

    expect(await journalTypes()).toContain("order.ready");
  });

  it("garde une trace de la REMISE — la moitié qui manquait", async () => {
    // Avant le 2026-09-07 : la naissance d'une commande entrait au journal, sa
    // délivrance n'y entrait pas. On pouvait dire « ce client a commandé » et
    // jamais « ce client a reçu ».
    const reference = await placeAndReady();
    const order = await ctx.prisma.order.findUniqueOrThrow({
      where: { orderNumber: reference },
      select: { handoverToken: true },
    });
    await ctx
      .asSub("staff-e2e")
      .post(`/admin/handover/${order.handoverToken ?? ""}`)
      .expect(201);

    expect(await journalTypes()).toContain("order.handed_over");
  });

  it("FIGE qui a remis et quand, plutôt que de les rejoindre plus tard", async () => {
    // Un journal doit dire ce qui était vrai ce jour-là. Aller les chercher
    // ensuite donnerait ce qui est vrai aujourd'hui — exactement ce qu'on veut
    // pouvoir contredire.
    const reference = await placeAndReady();
    const order = await ctx.prisma.order.findUniqueOrThrow({
      where: { orderNumber: reference },
      select: { handoverToken: true },
    });
    await ctx
      .asSub("staff-e2e")
      .post(`/admin/handover/${order.handoverToken ?? ""}`)
      .expect(201);
    await ctx.drain();

    const [fact] = await ctx.prisma.activityEvent.findMany({
      where: { type: "order.handed_over" },
      select: { payload: true, subjectType: true },
    });
    expect(fact?.subjectType).toBe("user");
    expect(JSON.stringify(fact?.payload)).toContain("staff-e2e");
    expect(JSON.stringify(fact?.payload)).toContain(reference);
  });

  it("n'écrit QU'UN témoin quand deux postes scannent le même colisage", async () => {
    const reference = await placeAndReady();
    await ctx.asSub("staff-e2e").post(`/admin/production/batch/${SERVICE_DAY}/close`).expect(201);

    await Promise.all([
      ctx
        .asSub("staff-e2e")
        .post(`/admin/production/batch/${SERVICE_DAY}/sheets/${reference}/packed`),
      ctx
        .asSub("staff-e2e")
        .post(`/admin/production/batch/${SERVICE_DAY}/sheets/${reference}/packed`),
    ]);

    const ready = (await journalTypes()).filter((type) => type === "order.ready");
    expect(ready).toHaveLength(1);
  });
});

/**
 * **La clôture du plan du soir.** Ce que seul le vrai SQL prouve : que la
 * bascule porte sur la bonne JOURNÉE et sur les seules commandes qui n'ont pas
 * dépassé le stade — et qu'une seconde clôture ne défait rien.
 */
describe("le plan du soir", () => {
  async function place(day: string): Promise<string> {
    const point = await ctx.prisma.pickupAddress.findFirst({ select: { id: true } });
    const id =
      point?.id ??
      (await ctx.prisma.pickupAddress.create({ data: { ...SITE, isDefault: true } })).id;
    const placed = jsonBody<{ orderNumber: string }>(
      await ctx
        .asSub(MEMBER)
        .post(`/orders`)
        .send({
          idempotencyKey: randomUUID(),
          companyId: null,
          requestedDeliveryDate: day,
          fulfillmentMethod: "pickup",
          pickupAddressId: id,
          note: "",
          lines: [{ sku: "VIE-001", quantity: 1 }],
        })
        .expect(201),
    );
    return placed.orderNumber;
  }

  interface Closure {
    readonly absorbed: number;
    readonly alreadyClosed: boolean;
    readonly closedAt: string;
  }

  async function closePlan(day: string): Promise<Closure> {
    const response = await ctx
      .asSub("staff-e2e")
      .post(`/admin/production/batch/${day}/close`)
      .expect(201);
    return jsonBody<Closure>(response);
  }

  async function dayStatus(day: string): Promise<{
    readonly closedAt: string | null;
    readonly orders: number;
    readonly items: number;
    readonly pendingInCommerce: number;
    readonly packedBehind: number;
    readonly handedOverBehind: number;
  }> {
    return jsonBody(
      await ctx.asSub("staff-e2e").get(`/admin/production/batch/${day}/status`).expect(200),
    );
  }

  /**
   * Attend que le COMMERCE ait appris.
   *
   * 🔴 Il l'apprend désormais par un **abonné**, pas par l'appel : la production
   * publie `production.day_closed`, `b2b` s'abonne, et `BackgroundWork` porte la
   * promesse. La requête répond donc avant que `confirmed` ne soit écrit —
   * sonder est la seule façon honnête de tester ce chemin, et c'est le prix
   * assumé du couplage minimal.
   */
  async function eventuallyStatus(reference: string, expected: string): Promise<string> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const seen = await statusOf(reference);
      if (seen === expected) {
        return seen;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return statusOf(reference);
  }

  async function statusOf(reference: string): Promise<string> {
    const row = await ctx.prisma.order.findUniqueOrThrow({
      where: { orderNumber: reference },
      select: { status: true },
    });
    return row.status;
  }

  beforeEach(async () => {
    await createUser(ctx.prisma, { auth0Sub: MEMBER });
  });

  it("inscrit la journée chez la PRODUCTION, et le commerce l'apprend", async () => {
    // Les deux moitiés du couplage minimal, dans un seul cas : la production
    // écrit chez elle et publie ; le commerce s'abonne et écrit chez lui.
    const reference = await place(SERVICE_DAY);
    expect(await statusOf(reference)).toBe("placed");

    const closure = await closePlan(SERVICE_DAY);

    expect(closure.absorbed).toBe(1);
    expect(closure.alreadyClosed).toBe(false);
    const status = await dayStatus(SERVICE_DAY);
    expect(status.closedAt).toBe(closure.closedAt);
    expect(status.orders).toBe(1);
    expect(status.items).toBe(1);
    expect(await eventuallyStatus(reference, "confirmed")).toBe("confirmed");
  });

  it("RÉANNONCE une journée close sans recalculer son instantané", async () => {
    // Le rattrapage prévu : le bus vit en processus, donc un abonné qui échoue
    // laisse des commandes `placed` sur une journée close. Rejouer la clôture
    // republie le fait — mais le compte à produire, lui, ne bouge pas.
    await place(SERVICE_DAY);
    const first = await closePlan(SERVICE_DAY);

    const again = await closePlan(SERVICE_DAY);

    expect(again.alreadyClosed).toBe(true);
    expect(again.closedAt).toBe(first.closedAt);
    expect(again.absorbed).toBe(first.absorbed);
  });

  it("MONTRE la divergence quand le commerce a manqué le fait, et la referme", async () => {
    // Sans cette lecture, l'écart n'existerait que dans la tête de celui qui le
    // cherche. On simule l'abonné perdu en remettant la commande `placed`.
    const reference = await place(SERVICE_DAY);
    await closePlan(SERVICE_DAY);
    await eventuallyStatus(reference, "confirmed");

    await ctx.prisma.order.update({
      where: { orderNumber: reference },
      data: { status: "placed", confirmedAt: null },
    });
    expect((await dayStatus(SERVICE_DAY)).pendingInCommerce).toBe(1);

    await closePlan(SERVICE_DAY);

    expect(await eventuallyStatus(reference, "confirmed")).toBe("confirmed");
    expect((await dayStatus(SERVICE_DAY)).pendingInCommerce).toBe(0);
  });

  it("MONTRE un colisage que le commerce n'a pas appris, et le rescan le répare", async () => {
    // 🔴 Cette divergence-là ne se voyait NULLE PART avant le 2026-09-08 :
    // `pendingInCommerce` ne détecte qu'une clôture perdue. Le client restait
    // bloqué à « au fournil » et personne ne pouvait l'apprendre.
    const reference = await place(SERVICE_DAY);
    await closePlan(SERVICE_DAY);
    await eventuallyStatus(reference, "confirmed");
    await ctx
      .asSub("staff-e2e")
      .post(`/admin/production/batch/${SERVICE_DAY}/sheets/${reference}/packed`)
      .expect(201);
    await eventuallyStatus(reference, "ready");
    expect((await dayStatus(SERVICE_DAY)).packedBehind).toBe(0);

    // L'abonné mort en vol, simulé : le fournil a son bac, le commerce non.
    await ctx.prisma.order.update({
      where: { orderNumber: reference },
      data: { status: "confirmed", readyAt: null, readyBy: null },
    });
    expect((await dayStatus(SERVICE_DAY)).packedBehind).toBe(1);

    await ctx
      .asSub("staff-e2e")
      .post(`/admin/production/batch/${SERVICE_DAY}/sheets/${reference}/packed`)
      .expect(201);

    expect(await eventuallyStatus(reference, "ready")).toBe("ready");
    expect((await dayStatus(SERVICE_DAY)).packedBehind).toBe(0);
  });

  it("MONTRE une remise que le commerce n'a pas apprise, et le rescan la répare", async () => {
    // Le rescan d'une remise REFUSE — le sac est parti, il faut le dire — mais
    // republie quand même : le geste et la propagation sont deux questions.
    const reference = await place(SERVICE_DAY);
    await closePlan(SERVICE_DAY);
    await eventuallyStatus(reference, "confirmed");
    const order = await ctx.prisma.order.findUniqueOrThrow({
      where: { orderNumber: reference },
      select: { handoverToken: true },
    });
    const token = order.handoverToken ?? "";
    await ctx.asSub("staff-e2e").post(`/admin/handover/${token}`).expect(201);
    await eventuallyStatus(reference, "fulfilled");
    expect((await dayStatus(SERVICE_DAY)).handedOverBehind).toBe(0);

    await ctx.prisma.order.update({
      where: { orderNumber: reference },
      data: { status: "ready", handedOverAt: null, handedOverBy: null, handedOverVia: null },
    });
    expect((await dayStatus(SERVICE_DAY)).handedOverBehind).toBe(1);

    // Le refus part — et le fait est republié dans le même mouvement.
    await ctx.asSub("staff-e2e").post(`/admin/handover/${token}`).expect(409);

    expect(await eventuallyStatus(reference, "fulfilled")).toBe("fulfilled");
    expect((await dayStatus(SERVICE_DAY)).handedOverBehind).toBe(0);
  });

  it("ne compte AUCUN retard sur une journée qui n'est pas arrêtée", async () => {
    // Sur une journée ouverte, tout est normal : compter ferait passer la
    // normalité pour une anomalie, et la fenêtre des remises n'a pas de borne.
    const status = await dayStatus(serviceDay(9));

    expect(status).toMatchObject({ pendingInCommerce: 0, packedBehind: 0, handedOverBehind: 0 });
  });

  it("n'absorbe RIEN une seconde fois, et le dit plutôt que de refuser", async () => {
    // Une journée déjà basculée n'est pas une erreur : la règle d'état rend la
    // clôture idempotente sans qu'aucun garde ait été posé.
    await place(SERVICE_DAY);
    await closePlan(SERVICE_DAY);

    // 🔴 Ce cas attendait `0` : `absorbed` comptait ce que le COMMERCE venait de
    // basculer, donc zéro la seconde fois. Il compte désormais ce que la
    // PRODUCTION a inscrit — un instantané, qui ne change pas. Le « rien de
    // plus » se lit sur `alreadyClosed`, qui le dit explicitement.
    const again = await closePlan(SERVICE_DAY);
    expect(again.absorbed).toBe(1);
    expect(again.alreadyClosed).toBe(true);
  });

  it("ne touche pas les commandes d'une AUTRE journée", async () => {
    // Une seule commande suffit à le prouver, et c'est mieux ainsi : la
    // passerelle doublée rend une intention CONSTANTE, et deux commandes par
    // carte dans un même test se heurteraient sur l'unicité de l'intention
    // Stripe — un rouge qui n'aurait rien à voir avec le plan du soir.
    const reference = await place(SERVICE_DAY);

    // Une journée sans commande est REFUSÉE, plutôt qu'arrêtée à vide : écrire
    // « ce jour-là on a produit ceci » là où il n'y a rien eu ferait passer un
    // zéro pour une mesure.
    await ctx
      .asSub("staff-e2e")
      .post(`/admin/production/batch/${serviceDay(10)}/close`)
      .expect(409);
    expect(await statusOf(reference)).toBe("placed");
  });

  it("ne fait pas RECULER une commande déjà prête", async () => {
    // Les états ne reculent jamais : une commande colisée avant la clôture reste
    // `ready`, et le compte ne l'inclut pas.
    const reference = await place(SERVICE_DAY);
    await closeAndPack(ctx, SERVICE_DAY, reference);
    await ctx.drain();

    // Presser à nouveau le bouton de clôture est le RATTRAPAGE d'un abonné qui
    // aurait échoué : la journée se réannonce à l'identique. C'est précisément
    // le geste qui pourrait faire reculer une commande déjà colisée, puisque le
    // plan la porte toujours — l'abonné du commerce ne repose donc `confirmed`
    // que sur ce qui est encore `placed`.
    const again = jsonBody<{ alreadyClosed: boolean; absorbed: number }>(
      await ctx.asSub("staff-e2e").post(`/admin/production/batch/${SERVICE_DAY}/close`).expect(201),
    );
    expect(again.alreadyClosed).toBe(true);
    await ctx.drain();

    expect(await statusOf(reference)).toBe("ready");
  });

  it("date la bascule, pour qu'on sache quand la journée est partie", async () => {
    const reference = await place(SERVICE_DAY);
    await closePlan(SERVICE_DAY);
    await eventuallyStatus(reference, "confirmed");

    const row = await ctx.prisma.order.findUniqueOrThrow({
      where: { orderNumber: reference },
      select: { confirmedAt: true },
    });
    expect(row.confirmedAt).not.toBeNull();
  });
});

/**
 * **La remise en LIVRAISON, et son chemin de secours.**
 *
 * Avant le 2026-09-07, une commande en coursier restait `placed` pour toujours,
 * livrée ou non : le jeton n'était émis qu'en retrait, et `handoverBlocker` la
 * refusait d'emblée. C'était le dernier trou du parcours.
 */
describe("la remise en livraison", () => {
  async function placeDelivery(): Promise<string> {
    await createUser(ctx.prisma, { auth0Sub: MEMBER, email: "camille@halles.test" });
    await ctx.prisma.deliveryZone.create({
      data: { postalPrefixes: ["73150"], label: "Val d'Isère", feeMode: "amount", feeValue: 2000 },
    });
    const placed = jsonBody<{ orderNumber: string }>(
      await ctx
        .asSub(MEMBER)
        .post(`/orders`)
        .send({
          idempotencyKey: randomUUID(),
          companyId: null,
          requestedDeliveryDate: SERVICE_DAY,
          fulfillmentMethod: "delivery",
          deliveryAddress: SITE,
          note: "",
          lines: [{ sku: "VIE-001", quantity: 2 }],
        })
        .expect(201),
    );
    return placed.orderNumber;
  }

  it("ÉMET un jeton — une livraison en a un, désormais", async () => {
    const reference = await placeDelivery();

    const row = await ctx.prisma.order.findUniqueOrThrow({
      where: { orderNumber: reference },
      select: { handoverToken: true },
    });
    expect(row.handoverToken).not.toBeNull();
  });

  it("se remet par un SCAN — le destinataire montre, le coursier scanne", async () => {
    const reference = await placeDelivery();
    const row = await ctx.prisma.order.findUniqueOrThrow({
      where: { orderNumber: reference },
      select: { handoverToken: true },
    });

    const view = jsonBody<{ handedOverVia: string | null }>(
      await ctx
        .asSub("staff-e2e")
        .post(`/admin/handover/${row.handoverToken ?? ""}`)
        .expect(201),
    );

    expect(view.handedOverVia).toBe("scan");

    // Le statut du commerce est désormais TIRÉ du fait annoncé par le fournil,
    // donc il arrive après la réponse. C'est le prix du couplage minimal, et
    // c'est visible ici plutôt que caché derrière une écriture synchrone.
    await ctx.drain();
    const after = await ctx.prisma.order.findUniqueOrThrow({
      where: { orderNumber: reference },
      select: { status: true },
    });
    expect(after.status).toBe("fulfilled");
  });

  it("se remet À LA MAIN quand le scan est impossible, et le DIT", async () => {
    // Le cas qui ferait sinon enfreindre la règle de l'autoscan : le
    // destinataire n'a pas son courriel. Sans cette porte, quelqu'un imprimerait
    // le code sur le colis « pour les livraisons difficiles ».
    const reference = await placeDelivery();

    const view = jsonBody<{ handedOverVia: string | null; handedOverBy: string | null }>(
      await ctx.asSub("staff-e2e").post(`/admin/handover/manual/${reference}`).expect(201),
    );

    expect(view.handedOverVia).toBe("manual");
    expect(view.handedOverBy).toBe("staff-e2e");
  });

  it("ne confond PAS une remise saisie avec un scan", async () => {
    // Une attestation faible et honnête vaut mieux qu'une attestation forte et
    // fausse — encore faut-il pouvoir les distinguer, y compris au journal.
    const reference = await placeDelivery();
    await ctx.asSub("staff-e2e").post(`/admin/handover/manual/${reference}`).expect(201);
    await ctx.drain();

    const [fact] = await ctx.prisma.activityEvent.findMany({
      where: { type: "order.handed_over" },
      select: { payload: true },
    });
    expect(JSON.stringify(fact?.payload)).toContain('"via":"manual"');
  });

  it("REFUSE une seconde remise, quelle que soit la porte empruntée", async () => {
    const reference = await placeDelivery();
    await ctx.asSub("staff-e2e").post(`/admin/handover/manual/${reference}`).expect(201);

    await ctx.asSub("staff-e2e").post(`/admin/handover/manual/${reference}`).expect(409);
  });

  it("répond 404 sur un numéro inconnu, sans dire s'il a existé", async () => {
    await ctx.asSub("staff-e2e").post(`/admin/handover/manual/ORD-INCONNUE`).expect(404);
  });
});
