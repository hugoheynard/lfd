/**
 * E2E **les destinataires des avis** (lot P1c,
 * `documentation/payment/les-liens-de-paiement.md`) : le
 * réglage chez le staff et la lecture qu'il publie pour le bloc `mail`.
 *
 * Ce que seul le vrai SQL prouve :
 * - la lecture publiée rend les membres non suspendus et avec une adresse des
 *   rôles réglés et les membres nommés, une fois chacun, triés par id ;
 * - le geste est muré par `staff_notice_audiences`, refuse une ligne
 *   invalide sans rien écrire, et journalise `staff.notice_audience_changed` ;
 * - le `CHECK` « l'un des deux exactement » et la clé étrangère `RESTRICT`.
 *
 * Doublée : la signature du jeton staff.
 */
import type { StaffNoticeAudiencesView } from "@lfd/contracts";

import { StaffNoticeRecipients } from "../src/staff/notifications/domain/ports/staff-notice-recipients.js";
import { staffWithRole } from "./delivery-driver-scene.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";

const ROUTE = "/admin/staff-notice-audiences";
const NOTICE = "staff.link-payment-received";
const ACCOUNTING_ROLE = {
  key: "compta-avis",
  label: "Compta des avis",
  grants: [{ resource: "b2b_accounting", action: "read" }],
} as const;

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [ADMIN_VERIFIER_OVERRIDE] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await ctx.asSub(E2E_STAFF_SUB).post("/admin/staff-roles").send(ACCOUNTING_ROLE).expect(201);
});

function admin() {
  return ctx.asSub(E2E_STAFF_SUB);
}

function recipients() {
  return ctx.app.get(StaffNoticeRecipients).recipientsOf(NOTICE);
}

async function setAudience(roleKeys: string[], staffUserIds: string[]): Promise<void> {
  await admin().put(`${ROUTE}/${NOTICE}`).send({ roleKeys, staffUserIds }).expect(204);
}

describe("la lecture publiée : à qui part un avis", () => {
  it("rien de réglé : personne", async () => {
    await staffWithRole(ctx, "anne", ACCOUNTING_ROLE.key);

    await expect(recipients()).resolves.toEqual([]);
  });

  it("un rôle à deux membres dont un suspendu, un membre nommé aussi dans le rôle, un sans adresse", async () => {
    const anne = await staffWithRole(ctx, "anne", ACCOUNTING_ROLE.key);
    const bruno = await staffWithRole(ctx, "bruno", ACCOUNTING_ROLE.key);
    await ctx.prisma.staffUser.update({ where: { id: bruno.id }, data: { status: "suspended" } });
    const claire = await ctx.prisma.staffUser.create({
      data: {
        firstName: "Claire",
        lastName: "Test",
        email: "",
        roleKey: "admin",
        status: "active",
      },
      select: { id: true },
    });
    const denis = await staffWithRole(ctx, "denis", "admin");

    await setAudience([ACCOUNTING_ROLE.key], [anne.id, claire.id, denis.id]);

    const found = await recipients();
    expect(found).toEqual(
      [
        { staffUserId: anne.id, email: "anne@lfc.test" },
        { staffUserId: denis.id, email: "denis@lfc.test" },
      ].sort((a, b) => (a.staffUserId < b.staffUserId ? -1 : 1)),
    );
  });
});

describe("le geste : régler les destinataires", () => {
  it("pose le réglage, le sert à l'écran et journalise le changement ; un rejeu n'écrit rien", async () => {
    const anne = await staffWithRole(ctx, "anne", "admin");

    await setAudience([ACCOUNTING_ROLE.key], [anne.id]);
    await setAudience([ACCOUNTING_ROLE.key], [anne.id]);

    const view = jsonBody<StaffNoticeAudiencesView>(await admin().get(ROUTE).expect(200));
    expect(view.notices).toEqual([
      expect.objectContaining({
        template: NOTICE,
        label: "Paiement reçu par un lien",
        roles: [{ key: ACCOUNTING_ROLE.key, label: ACCOUNTING_ROLE.label, archived: false }],
        members: [expect.objectContaining({ staffUserId: anne.id, reachable: true })],
      }),
    ]);
    expect(view.candidates.roles.map((role) => role.key)).toContain(ACCOUNTING_ROLE.key);
    await ctx.drain();
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "staff.notice_audience_changed" },
    });
    expect(facts).toHaveLength(1);
    expect(facts[0]?.payload).toMatchObject({
      subjectLabel: "Paiement reçu par un lien",
      added: ["Rôle Compta des avis", "anne Test"],
      removed: [],
    });
  });

  it("refuse un rôle inconnu (400) et un avis inconnu (400), sans rien écrire", async () => {
    await admin()
      .put(`${ROUTE}/${NOTICE}`)
      .send({ roleKeys: ["inexistant"], staffUserIds: [] })
      .expect(400);
    await admin()
      .put(`${ROUTE}/staff.invited`)
      .send({ roleKeys: [], staffUserIds: [] })
      .expect(400);

    await expect(ctx.prisma.staffNoticeAudience.count()).resolves.toBe(0);
  });

  it("refuse un membre sans le droit staff_notice_audiences (403)", async () => {
    const reader = await staffWithRole(ctx, "lecteur", ACCOUNTING_ROLE.key);

    await reader.agent.get(ROUTE).expect(403);
    await reader.agent
      .put(`${ROUTE}/${NOTICE}`)
      .send({ roleKeys: [], staffUserIds: [] })
      .expect(403);
  });

  it("la base refuse une ligne à deux cibles, et la suppression d'un membre visé", async () => {
    const anne = await staffWithRole(ctx, "anne", "admin");
    const row = { template: NOTICE, createdByStaffId: anne.id, createdAt: new Date(0) };

    await expect(
      ctx.prisma.staffNoticeAudience.create({
        data: { ...row, id: "a1", roleKey: ACCOUNTING_ROLE.key, staffUserId: anne.id },
      }),
    ).rejects.toThrow(/staff_notice_audience_one_target/u);
    await setAudience([], [anne.id]);
    await expect(ctx.prisma.staffUser.delete({ where: { id: anne.id } })).rejects.toThrow();
  });

  /**
   * Aucune clé étrangère vers les définitions de rôles : une migration ne nomme
   * pas cette table (`lint:no-role-grants-in-migrations`). Un rôle visé qui
   * disparaît ne vise plus personne — l'avis retombe sur la boîte de l'équipe.
   */
  it("un rôle visé qui disparaît ne vise plus personne", async () => {
    await setAudience([ACCOUNTING_ROLE.key], []);
    await ctx.prisma.staffRoleDefinition.delete({ where: { key: ACCOUNTING_ROLE.key } });

    expect(await recipients()).toEqual([]);
  });
});
