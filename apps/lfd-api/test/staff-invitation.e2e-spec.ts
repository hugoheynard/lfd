/**
 * E2E de **l'invitation staff** : le parcours qui fait entrer quelqu'un dans
 * l'équipe.
 *
 * Les décisions de la tranche 6 sont testées unitairement au niveau du handler,
 * avec des doubles. Ici on les traverse pour de vrai — la route, le mur, le
 * repository, la base — parce que c'est le seul niveau où l'on voit ce qui est
 * réellement **écrit** : le statut, la date, la liaison d'identité.
 *
 * Le fournisseur d'identité, lui, reste un double : appeler Auth0 depuis une
 * suite de tests créerait de vraies identités dans un vrai tenant. La preuve
 * du chaînon réel est un geste manuel, décrit dans
 * `documentation/b2b/architecture-acces-staff.md` §13.
 */
import type { CreatedStaffUserResponse, StaffUserView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { StaffIdentityPort } from "../src/staff/invitations/staff-identity.port.js";
import { INVITATION_LIFETIME_DAYS } from "../src/platform/shared/invitation/invitation-expiry.js";
import { bootstrapE2e, E2E_STAFF_EMAIL, jsonBody, type E2eContext } from "./e2e-harness.js";

/**
 * Le jeton **est** le `sub` : c'est ce qui permet à une même suite de parler
 * tantôt comme l'opérateur, tantôt comme quelqu'un d'autre. Un stub qui rendrait
 * toujours le même sujet ferait passer les tests de refus pour la mauvaise
 * raison — l'appelant serait admin sans qu'on le voie.
 */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

/** Ce que le double d'identité a fait — on veut pouvoir l'affirmer. */
const calls: { provisioned: string[]; relinked: string[] } = { provisioned: [], relinked: [] };

const stubIdentity = {
  provision: (input: { email: string }): Promise<{ subject: string; passwordSetupUrl: string }> => {
    calls.provisioned.push(input.email);
    return Promise.resolve({
      subject: `auth0|${input.email}`,
      passwordSetupUrl: "https://tenant.invalid/ticket/neuf",
    });
  },
  issuePasswordLink: (subject: string): Promise<string> => {
    calls.relinked.push(subject);
    return Promise.resolve("https://tenant.invalid/ticket/renvoi");
  },
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: StaffIdentityPort, value: stubIdentity },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  calls.provisioned = [];
  calls.relinked = [];
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub("staff-e2e");

async function createColleague(email = "sophie@lfc.test"): Promise<string> {
  const response = await staff()
    .post("/admin/staff-users")
    .send({ firstName: "Sophie", lastName: "Martin", email, role: "support" })
    .expect(201);
  return jsonBody<CreatedStaffUserResponse>(response).id;
}

/** La fiche telle que l'écran la voit — c'est ce qui compte, pas la ligne brute. */
async function view(id: string): Promise<StaffUserView> {
  const response = await staff().get("/admin/staff-users").expect(200);
  const rows = jsonBody<readonly StaffUserView[]>(response).filter(
    (row) => row.email !== E2E_STAFF_EMAIL,
  );
  const found = rows.find((row) => row.id === id);
  if (found === undefined) {
    throw new Error(`fiche ${id} introuvable`);
  }
  return found;
}

describe("invitation staff — la première fois", () => {
  it("part À LA CRÉATION : la fiche naît invitée, sans second geste", async () => {
    // La règle a changé le 2026-08-16 : créer quelqu'un l'invite. Deux gestes
    // laissaient une fiche qui existe sans que la personne ait rien reçu, et
    // rien à l'écran ne distinguait « créée » de « invitée ».
    const id = await createColleague();

    const invited = await view(id);
    expect(invited.status).toBe("invited");
    expect(invited.invitedAt).not.toBeNull();
    expect(invited.invitationExpired).toBe(false);
    expect(calls.provisioned).toEqual(["sophie@lfc.test"]);
  });

  it("lie l'identité rendue par le fournisseur", async () => {
    // Sans cette écriture, la personne se connecterait et resterait inconnue :
    // le rapprochement par e-mail marcherait une fois, puis plus jamais.
    const id = await createColleague();

    const row = await ctx.prisma.staffUser.findUniqueOrThrow({ where: { id } });
    expect(row.auth0Id).toBe("auth0|sophie@lfc.test");
  });
});

describe("invitation staff — le renvoi", () => {
  it("ne recrée pas d'identité, il frappe un lien neuf", async () => {
    // Le doublon d'identité est le vrai risque : deux `sub` pour une personne,
    // et le rapprochement d'annuaire devient un tirage au sort.
    const id = await createColleague();
    // La création a déjà provisionné : on repart de la table rase pour
    // observer ce que le RENVOI fait, et lui seul.
    calls.provisioned = [];

    await staff().post(`/admin/staff-users/${id}/invitation`).expect(200);

    expect(calls.provisioned).toEqual([]);
    expect(calls.relinked).toEqual(["auth0|sophie@lfc.test"]);
  });

  it("repousse l'échéance", async () => {
    const id = await createColleague();
    await staff().post(`/admin/staff-users/${id}/invitation`).expect(200);
    const first = (await view(id)).invitedAt;
    await ctx.prisma.staffUser.update({
      where: { id },
      data: { invitedAt: new Date("2026-01-01T00:00:00.000Z") },
    });

    await staff().post(`/admin/staff-users/${id}/invitation`).expect(200);

    const second = (await view(id)).invitedAt;
    expect(second).not.toBe("2026-01-01T00:00:00.000Z");
    expect(second).not.toBeNull();
    expect(first).not.toBeNull();
  });

  it("ne remet PAS en attente quelqu'un déjà entré", async () => {
    // Le mot de passe oublié : il n'a rien perdu, il ne doit rien reperdre.
    const id = await createColleague();
    await ctx.prisma.staffUser.update({
      where: { id },
      data: { status: "active", auth0Id: "auth0|deja" },
    });

    await staff().post(`/admin/staff-users/${id}/invitation`).expect(200);

    expect((await view(id)).status).toBe("active");
    expect(calls.relinked).toEqual(["auth0|deja"]);
  });
});

describe("invitation staff — les refus", () => {
  it("refuse d'inviter une personne suspendue (409)", async () => {
    // Le lien rouvrirait la porte que la suspension vient de fermer : le suivre
    // vaut entrée, et l'entrée réactive la fiche.
    const id = await createColleague();
    await staff()
      .patch(`/admin/staff-users/${id}/status`)
      .send({ status: "suspended" })
      .expect(204);

    // La création provisionne désormais : on repart à zéro pour n'observer
    // que ce que le geste REFUSÉ a fait — c'est-à-dire rien.
    calls.provisioned = [];
    calls.relinked = [];

    await staff().post(`/admin/staff-users/${id}/invitation`).expect(409);

    expect(calls.provisioned).toEqual([]);
    expect(calls.relinked).toEqual([]);
  });

  it("404 sur une fiche inconnue", async () => {
    await staff().post("/admin/staff-users/inconnu/invitation").expect(404);
  });

  it("refuse l'invitation à qui n'a pas l'annuaire (403)", async () => {
    // Inviter quelqu'un dans le back-office est un geste d'administrateur, et
    // le verbe suffit à l'exiger — aucune route n'a eu à le déclarer.
    const id = await createColleague();
    await ctx.prisma.staffUser.create({
      data: {
        firstName: "Colette",
        lastName: "Bréal",
        email: "compta@lfc.test",
        role: "comptabilite",
        status: "active",
        auth0Id: "staff-compta",
      },
    });

    // La création provisionne désormais : on repart à zéro pour n'observer
    // que ce que le geste REFUSÉ a fait — c'est-à-dire rien.
    calls.provisioned = [];
    calls.relinked = [];

    await ctx.asSub("staff-compta").post(`/admin/staff-users/${id}/invitation`).expect(403);

    expect(calls.provisioned).toEqual([]);
  });
});

describe("invitation staff — la péremption se dit", () => {
  it("passe à `invitationExpired` une fois le délai franchi", async () => {
    const id = await createColleague();
    await staff().post(`/admin/staff-users/${id}/invitation`).expect(200);

    // Une invitation datée d'un jour de trop : la borne est inclusive côté vie,
    // donc on la franchit franchement plutôt que de la frôler.
    const stale = new Date(Date.now() - (INVITATION_LIFETIME_DAYS + 1) * 24 * 60 * 60 * 1000);
    await ctx.prisma.staffUser.update({ where: { id }, data: { invitedAt: stale } });

    expect((await view(id)).invitationExpired).toBe(true);
  });

  it("ne périme pas une invitation d'hier", async () => {
    const id = await createColleague();
    await staff().post(`/admin/staff-users/${id}/invitation`).expect(200);

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await ctx.prisma.staffUser.update({ where: { id }, data: { invitedAt: yesterday } });

    expect((await view(id)).invitationExpired).toBe(false);
  });

  it("ne parle jamais de péremption pour un compte actif", async () => {
    // Un « invitation expirée » sur quelqu'un qui travaille serait une alarme
    // mensongère — et les alarmes mensongères, on cesse de les lire.
    const id = await createColleague();
    const stale = new Date(Date.now() - (INVITATION_LIFETIME_DAYS + 1) * 24 * 60 * 60 * 1000);
    await ctx.prisma.staffUser.update({
      where: { id },
      data: { status: "active", invitedAt: stale },
    });

    expect((await view(id)).invitationExpired).toBe(false);
  });
});
