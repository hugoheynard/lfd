import { Test } from "@nestjs/testing";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
import { PrismaStaffAccessResolver } from "../prisma-staff-access.resolver.js";
import type { StaffPrincipal } from "../../../platform/auth/staff-principal.js";

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
  readonly updates: { id: string; auth0Id?: string; status: string }[];
  /** Les lignes inscrites dans la table des `sub`. */
  readonly aliases: { sub: string; staffUserId: string; source: string }[];
}

/**
 * Monte le résolveur par la DI, avec le fake à la place de Prisma.
 *
 * Passer le fake directement au constructeur exigerait de le faire passer pour
 * un `PrismaService`, donc un transtypage — et un transtypage dans un test, c'est
 * la porte par laquelle un fake finit par mentir sur la forme qu'il imite.
 */
async function buildResolver(prisma: object, clock: Clock): Promise<PrismaStaffAccessResolver> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      { provide: PrismaService, useValue: prisma },
      { provide: Clock, useValue: clock },
      PrismaStaffAccessResolver,
    ],
  }).compile();
  return moduleRef.get(PrismaStaffAccessResolver);
}

/** Fake Prisma à closures : compte les lectures pour prouver le cache. */
function fakePrisma(
  bySub: StaffRow | null,
  byEmail: StaffRow | null = null,
  linkLost = false,
): Recorder {
  const lookups: string[] = [];
  const updates: { id: string; auth0Id?: string; status: string }[] = [];
  const aliases: { sub: string; staffUserId: string; source: string }[] = [];
  const prisma = {
    // La forme CALLBACK : le fake se passe lui-même comme client de transaction.
    $transaction: <T>(work: (tx: object) => Promise<T>): Promise<T> => work(prisma),
    staffSubjectAlias: {
      createMany: (args: {
        data: { sub: string; staffUserId: string; source: string };
      }): Promise<{ count: number }> => {
        aliases.push(args.data);
        return Promise.resolve({ count: 1 });
      },
    },
    staffUser: {
      findUnique: (args: {
        where: { auth0Id?: string; email?: string };
      }): Promise<StaffRow | null> => {
        const byAuth0 = args.where.auth0Id !== undefined;
        lookups.push(byAuth0 ? "sub" : "email");
        return Promise.resolve(byAuth0 ? bySub : byEmail);
      },
      update: (args: { where: { id: string }; data: { status: string } }): Promise<StaffRow> => {
        updates.push({ id: args.where.id, ...args.data });
        return Promise.resolve(bySub ?? byEmail ?? row());
      },
      updateMany: (args: {
        where: { id: string; auth0Id: null };
        data: { auth0Id: string; status: string };
      }): Promise<{ count: number }> => {
        if (linkLost) {
          return Promise.resolve({ count: 0 });
        }
        updates.push({ id: args.where.id, ...args.data });
        return Promise.resolve({ count: 1 });
      },
    },
  };
  return { prisma, lookups, updates, aliases };
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
const TOKEN: StaffPrincipal = {
  subject: "auth0|colette",
  email: "compta@lfc.test",
  emailVerified: true,
  scopes: [],
};

describe("PrismaStaffAccessResolver — qui entre", () => {
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

/**
 * Régression : le rapprochement par e-mail réécrivait `auth0Id` sans condition.
 * Un compte Auth0 ouvert sous l'adresse d'un membre prenait ses droits et le
 * mettait dehors (lot 0 de `plan-connexion-sociale.md`, 2026-09-17).
 */
describe("PrismaStaffAccessResolver — 🔴 une adresse ne vole pas une fiche", () => {
  it("refuse un autre `sub` sous l'adresse d'une fiche déjà liée, sans la toucher", async () => {
    const { prisma, updates } = fakePrisma(null, row({ auth0Id: "auth0|la-vraie-colette" }));

    const access = await (await buildResolver(prisma, new MovableClock(NOW))).resolve(TOKEN);

    expect(access).toBeNull();
    expect(updates).toEqual([]);
  });

  it("ne rapproche pas une adresse que le jeton ne dit pas vérifiée", async () => {
    const { prisma, lookups, updates } = fakePrisma(null, row({ status: "pending" }));

    const access = await (
      await buildResolver(prisma, new MovableClock(NOW))
    ).resolve({ ...TOKEN, emailVerified: false });

    expect(access).toBeNull();
    expect(lookups).toEqual(["sub"]);
    expect(updates).toEqual([]);
  });

  it("refuse la seconde de deux premières connexions simultanées", async () => {
    // La fiche était libre à la lecture, et liée par l'autre à l'écriture.
    const { prisma, aliases } = fakePrisma(null, row({ status: "pending" }), true);

    const access = await (await buildResolver(prisma, new MovableClock(NOW))).resolve(TOKEN);

    expect(access).toBeNull();
    // Le `sub` perdant n'est pas celui de cette fiche : l'inscrire lui
    // attribuerait les actes d'un autre (`architecture-journalisation.md` §12, D5).
    expect(aliases).toEqual([]);
  });

  it("traite une vérification inconnue comme un refus", async () => {
    // « On ne sait pas » ne vaut pas preuve : un tenant sans le claim ne lie rien.
    const { prisma, updates } = fakePrisma(null, row({ status: "pending" }));

    const access = await (
      await buildResolver(prisma, new MovableClock(NOW))
    ).resolve({ ...TOKEN, emailVerified: undefined });

    expect(access).toBeNull();
    expect(updates).toEqual([]);
  });
});

describe("PrismaStaffAccessResolver — pas de connexion sociale", () => {
  it("refuse un `sub` Google, même lié à une fiche active, sans lire l'annuaire", async () => {
    const google = "google-oauth2|104233";
    const { prisma, lookups } = fakePrisma(row({ auth0Id: google }));

    const access = await (
      await buildResolver(prisma, new MovableClock(NOW))
    ).resolve({ ...TOKEN, subject: google });

    expect(access).toBeNull();
    expect(lookups).toEqual([]);
  });

  it("laisse passer un sujet hors Auth0 (bypass de dev, doubles de test)", async () => {
    const { prisma } = fakePrisma(row({ auth0Id: "dev-staff" }));

    const access = await (
      await buildResolver(prisma, new MovableClock(NOW))
    ).resolve({ ...TOKEN, subject: "dev-staff" });

    expect(access?.role).toBe("comptabilite");
  });
});

describe("PrismaStaffAccessResolver — l'entrée se constate", () => {
  it("lie l'identité au premier rapprochement par e-mail, et active la fiche", async () => {
    const { prisma, lookups, updates } = fakePrisma(null, row({ status: "pending" }));

    const access = await (await buildResolver(prisma, new MovableClock(NOW))).resolve(TOKEN);

    expect(lookups).toEqual(["sub", "email"]);
    expect(updates).toEqual([{ id: "s1", auth0Id: TOKEN.subject, status: "active" }]);
    expect(access?.role).toBe("comptabilite");
  });

  it("inscrit le `sub` lié dans la table des `sub`, avec la liaison", async () => {
    // `auth0_id` ne garde que le dernier `sub` d'une fiche ; la table les garde
    // tous, pour que l'histoire écrite sous un ancien reste à la personne.
    const { prisma, aliases } = fakePrisma(null, row({ status: "pending" }));

    await (await buildResolver(prisma, new MovableClock(NOW))).resolve(TOKEN);

    expect(aliases).toEqual([{ sub: TOKEN.subject, staffUserId: "s1", source: "linked" }]);
  });

  it("active une fiche invitée déjà liée, sans toucher au lien", async () => {
    const { prisma, updates } = fakePrisma(row({ auth0Id: TOKEN.subject, status: "invited" }));

    await (await buildResolver(prisma, new MovableClock(NOW))).resolve(TOKEN);

    expect(updates).toEqual([{ id: "s1", status: "active" }]);
  });

  it("n'écrit rien quand la fiche est déjà liée et active", async () => {
    // Une écriture par requête serait un coût permanent pour un fait qui ne
    // bouge qu'une fois.
    const { prisma, updates, aliases } = fakePrisma(
      row({ auth0Id: TOKEN.subject, status: "active" }),
    );

    await (await buildResolver(prisma, new MovableClock(NOW))).resolve(TOKEN);

    expect(updates).toEqual([]);
    expect(aliases).toEqual([]);
  });

  it("applique les dérogations par-dessus le rôle", async () => {
    const { prisma } = fakePrisma(
      row({
        auth0Id: TOKEN.subject,
        overrides: [{ resource: "b2b_growth", action: "read", effect: "allow" }],
      }),
    );

    const access = await (await buildResolver(prisma, new MovableClock(NOW))).resolve(TOKEN);

    expect(access?.permissions).toContain("b2b_growth:read");
    expect(access?.permissions).not.toContain("staff_access:read");
  });
});

describe("PrismaStaffAccessResolver — le cache", () => {
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
    resolver.forgetAll();
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
