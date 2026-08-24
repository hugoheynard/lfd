/**
 * E2E des **pièces d'activation côté staff** (Porte B) : le commercial complète
 * une société **à la place** du client — KBIS, identité/TVA, condition de
 * règlement **convenue**, adresses.
 *
 * Ce que ces e2e éprouvent et que rien d'autre ne prouve : que ces mutations
 * passent **sans aucun membership** (le staff n'est membre de rien), écrivent la
 * vraie ligne SQL, et — pour le règlement — que fixer le terme convenu **solde**
 * la demande client. Une seule frontière doublée : le verifier **staff**
 * (`AdminTokenVerifier`). Le stockage objet est réel (MinIO, qui parle S3 comme
 * R2) : le KBIS déposé par le staff emprunte donc le même chemin, jusqu'aux
 * octets, que celui déposé par le client.
 */
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  AddressKind,
  CompanyStatus,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

const PDF = Buffer.from("%PDF-1.4\nfake kbis", "latin1");

/* Ce que le dossier doit contenir est écrit dans `activationGate`, pas en base :
   il n'y a plus rien à préparer côté configuration. */

/** Staff doublé : accepte n'importe quel jeton porteur comme staff synthétique. */
const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

let ctx: E2eContext;
let companyId: string;

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
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.pending });
  companyId = company.id;
});

/** Requête authentifiée en **staff** (le verifier doublé accepte le jeton). */
function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

/** Une livraison minimale valide. */
const delivery = {
  label: "Boutique",
  ligne1: "9 rue de la Roquette",
  ligne2: "",
  codePostal: "75011",
  ville: "Paris",
  pays: "France",
  isDefault: false,
  specs: { note: "", slots: { mode: "everyday", slot: null }, deliveryContact: null, gps: null },
};

describe("pièces d'activation staff (Porte B)", () => {
  it("dépose le KBIS sans membership", async () => {
    await staff()
      .put(`/admin/companies/${companyId}/kbis`)
      .attach("file", PDF, "kbis.pdf")
      .expect(204);

    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(company.kbisFileName).toBe("kbis.pdf");
    // Un nouveau dépôt n'est jamais certifié tant que le staff ne l'a pas revalidé.
    expect(company.kbisCertifiedAt).toBeNull();
  });

  it("édite l'identité souple (enseigne + TVA)", async () => {
    await staff()
      .patch(`/admin/companies/${companyId}/identity`)
      .send({ enseigne: "Le Comptoir", vatNumber: "FR32812456789" })
      .expect(204);

    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(company.enseigne).toBe("Le Comptoir");
    expect(company.vatNumber).toBe("FR32812456789");

    // Une pièce posée par le STAFF (Porte B) franchit aussi l'étape (câblage staff→growth).
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if ((await ctx.prisma.activityEvent.count({ where: { type: "company.step_reached" } })) > 0) {
        break;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
    }
    const [step] = await ctx.prisma.activityEvent.findMany({
      where: { type: "company.step_reached" },
    });
    expect(step!.idempotencyKey).toBe(`company.step_reached:vat:${companyId}`);
    expect(step!.payload).toMatchObject({ step: "vat" });
  });

  it("fixe le règlement CONVENU et solde la demande client", async () => {
    // Le client a demandé le mensuel ; le staff l'accorde → convenu écrit,
    // demande soldée (il a tranché, il n'y a plus rien « en attente »).
    await ctx.prisma.company.update({
      where: { id: companyId },
      data: { requestedTerm: DeferredTerm.monthly },
    });

    await staff()
      .patch(`/admin/companies/${companyId}/granted-terms`)
      .send({ grantedTerms: ["monthly"] })
      .expect(204);

    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    // Cumulatif : accorder n'est pas remplacer, et payer à la commande reste
    // possible de toute façon.
    expect(company.grantedTerms).toEqual([DeferredTerm.monthly]);
    expect(company.requestedTerm).toBeNull();
  });

  it("REFUSE un terme qui n'existe plus (60 / 90 jours)", async () => {
    // Le contrat est la porte : un terme retiré du modèle ne doit pas pouvoir
    // rentrer par l'API, sans quoi la base porterait un crédit que plus rien ne
    // sait recouvrer.
    await staff()
      .patch(`/admin/companies/${companyId}/granted-terms`)
      .send({ grantedTerms: ["net60"] })
      .expect(400);
  });

  it("enregistre l'adresse de facturation", async () => {
    await staff()
      .patch(`/admin/companies/${companyId}/billing-address`)
      .send({
        label: "Siège",
        ligne1: "18 rue des Archives",
        ligne2: "",
        codePostal: "75004",
        ville: "Paris",
        pays: "France",
      })
      .expect(204);

    const address = await ctx.prisma.address.findFirst({
      where: { companyId, kind: AddressKind.facturation },
    });
    expect(address?.ligne1).toBe("18 rue des Archives");
  });

  it("ajoute une adresse de livraison et renvoie son id", async () => {
    const response = await staff()
      .post(`/admin/companies/${companyId}/delivery-addresses`)
      .send(delivery)
      .expect(201);

    expect(response.body).toHaveProperty("id");
    const count = await ctx.prisma.address.count({
      where: { companyId, kind: AddressKind.livraison },
    });
    expect(count).toBe(1);
  });
});

describe("activation d'un compte (gate serveur)", () => {
  it("refuse l'activation si des pièces requises manquent (409)", async () => {
    // Défauts : vat + billing requises. La société pending n'a ni l'une ni l'autre.
    const response = await staff().post(`/admin/companies/${companyId}/activate`);
    expect(response.status).toBe(409);

    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(company.status).toBe(CompanyStatus.pending);
  });

  it("active quand les pièces requises sont présentes (kbis/livraison non requis)", async () => {
    // TVA renseignée + facturation présente ; KBIS optionnel et livraison cachée
    // par défaut ⇒ non requis. L'activation doit passer.
    await ctx.prisma.company.update({
      where: { id: companyId },
      // Un numéro joignable : sans lui, l'agrégat refuse d'activer — un livreur
      // qui cherche une porte doit pouvoir appeler quelqu'un.
      data: { vatNumber: "FR32812456789", contactTelephone: "01 42 71 08 44" },
    });
    await ctx.prisma.address.create({
      data: {
        companyId,
        kind: AddressKind.facturation,
        label: "Siège",
        ligne1: "18 rue des Archives",
        codePostal: "75004",
        ville: "Paris",
        pays: "France",
      },
    });

    await staff().post(`/admin/companies/${companyId}/activate`).expect(204);

    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(company.status).toBe(CompanyStatus.active);
    expect(company.activatedAt).not.toBeNull();
  });

  it("refuse d'activer un compte déjà actif (409)", async () => {
    await ctx.prisma.company.update({
      where: { id: companyId },
      data: { status: CompanyStatus.active },
    });
    const response = await staff().post(`/admin/companies/${companyId}/activate`);
    expect(response.status).toBe(409);
  });
});

describe("préférence d'acheminement", () => {
  it("retient le point de retrait préféré", async () => {
    const pickup = await ctx.prisma.pickupAddress.create({
      data: {
        label: "Labo Bastille",
        ligne1: "3 rue de la Roquette",
        codePostal: "75011",
        ville: "Paris",
        pays: "France",
      },
      select: { id: true },
    });

    await staff()
      .patch(`/admin/companies/${companyId}/fulfillment-preference`)
      .send({ method: "pickup", pickupAddressId: pickup.id })
      .expect(204);

    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(company.preferredFulfillmentMethod).toBe("pickup");
    expect(company.preferredPickupAddressId).toBe(pickup.id);
  });

  it("REFUSE l'adresse d'une AUTRE société", async () => {
    // Sans ce contrôle, un identifiant recopié ferait pointer la préférence d'un
    // client sur l'adresse d'un autre — la commande partirait chez le voisin.
    const other = await createCompany(ctx.prisma, { siret: "" });
    const foreign = await ctx.prisma.address.create({
      data: {
        companyId: other.id,
        kind: AddressKind.livraison,
        label: "Chez le voisin",
        ligne1: "1 rue Ailleurs",
        codePostal: "75001",
        ville: "Paris",
        pays: "France",
      },
      select: { id: true },
    });

    await staff()
      .patch(`/admin/companies/${companyId}/fulfillment-preference`)
      .send({ method: "delivery", deliveryAddressId: foreign.id })
      .expect(404);

    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(company.preferredFulfillmentMethod).toBeNull();
  });

  it("accepte une méthode sans adresse — « le défaut du moment »", async () => {
    await staff()
      .patch(`/admin/companies/${companyId}/fulfillment-preference`)
      .send({ method: "delivery" })
      .expect(204);

    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(company.preferredFulfillmentMethod).toBe("delivery");
    expect(company.preferredDeliveryAddressId).toBeNull();
  });

  it("fait RETOMBER la préférence sur le défaut quand le point de retrait disparaît", async () => {
    // `SET NULL` plutôt que `RESTRICT` : supprimer un labo ne doit pas être
    // interdit parce qu'une société le préfère, ni laisser un pointeur mort.
    const pickup = await ctx.prisma.pickupAddress.create({
      data: {
        label: "Labo éphémère",
        ligne1: "9 rue Passagère",
        codePostal: "75011",
        ville: "Paris",
        pays: "France",
      },
      select: { id: true },
    });
    await staff()
      .patch(`/admin/companies/${companyId}/fulfillment-preference`)
      .send({ method: "pickup", pickupAddressId: pickup.id })
      .expect(204);

    await ctx.prisma.pickupAddress.delete({ where: { id: pickup.id } });

    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(company.preferredFulfillmentMethod).toBe("pickup");
    expect(company.preferredPickupAddressId).toBeNull();
  });
});

describe("certification du KBIS", () => {
  it("refuse de certifier ce qui n'a pas été déposé (404), rien n'est écrit", async () => {
    // Le clic n'existe que s'il y a un document à ouvrir. Certifier à blanc
    // produirait un compte activable dont personne n'a jamais vu l'extrait.
    const response = await staff().post(`/admin/companies/${companyId}/kbis/certification`);
    expect(response.status).toBe(404);

    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(company.kbisCertifiedAt).toBeNull();
  });

  it("SERT l'extrait au staff — sans quoi certifier serait un clic à l'aveugle", async () => {
    // La garantie d'activation repose sur « un agent a lu ce document ». Encore
    // faut-il qu'il puisse l'ouvrir depuis la fiche.
    await staff()
      .put(`/admin/companies/${companyId}/kbis`)
      .attach("file", PDF, "k.pdf")
      .expect(204);

    const response = await staff().get(`/admin/companies/${companyId}/kbis`).expect(200);

    expect(response.headers["content-disposition"]).toContain("k.pdf");
    // `response.body` est bien un Buffer (réponse binaire), mais supertest le
    // type `any` : on le nomme avant de le lire plutôt que d'enchaîner des
    // appels sur une valeur dont le compilateur ne sait rien.
    const served = response.body as Buffer;
    expect(served.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("répond 404 quand il n'y a aucun extrait à servir", async () => {
    await staff().get(`/admin/companies/${companyId}/kbis`).expect(404);
  });

  it("certifie un extrait déposé, et GARDE qui l'a fait", async () => {
    await staff()
      .put(`/admin/companies/${companyId}/kbis`)
      .attach("file", PDF, "k.pdf")
      .expect(204);
    await staff().post(`/admin/companies/${companyId}/kbis/certification`).expect(204);

    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(company.kbisCertifiedAt).not.toBeNull();
    expect(company.kbisCertifiedBySub).toBe("staff-e2e");
  });

  it("un NOUVEAU dépôt décertifie — la trace ne survit pas au fichier qu'elle visait", async () => {
    await staff()
      .put(`/admin/companies/${companyId}/kbis`)
      .attach("file", PDF, "k.pdf")
      .expect(204);
    await staff().post(`/admin/companies/${companyId}/kbis/certification`).expect(204);

    await staff()
      .put(`/admin/companies/${companyId}/kbis`)
      .attach("file", PDF, "k2.pdf")
      .expect(204);

    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(company.kbisCertifiedAt).toBeNull();
    expect(company.kbisCertifiedBySub).toBeNull();
  });

  it("se retire — un clic de trop doit pouvoir se défaire", async () => {
    await staff()
      .put(`/admin/companies/${companyId}/kbis`)
      .attach("file", PDF, "k.pdf")
      .expect(204);
    await staff().post(`/admin/companies/${companyId}/kbis/certification`).expect(204);

    await staff().delete(`/admin/companies/${companyId}/kbis/certification`).expect(204);

    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(company.kbisCertifiedAt).toBeNull();
  });

  it("n'attend PAS le KBIS pour activer — mais le dit non vérifié", async () => {
    // La vérification est une convention interne : on veut voir l'extrait, on
    // ne perd pas la commande de demain matin pour un PDF. Elle ne tient donc
    // plus la porte — c'est le signal côté liste qui la réclame.
    await ctx.prisma.company.update({
      where: { id: companyId },
      data: { vatNumber: "FR32812456789", contactTelephone: "01 42 71 08 44" },
    });
    await ctx.prisma.address.create({
      data: {
        companyId,
        kind: AddressKind.facturation,
        label: "Siège",
        ligne1: "18 rue des Archives",
        codePostal: "75004",
        ville: "Paris",
        pays: "France",
      },
    });
    await staff()
      .put(`/admin/companies/${companyId}/kbis`)
      .attach("file", PDF, "k.pdf")
      .expect(204);

    await staff().post(`/admin/companies/${companyId}/activate`).expect(204);

    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(company.status).toBe(CompanyStatus.active);
    // Ouvrir la commande à un client est un ENGAGEMENT : il se signe.
    expect(company.activatedAt).not.toBeNull();
    expect(company.activatedBySub).toBe("staff-e2e");
  });

  it("retirer la vérification NE COUPE PAS l'accès", async () => {
    // C'était l'inverse, et c'était incohérent : REMPLACER un extrait
    // décertifiait déjà sans suspendre. Deux gestes menant au même état ne
    // peuvent pas avoir deux conséquences — et couper la commande d'une
    // boulangerie pour un PDF coûte plus que ça ne protège.
    await activatedCompany();

    await staff().delete(`/admin/companies/${companyId}/kbis/certification`).expect(204);

    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(company.status).toBe(CompanyStatus.active);
    expect(company.suspensionCause).toBeNull();
    // La vérification, elle, est bien tombée : c'est ce que le signal réclamera.
    expect(company.kbisCertifiedAt).toBeNull();
  });

  it("le REMPLACEMENT d'un extrait décertifie, sans couper non plus", async () => {
    // L'autre chemin vers le même état. Il est ouvert au client sur sa propre
    // société : s'il coupait, un dépôt maladroit fermerait son compte.
    await activatedCompany();

    await staff()
      .put(`/admin/companies/${companyId}/kbis`)
      .attach("file", PDF, "k2.pdf")
      .expect(204);

    const company = await ctx.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    expect(company.status).toBe(CompanyStatus.active);
    expect(company.kbisCertifiedAt).toBeNull();
  });

  it("écrit la vérification ET son retrait au JOURNAL", async () => {
    // L'état courant ne garde rien d'une certification retirée : la fiche
    // redevient « déposé, pas vérifié ». Sans ces lignes, plus personne ne
    // saurait le lendemain qu'elle a existé, ni qui l'a retirée.
    await activatedCompany();
    await staff().delete(`/admin/companies/${companyId}/kbis/certification`).expect(204);
    // Les abonnés du journal tournent HORS de la requête HTTP. `drain()` les
    // couvre désormais : ils s'inscrivent au travail de fond.
    await ctx.drain();
    const journal = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: companyId, type: { startsWith: "company.kbis_" } },
      orderBy: { occurredAt: "asc" },
      select: { type: true, actorId: true, payload: true },
    });
    expect(journal.map((entry) => entry.type)).toEqual([
      "company.kbis_certified",
      "company.kbis_revoked",
    ]);
    // Nominatif : « un membre du staff » n'engage personne.
    expect(journal[0]?.actorId).toBe("staff-e2e");
    // Plus aucun retrait ne suspend : le journal le dit aussi.
    expect(journal[1]?.payload).toMatchObject({ suspended: false });
  });

  /** Un compte actif, pièces réunies et extrait vérifié — le point de départ. */
  async function activatedCompany(): Promise<void> {
    await ctx.prisma.company.update({
      where: { id: companyId },
      data: { vatNumber: "FR32812456789", contactTelephone: "01 42 71 08 44" },
    });
    await ctx.prisma.address.create({
      data: {
        companyId,
        kind: AddressKind.facturation,
        label: "Siège",
        ligne1: "18 rue des Archives",
        codePostal: "75004",
        ville: "Paris",
        pays: "France",
      },
    });
    await staff()
      .put(`/admin/companies/${companyId}/kbis`)
      .attach("file", PDF, "k.pdf")
      .expect(204);
    await staff().post(`/admin/companies/${companyId}/kbis/certification`).expect(204);
    await staff().post(`/admin/companies/${companyId}/activate`).expect(204);
  }
});
