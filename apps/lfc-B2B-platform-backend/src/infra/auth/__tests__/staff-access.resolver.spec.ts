import { Test } from "@nestjs/testing";

import { PrismaService } from "../../database/prisma.service.js";
import { Clock } from "../../time/clock.js";
import { StaffAccessResolver } from "../staff-access.resolver.js";
import type { StaffPrincipal } from "../staff-principal.js";

/** Ce que le résolveur lit d'une fiche. */
interface StaffRow {
  readonly id: string;
  readonly role: "admin" | "commercial" | "comptabilite" | "support" | "dev";
  readonly status: "pending" | "invited" | "active" | "suspended";
  readonly auth0Id: string | null;
  readonly overrides: { resource: string; action: string; effect: string }[];
}

/** Horloge qu'on avance à la main — le cache se teste, il ne s'attend pas. */
class MovableClock extends Clock {
  constructor(private current: Date) {
    super();
  }

  now(): Date {
    return this.current;
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

interface Recorder {
  readonly prisma: object;
  readonly lookups: string[];
  readonly updates: { id: string; auth0Id: string; status: string }[];
}

/**
 * Monte le résolveur par la DI, avec le fake à la place de Prisma.
 *
 * Passer le fake directement au constructeur exigerait de le faire passer pour
 * un `PrismaService`, donc un transtypage — et un transtypage dans un test, c'est
 * la porte par laquelle un fake finit par mentir sur la forme qu'il imite.
 */
async function buildResolver(prisma: object, clock: Clock): Promise<StaffAccessResolver> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      { provide: PrismaService, useValue: prisma },
      { provide: Clock, useValue: clock },
      StaffAccessResolver,
    ],
  }).compile();
  return moduleRef.get(StaffAccessResolver);
}

/** Fake Prisma à closures : compte les lectures pour prouver le cache. */
function fakePrisma(bySub: StaffRow | null, byEmail: StaffRow | null = null): Recorder {
  const lookups: string[] = [];
  const updates: { id: string; auth0Id: string; status: string }[] = [];
  const prisma = {
    staffUser: {
      findUnique: (args: {
        where: { auth0Id?: string; email?: string };
      }): Promise<StaffRow | null> => {
        const byAuth0 = args.where.auth0Id !== undefined;
        lookups.push(byAuth0 ? "sub" : "email");
        return Promise.resolve(byAuth0 ? bySub : byEmail);
      },
      update: (args: {
        where: { id: string };
        data: { auth0Id: string; status: string };
      }): Promise<StaffRow> => {
        updates.push({ id: args.where.id, ...args.data });
        return Promise.resolve(bySub ?? byEmail ?? row());
      },
    },
  };
  return { prisma, lookups, updates };
}

function row(overrides: Partial<StaffRow> = {}): StaffRow {
  return {
    id: "s1",
    role: "comptabilite",
    status: "active",
    auth0Id: null,
    overrides: [],
    ...overrides,
  };
}

const NOW = new Date("2026-08-12T10:00:00.000Z");
const TOKEN: StaffPrincipal = { subject: "auth0|colette", email: "compta@lfc.test", scopes: [] };

describe("StaffAccessResolver — qui entre", () => {
  it("refuse un sujet que l'annuaire ignore", async () => {
    // Côté client un `sub` inconnu est provisionné ; ici il est refusé. On ne
    // rejoint pas l'équipe en se connectant.
    const { prisma } = fakePrisma(null, null);

    const access = await (await buildResolver(prisma, new MovableClock(NOW))).resolve(TOKEN);

    expect(access).toBeNull();
  });

  it("refuse une personne suspendue, sans la toucher", async () => {
    const { prisma, updates } = fakePrisma(row({ status: "suspended", auth0Id: TOKEN.subject }));

    const access = await (await buildResolver(prisma, new MovableClock(NOW))).resolve(TOKEN);

    expect(access).toBeNull();
    expect(updates).toEqual([]);
  });

  it("ne cherche pas par e-mail quand le jeton n'en porte pas", async () => {
    // Un tenant sans claim `email` rend le rapprochement impossible — jamais faux.
    const { prisma, lookups } = fakePrisma(null, row());

    const resolver = await buildResolver(prisma, new MovableClock(NOW));

    const access = await resolver.resolve({ ...TOKEN, email: undefined });

    expect(access).toBeNull();
    expect(lookups).toEqual(["sub"]);
  });
});

describe("StaffAccessResolver — l'entrée se constate", () => {
  it("lie l'identité au premier rapprochement par e-mail, et active la fiche", async () => {
    const { prisma, lookups, updates } = fakePrisma(null, row({ status: "pending" }));

    const access = await (await buildResolver(prisma, new MovableClock(NOW))).resolve(TOKEN);

    expect(lookups).toEqual(["sub", "email"]);
    expect(updates).toEqual([{ id: "s1", auth0Id: TOKEN.subject, status: "active" }]);
    expect(access?.role).toBe("comptabilite");
  });

  it("n'écrit rien quand la fiche est déjà liée et active", async () => {
    // Une écriture par requête serait un coût permanent pour un fait qui ne
    // bouge qu'une fois.
    const { prisma, updates } = fakePrisma(row({ auth0Id: TOKEN.subject, status: "active" }));

    await (await buildResolver(prisma, new MovableClock(NOW))).resolve(TOKEN);

    expect(updates).toEqual([]);
  });

  it("applique les dérogations par-dessus le rôle", async () => {
    const { prisma } = fakePrisma(
      row({
        auth0Id: TOKEN.subject,
        overrides: [{ resource: "growth", action: "read", effect: "allow" }],
      }),
    );

    const access = await (await buildResolver(prisma, new MovableClock(NOW))).resolve(TOKEN);

    expect(access?.permissions).toContain("growth:read");
    expect(access?.permissions).not.toContain("staff:read");
  });
});

describe("StaffAccessResolver — le cache", () => {
  it("ne relit pas l'annuaire dans la fenêtre", async () => {
    const { prisma, lookups } = fakePrisma(row({ auth0Id: TOKEN.subject }));
    const resolver = await buildResolver(prisma, new MovableClock(NOW));

    await resolver.resolve(TOKEN);
    await resolver.resolve(TOKEN);

    expect(lookups).toEqual(["sub"]);
  });

  it("relit passé le délai — une révocation doit finir par mordre", async () => {
    const { prisma, lookups } = fakePrisma(row({ auth0Id: TOKEN.subject }));
    const clock = new MovableClock(NOW);
    const resolver = await buildResolver(prisma, clock);

    await resolver.resolve(TOKEN);
    clock.advance(31_000);
    await resolver.resolve(TOKEN);

    expect(lookups).toEqual(["sub", "sub"]);
  });

  it("oublie sur demande", async () => {
    const { prisma, lookups } = fakePrisma(row({ auth0Id: TOKEN.subject }));
    const resolver = await buildResolver(prisma, new MovableClock(NOW));

    await resolver.resolve(TOKEN);
    resolver.forget();
    await resolver.resolve(TOKEN);

    expect(lookups).toHaveLength(2);
  });

  it("ne met JAMAIS un refus en cache", async () => {
    // Sinon une personne qu'on vient d'ajouter resterait dehors trente secondes
    // de plus, et on croirait que l'ajout n'a pas pris.
    const { prisma, lookups } = fakePrisma(null, null);
    const resolver = await buildResolver(prisma, new MovableClock(NOW));

    await resolver.resolve(TOKEN);
    await resolver.resolve(TOKEN);

    expect(lookups).toEqual(["sub", "email", "sub", "email"]);
  });
});
