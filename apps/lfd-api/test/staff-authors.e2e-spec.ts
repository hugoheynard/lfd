/**
 * E2E de l'**auteur staff sous toutes ses formes** — plan
 * `documentation/staff/plan-l-auteur-est-la-fiche.md`, étape 1 (D4, D5.1).
 *
 * Seul le vrai Postgres le prouve : la table des `sub` est remplie par les
 * deux gestes qui relient un `sub` à une fiche (l'invitation, la première
 * entrée), dans la même écriture ; l'annuaire nomme pareil l'id de fiche, le
 * `sub` actuel et un `sub` ancien ; et le filtre du journal par personne ne
 * coupe pas son histoire entre ses identifiants.
 *
 * Doublés, et eux seuls : la signature du jeton, le fournisseur d'identité et
 * le courrier.
 */
import type { ActivityPageView, CreatedStaffUserResponse } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import type { StaffPrincipal } from "../src/platform/auth/staff-principal.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import {
  StaffAuthorDirectory,
  StaffAuthorReferences,
} from "../src/staff/directory/domain/staff-author-directory.js";
import { StaffIdentityPort } from "../src/staff/invitations/staff-identity.port.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";

/** Le jeton porte le `sub` ; celui de Colette atteste aussi son adresse. */
const COLETTE_SUB = "auth0|colette-premiere-entree";
const COLETTE_EMAIL = "colette@lfc.test";
const stubAdminVerifier = {
  verify: (token: string): Promise<StaffPrincipal> =>
    Promise.resolve({
      subject: token,
      scopes: [],
      email: token === COLETTE_SUB ? COLETTE_EMAIL : undefined,
      emailVerified: token === COLETTE_SUB ? true : undefined,
    }),
};

/**
 * Ouvre `auth0|<adresse>` — sauf pour Colette, dont l'ouverture échoue : sa
 * fiche reste sans lien, et c'est sa première connexion qui la reliera.
 */
const stubIdentity = {
  provision: (input: { email: string }): Promise<{ subject: string; passwordSetupUrl: string }> =>
    input.email === COLETTE_EMAIL
      ? Promise.reject(new Error("e2e : ouverture d'identité refusée"))
      : Promise.resolve({
          subject: `auth0|${input.email}`,
          passwordSetupUrl: "https://tenant.invalid/ticket/neuf",
        }),
  issuePasswordLink: (): Promise<string> => Promise.resolve("https://tenant.invalid/ticket/renvoi"),
  changeEmail: (): Promise<void> => Promise.resolve(),
};

const silentMailer = {
  enabled: true,
  send: (): Promise<{ providerId: null }> => Promise.resolve({ providerId: null }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: StaffIdentityPort, value: stubIdentity },
      { token: MAILER, value: silentMailer },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const operator = (): ReturnType<E2eContext["asSub"]> => ctx.asSub("staff-e2e");

async function createColleague(firstName: string, lastName: string, email: string) {
  const response = await operator()
    .post("/admin/staff-users")
    .send({ firstName, lastName, email, role: "commercial" })
    .expect(201);
  return jsonBody<CreatedStaffUserResponse>(response).id;
}

function aliasesOf(staffUserId: string) {
  return ctx.prisma.staffSubjectAlias.findMany({
    where: { staffUserId },
    select: { sub: true, source: true },
    orderBy: { sub: "asc" },
  });
}

/** Le `sub` que la création de Cécile a ouvert — l'ANCIEN, une fois réécrit. */
const OLD_SUB = "auth0|cecile@lfc.test";

/**
 * Une fiche qui a porté DEUX `sub` : celui que sa création a relié (gardé par
 * la table), puis un autre écrit dans `auth0_id`. La réécriture se fait à la
 * main parce que c'est de l'HISTOIRE — le résolveur la faisait sans condition
 * jusqu'au 2026-09-17, et c'est ce qui a laissé des actes sous un ancien `sub`.
 */
async function personWithTwoSubs(): Promise<string> {
  const id = await createColleague("Cécile", "Martin", "cecile@lfc.test");
  await ctx.prisma.staffUser.update({ where: { id }, data: { auth0Id: "auth0|actuel" } });
  return id;
}

describe("la table des `sub` — chaque liaison y laisse sa ligne", () => {
  it("l'invitation (à la création) inscrit le `sub` ouvert, et le renvoi n'en ajoute pas", async () => {
    const id = await createColleague("Sophie", "Bernard", "sophie@lfc.test");
    expect(await aliasesOf(id)).toEqual([{ sub: "auth0|sophie@lfc.test", source: "linked" }]);

    await operator().post(`/admin/staff-users/${id}/invitation`).expect(200);

    expect(await aliasesOf(id)).toEqual([{ sub: "auth0|sophie@lfc.test", source: "linked" }]);
  });

  it("la première entrée par l'adresse inscrit le `sub` qui s'est présenté", async () => {
    const id = await createColleague("Colette", "Petit", COLETTE_EMAIL);
    expect(await aliasesOf(id)).toEqual([]);

    await ctx.asSub(COLETTE_SUB).get("/admin/me").expect(200);

    expect(await aliasesOf(id)).toEqual([{ sub: COLETTE_SUB, source: "linked" }]);
  });

  it("un `sub` déjà inscrit garde sa fiche d'origine", async () => {
    // `ON CONFLICT DO NOTHING` : un `sub` ne change jamais de personne.
    await ctx.prisma.staffSubjectAlias.create({
      data: { sub: "auth0|sophie@lfc.test", staffUserId: "une-autre-fiche", source: "linked" },
    });

    await createColleague("Sophie", "Bernard", "sophie@lfc.test");

    await expect(
      ctx.prisma.staffSubjectAlias.findUniqueOrThrow({ where: { sub: "auth0|sophie@lfc.test" } }),
    ).resolves.toMatchObject({ staffUserId: "une-autre-fiche" });
  });

  it("refuse en base une provenance qui n'est ni `current` ni `linked`", async () => {
    await expect(
      ctx.prisma.staffSubjectAlias.create({
        data: { sub: "auth0|x", staffUserId: "fiche", source: "devine" },
      }),
    ).rejects.toThrow();
  });
});

describe("l'annuaire nomme l'auteur sous toutes ses formes", () => {
  it("nomme pareil l'id de fiche, le `sub` actuel et un `sub` ancien", async () => {
    const id = await personWithTwoSubs();

    const authors = await ctx.app
      .get(StaffAuthorDirectory)
      .identify([id, "auth0|actuel", OLD_SUB, "seed-pim", null]);

    expect(authors.nameOf(id)).toBe("Cécile Martin");
    expect(authors.nameOf("auth0|actuel")).toBe("Cécile Martin");
    expect(authors.nameOf(OLD_SUB)).toBe("Cécile Martin");
    // Un marqueur ne désigne personne : l'écran garde la valeur brute.
    expect(authors.nameOf("seed-pim")).toBeNull();
  });

  it("retrouve toutes les références d'une personne, depuis n'importe laquelle", async () => {
    const id = await personWithTwoSubs();
    const references = ctx.app.get(StaffAuthorReferences);

    const expected = [id, "auth0|actuel", OLD_SUB].sort();
    expect([...(await references.referencesOf(id))].sort()).toEqual(expected);
    expect([...(await references.referencesOf(OLD_SUB))].sort()).toEqual(expected);
    expect(await references.referencesOf("sonde")).toEqual(["sonde"]);
  });
});

describe("le journal filtré par personne ne coupe pas son histoire", () => {
  /** Un acte écrit par le passé sous l'une des formes de l'auteur. */
  async function actBy(actorId: string, key: string): Promise<void> {
    await ctx.prisma.activityEvent.create({
      data: {
        id: `staff-authors-${key}`,
        type: "staff_user.updated",
        occurredAt: new Date(daysAgo(2)),
        subjectType: "staff_user",
        subjectId: "une-fiche",
        actorType: "staff",
        actorId,
        actorName: null,
        actorRole: null,
        traceId: `trace-${key}`,
        idempotencyKey: `staff-authors:${key}`,
        payload: {},
      },
    });
  }

  async function actorsFilteredBy(actorId: string): Promise<readonly (string | null)[]> {
    const response = await operator().get("/admin/activity").query({ actorId }).expect(200);
    const events = jsonBody<ActivityPageView>(response).events;
    return events.map((event) => event.actorId).sort();
  }

  it("rend les actes sous l'id, le `sub` actuel et l'ancien — et ceux-là seuls", async () => {
    const id = await personWithTwoSubs();
    await actBy(id, "a");
    await actBy("auth0|actuel", "b");
    await actBy(OLD_SUB, "c");
    await actBy("auth0|quelqu-un-d-autre", "d");

    const expected = [id, "auth0|actuel", OLD_SUB].sort();
    expect(await actorsFilteredBy(id)).toEqual(expected);
    // Filtrer par un `sub` rend la même histoire : `actorId` reste servi.
    expect(await actorsFilteredBy(OLD_SUB)).toEqual(expected);
  });
});
