/**
 * E2E du **journal de l'annuaire** : chaque geste de l'équipe laisse sa trace,
 * dans la même transaction que lui, et nommée par celui qui l'a posé.
 *
 * Plan : `documentation/staff/journalisation-staff/architecture-journal-de-l-annuaire.md`, lots
 * 1 à 3. Les handlers sont éprouvés avec des doubles ; ici on traverse la
 * route, le mur, le dépôt, le journal réel et Postgres — le seul niveau où un
 * rollback existe, où le nom de l'auteur est figé par l'adaptateur réel, et où
 * le cache d'accès du vrai résolveur peut mentir.
 *
 * Doublés, et eux seuls : le fournisseur d'identité et le courrier — deux
 * frontières sortantes.
 */
import type { CreatedStaffUserResponse } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import { StaffIdentityPort } from "../src/staff/invitations/staff-identity.port.js";
import { bootstrapE2e, E2E_STAFF_EMAIL, jsonBody, type E2eContext } from "./e2e-harness.js";

/** Le jeton EST le `sub` : l'opérateur et un collègue parlent chacun pour eux. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const stubIdentity = {
  provision: (input: { email: string }): Promise<{ subject: string; passwordSetupUrl: string }> =>
    Promise.resolve({
      subject: `auth0|${input.email}`,
      passwordSetupUrl: "https://tenant.invalid/ticket/neuf",
    }),
  issuePasswordLink: (): Promise<string> => Promise.resolve("https://tenant.invalid/ticket/renvoi"),
  changeEmail: (): Promise<void> => Promise.resolve(),
};

/** Les e-mails réellement confiés au courrier — on veut pouvoir dire « aucun ». */
const sent: string[] = [];
const recordingMailer = {
  enabled: true,
  send: (args: { to: string; template: string }): Promise<{ providerId: null }> => {
    sent.push(`${args.template} → ${args.to}`);
    return Promise.resolve({ providerId: null });
  },
};

/** Le nom de l'opérateur des suites, tel que l'adaptateur doit le figer. */
const OPERATOR_NAME = "Opérateur E2E";
const REFUSAL = "e2e_journal_equipe_en_panne";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: StaffIdentityPort, value: stubIdentity },
      { token: MAILER, value: recordingMailer },
    ],
  });
});

afterAll(async () => {
  await repairJournal();
  await ctx.close();
});

beforeEach(async () => {
  await repairJournal();
  await ctx.reset();
  sent.length = 0;
});

const operator = (): ReturnType<E2eContext["asSub"]> => ctx.asSub("staff-e2e");

async function operatorId(): Promise<string> {
  const row = await ctx.prisma.staffUser.findUniqueOrThrow({ where: { email: E2E_STAFF_EMAIL } });
  return row.id;
}

async function createColleague(over: Record<string, unknown> = {}): Promise<string> {
  const response = await operator()
    .post("/admin/staff-users")
    .send({
      firstName: "Cécile",
      lastName: "Martin",
      email: "cecile@lfc.test",
      role: "commercial",
      ...over,
    })
    .expect(201);
  return jsonBody<CreatedStaffUserResponse>(response).id;
}

/** Les faits d'un sujet, dans l'ordre où ils ont été écrits. */
async function factsAbout(subjectId: string) {
  await ctx.drain();
  return ctx.prisma.activityEvent.findMany({
    where: { subjectId },
    orderBy: { id: "asc" },
    select: { type: true, subjectType: true, actorName: true, actorRole: true, payload: true },
  });
}

/** Le journal refuse d'écrire CE type de fait — une panne d'append, la vraie. */
async function breakJournal(type: string): Promise<void> {
  await ctx.prisma.$executeRawUnsafe(
    `ALTER TABLE growth.activity_events
       ADD CONSTRAINT ${REFUSAL} CHECK (type <> '${type}') NOT VALID`,
  );
}

async function repairJournal(): Promise<void> {
  await ctx.prisma.$executeRawUnsafe(
    `ALTER TABLE growth.activity_events DROP CONSTRAINT IF EXISTS ${REFUSAL}`,
  );
}

const EDIT = {
  firstName: "Cécile",
  lastName: "Martin",
  email: "cecile@lfc.test",
  phone: "",
  jobTitle: "",
  role: "commercial",
  overrides: [{ resource: "b2b_pricing", action: "write", effect: "allow" }],
};

describe("le journal de l'annuaire — chaque geste a sa trace, et son auteur", () => {
  it("création : la fiche, puis l'invitation, nommées par l'opérateur", async () => {
    const id = await createColleague();

    const facts = await factsAbout(id);
    expect(facts.map((fact) => fact.type)).toEqual(["staff_user.created", "staff_user.invited"]);
    expect(facts.every((fact) => fact.actorName === OPERATOR_NAME)).toBe(true);
    expect(facts[0]).toMatchObject({
      subjectType: "staff_user",
      actorRole: "Administrateur",
      payload: { person: { firstName: "Cécile", lastName: "Martin" }, roleLabel: "Commercial" },
    });
    expect(facts[1]?.payload).toEqual({
      person: { firstName: "Cécile", lastName: "Martin" },
      kind: "invitation",
    });
    // D5 : ni l'adresse ni le lien ne sortent vers le journal.
    expect(JSON.stringify(facts)).not.toContain("@lfc.test");
    expect(JSON.stringify(facts)).not.toContain("ticket");
  });

  it("édition : un fait par changement réel, aucun pour une édition vide", async () => {
    const id = await createColleague();

    await operator()
      .patch(`/admin/staff-users/${id}`)
      .send({ ...EDIT, jobTitle: "Vendeuse", role: "comptabilite" })
      .expect(204);
    await operator()
      .patch(`/admin/staff-users/${id}`)
      .send({ ...EDIT, jobTitle: "Vendeuse", role: "comptabilite" })
      .expect(204);

    const facts = await factsAbout(id);
    expect(facts.map((fact) => fact.type)).toEqual([
      "staff_user.created",
      "staff_user.invited",
      "staff_user.identity_edited",
      "staff_user.role_changed",
      "staff_user.overrides_changed",
    ]);
    expect(facts[3]?.payload).toMatchObject({ fromLabel: "Commercial", toLabel: "Comptabilité" });
  });

  it("changement de téléphone : le fait porte l'avant ET l'après, tels qu'écrits en base", async () => {
    const id = await createColleague();
    await operator()
      .patch(`/admin/staff-users/${id}`)
      .send({ ...EDIT, phone: "0600000000" })
      .expect(204);

    await operator()
      .patch(`/admin/staff-users/${id}`)
      .send({ ...EDIT, phone: "0611223344" })
      .expect(204);

    const edits = (await factsAbout(id)).filter(
      (fact) => fact.type === "staff_user.identity_edited",
    );
    expect(edits.map((fact) => fact.payload)).toEqual([
      {
        person: { firstName: "Cécile", lastName: "Martin" },
        previous: null,
        fields: ["téléphone"],
        changes: [{ field: "phone", label: "téléphone", from: "", to: "0600000000" }],
      },
      {
        person: { firstName: "Cécile", lastName: "Martin" },
        previous: null,
        fields: ["téléphone"],
        changes: [{ field: "phone", label: "téléphone", from: "0600000000", to: "0611223344" }],
      },
    ]);
  });

  it("les dérogations inchangées gardent leur auteur — la fiche de l'opérateur — et leur date", async () => {
    const id = await createColleague();
    await operator().patch(`/admin/staff-users/${id}`).send(EDIT).expect(204);
    const first = await ctx.prisma.staffPermissionOverride.findFirstOrThrow({
      where: { staffUserId: id },
    });

    await operator()
      .patch(`/admin/staff-users/${id}`)
      .send({ ...EDIT, phone: "0600000000" })
      .expect(204);

    const after = await ctx.prisma.staffPermissionOverride.findFirstOrThrow({
      where: { staffUserId: id },
    });
    expect(after.id).toBe(first.id);
    expect(after.grantedAt).toEqual(first.grantedAt);
    // L'auteur est la fiche : le `sub` n'a plus de colonne où s'écrire.
    expect(after.grantedByStaffId).toBe(await operatorId());
  });

  it("suppression : le fait fige qui elle était", async () => {
    const id = await createColleague();

    await operator().delete(`/admin/staff-users/${id}`).expect(204);

    const facts = await factsAbout(id);
    expect(facts.at(-1)).toMatchObject({
      type: "staff_user.deleted",
      actorName: OPERATOR_NAME,
      payload: { person: { firstName: "Cécile", lastName: "Martin" }, roleLabel: "Commercial" },
    });
  });

  it("rôles : création, modification, archivage, restauration", async () => {
    const grants = [{ resource: "b2b_orders", action: "write" }];
    await operator()
      .post("/admin/staff-roles")
      .send({ key: "logistique", label: "Logistique", grants })
      .expect(201);
    await operator()
      .put("/admin/staff-roles/logistique")
      .send({ label: "Expédition", grants })
      .expect(204);
    await operator().delete("/admin/staff-roles/logistique").expect(204);
    await operator().post("/admin/staff-roles/logistique/restore").expect(204);

    const facts = await factsAbout("logistique");
    expect(facts.map((fact) => fact.type)).toEqual([
      "staff_role.created",
      "staff_role.updated",
      "staff_role.archived",
      "staff_role.restored",
    ]);
    expect(facts.every((fact) => fact.subjectType === "staff_role")).toBe(true);
    expect(facts.every((fact) => fact.actorName === OPERATOR_NAME)).toBe(true);
    expect(facts[1]?.payload).toMatchObject({ label: "Expédition", previousLabel: "Logistique" });
  });
});

describe("le journal de l'annuaire — la suspension mord tout de suite", () => {
  it("la requête suivante de la personne suspendue est refusée", async () => {
    // Le cache d'accès est vidé APRÈS le commit : vidé dedans, la requête
    // suivante aurait pu le remplir avec l'état d'avant, et la suspension
    // aurait mis trente secondes à mordre.
    const id = await createColleague({ role: "comptabilite", email: "compta@lfc.test" });
    await ctx.prisma.staffUser.update({
      where: { id },
      data: { status: "active", auth0Id: "staff-compta" },
    });
    await ctx.asSub("staff-compta").get("/admin/orders").expect(200);

    await operator()
      .patch(`/admin/staff-users/${id}/status`)
      .send({ status: "suspended" })
      .expect(204);

    await ctx.asSub("staff-compta").get("/admin/orders").expect(403);
    const facts = await factsAbout(id);
    expect(facts.at(-1)).toMatchObject({ type: "staff_user.suspended", actorName: OPERATOR_NAME });
  });
});

describe("le journal de l'annuaire — une trace qui tombe annule le geste", () => {
  it("invitation : rien d'écrit, AUCUN e-mail parti", async () => {
    const id = await createColleague();
    await ctx.prisma.staffUser.update({
      where: { id },
      data: { status: "pending", invitedAt: null },
    });
    sent.length = 0;
    await breakJournal("staff_user.invited");

    const response = await operator().post(`/admin/staff-users/${id}/invitation`);

    expect(response.status).toBeGreaterThanOrEqual(500);
    const row = await ctx.prisma.staffUser.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("pending");
    expect(row.invitedAt).toBeNull();
    expect(sent).toEqual([]);
  });

  it("suspension : la personne reste active, et n'est pas prévenue", async () => {
    const id = await createColleague();
    await ctx.prisma.staffUser.update({ where: { id }, data: { status: "active" } });
    sent.length = 0;
    await breakJournal("staff_user.suspended");

    const response = await operator()
      .patch(`/admin/staff-users/${id}/status`)
      .send({ status: "suspended" });

    expect(response.status).toBeGreaterThanOrEqual(500);
    const row = await ctx.prisma.staffUser.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("active");
    expect(sent).toEqual([]);
  });
});
