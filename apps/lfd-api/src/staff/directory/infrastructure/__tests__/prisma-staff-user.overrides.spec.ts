import type { StaffOverride } from "@lfd/contracts";

import {
  ACTOR,
  buildRepo,
  fakePrisma,
  GROWTH_READ,
  ORDERS_READ,
  payload,
  PRICING_WRITE,
  row,
  TODAY,
} from "./fake-staff-prisma.js";

describe("PrismaStaffUserRepository — les dérogations ne se réécrivent plus", () => {
  it("ne touche à AUCUNE ligne quand rien ne change — auteur et date survivent", async () => {
    // Régression : chaque édition faisait `deleteMany` + `create`, et
    // réattribuait tous les écarts à l'éditeur du jour, date comprise.
    const { prisma, overrideWrites, updated } = fakePrisma(
      row({ overrides: [PRICING_WRITE, GROWTH_READ] }),
    );
    const repo = await buildRepo(prisma);

    const edit = await repo.update(
      "u1",
      payload({ overrides: [GROWTH_READ, PRICING_WRITE] }),
      ACTOR,
    );

    expect(overrideWrites).toEqual([]);
    expect(updated).toEqual([]);
    expect(edit.overrides).toEqual({ added: [], removed: [], changed: [] });
  });

  it("écrit le diff exact : supprime la retirée, met à jour la modifiée, crée la nouvelle", async () => {
    const flipped: StaffOverride = { ...GROWTH_READ, effect: "allow" };
    const { prisma, overrideWrites } = fakePrisma(row({ overrides: [PRICING_WRITE, GROWTH_READ] }));
    const repo = await buildRepo(prisma);

    const edit = await repo.update("u1", payload({ overrides: [flipped, ORDERS_READ] }), ACTOR);

    const key = (entry: StaffOverride) => ({
      staffUserId_resource_action: {
        staffUserId: "u1",
        resource: entry.resource,
        action: entry.action,
      },
    });
    expect(overrideWrites).toEqual([
      { op: "delete", args: { where: key(PRICING_WRITE) } },
      {
        op: "update",
        args: {
          where: key(GROWTH_READ),
          data: { effect: "allow", grantedByStaffId: ACTOR, grantedAt: TODAY },
        },
      },
      {
        op: "create",
        args: {
          data: { staffUserId: "u1", ...ORDERS_READ, grantedByStaffId: ACTOR, grantedAt: TODAY },
        },
      },
    ]);
    expect(edit.overrides).toEqual({
      added: [ORDERS_READ],
      removed: [PRICING_WRITE],
      changed: [flipped],
    });
  });

  it("n'écrit plus jamais le `sub` : l'auteur est l'id de fiche", async () => {
    const { prisma, overrideWrites } = fakePrisma(row());
    const repo = await buildRepo(prisma);

    await repo.update("u1", payload({ overrides: [ORDERS_READ] }), ACTOR);

    const written = overrideWrites.map((write) => JSON.stringify(write.args));
    expect(written.every((args) => args.includes(`"grantedByStaffId":"${ACTOR}"`))).toBe(true);
    expect(written.some((args) => args.includes('grantedBy"'))).toBe(false);
  });

  it("attribue les dérogations d'une fiche créée à l'id de fiche de l'auteur", async () => {
    let data: unknown = null;
    const { prisma } = fakePrisma(null);
    const repo = await buildRepo({
      ...prisma,
      staffUser: {
        findUnique: (): Promise<null> => Promise.resolve(null),
        create: (args: { data: unknown }): Promise<{ id: string }> => {
          data = args.data;
          return Promise.resolve({ id: "neuf" });
        },
      },
    });

    await repo.create(payload({ overrides: [ORDERS_READ] }), ACTOR);

    expect(data).toMatchObject({
      overrides: { create: [{ ...ORDERS_READ, grantedByStaffId: ACTOR, grantedAt: TODAY }] },
    });
  });

  it("rend l'état d'avant et l'état écrit — l'e-mail normalisé", async () => {
    const { prisma, updated } = fakePrisma(row());
    const repo = await buildRepo(prisma);

    const edit = await repo.update("u1", payload({ email: "Camille@LaFolieDouce.com" }), ACTOR);

    expect(edit.before.email).toBe("commercial@lafoliedouce.com");
    expect(edit.after.email).toBe("camille@lafoliedouce.com");
    expect(updated).toHaveLength(1);
  });
});

describe("PrismaStaffUserRepository — le statut", () => {
  it("rend l'état d'avant, et n'écrit rien quand il ne bouge pas", async () => {
    const { prisma, updated } = fakePrisma(row({ status: "suspended" }));
    const repo = await buildRepo(prisma);

    const before = await repo.setStatus("u1", { status: "suspended" }, ACTOR);

    expect(before.status).toBe("suspended");
    expect(updated).toEqual([]);
  });
});
