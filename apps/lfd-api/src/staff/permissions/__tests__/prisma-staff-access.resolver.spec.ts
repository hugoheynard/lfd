import {
  ALL_STAFF_PERMISSIONS,
  ROLE_GRANTS,
  legacyRoleSeeds,
  resolveStaffPermissions,
  SUPER_ADMIN_ROLE_KEY,
} from "@lfd/contracts";
import { Test } from "@nestjs/testing";

import { AppConfig } from "../../../platform/config/app-config.js";
import type { Actor } from "../../../platform/context/request-context.js";
import { currentRequestContext } from "../../../platform/context/request-context.store.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { RecordingJournal } from "../../../platform/journal/__tests__/recording-journal.js";
import type { JournalFact } from "../../../platform/journal/journal-fact.js";
import { Journal } from "../../../platform/journal/journal.js";
import { Clock } from "../../../platform/time/clock.js";
import { PrismaStaffAccessResolver } from "../prisma-staff-access.resolver.js";
import type { StaffPrincipal } from "../../../platform/auth/staff-principal.js";

/** Ce que le résolveur lit d'une fiche. */
interface StaffRow {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly role: "admin" | "commercial" | "comptabilite" | "support" | "dev" | null;
  readonly roleKey: string | null;
  readonly roleDefinition: {
    readonly label: string;
    readonly grants: unknown;
    readonly archivedAt: Date | null;
  } | null;
  readonly status: "pending" | "invited" | "active" | "suspended";
  readonly auth0Id: string | null;
  readonly overrides: { resource: string; action: string; effect: string }[];
}

/** Le journal, qui retient aussi l'AUTEUR que le contexte lui présente à l'écriture. */
class AuthoredJournal extends RecordingJournal {
  readonly authors: (Actor | null)[] = [];

  override append(fact: JournalFact): Promise<void> {
    this.authors.push(currentRequestContext()?.actor ?? null);
    return super.append(fact);
  }
}

/** Le résolveur, dont on retient les activations perdues au lieu de les loguer. */
class ObservedResolver extends PrismaStaffAccessResolver {
  readonly lost: string[] = [];
  readonly unreadable: string[] = [];

  protected override reportLostActivation(staffUserId: string): void {
    this.lost.push(staffUserId);
  }

  protected override reportUnreadableRole(roleKey: string): void {
    this.unreadable.push(roleKey);
  }
}

/** L'adresse de secours du déploiement de test (§3.4 du plan des rôles lus en base). */
const RESCUE_EMAIL = "secours@lfc.test";

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
async function buildResolver(
  prisma: object,
  clock: Clock,
  journal: Journal = new AuthoredJournal(),
): Promise<PrismaStaffAccessResolver> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      { provide: PrismaService, useValue: prisma },
      { provide: Clock, useValue: clock },
      { provide: Journal, useValue: journal },
      { provide: AppConfig, useValue: { bootstrapAdminEmail: (): string => RESCUE_EMAIL } },
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

/** La définition semée d'un rôle du contrat, telle que la jointure la rend. */
function seeded(key: string): StaffRow["roleDefinition"] {
  const seed = legacyRoleSeeds().find((entry) => entry.key === key);
  return seed === undefined ? null : { label: seed.label, grants: seed.grants, archivedAt: null };
}

function row(overrides: Partial<StaffRow> = {}): StaffRow {
  return {
    id: "s1",
    firstName: "Colette",
    lastName: "Bréal",
    email: "compta@lfc.test",
    role: "comptabilite",
    roleKey: "comptabilite",
    roleDefinition: seeded("comptabilite"),
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

/**
 * D7 du plan des phrases : la première entrée d'une fiche passait à `active`
 * sans laisser de fait — la seule activation que le journal ne voyait pas.
 */
describe("PrismaStaffAccessResolver — la première entrée au journal", () => {
  it("écrit `staff_user.activated` à la liaison d'une fiche en attente, la fiche pour auteur", async () => {
    const journal = new AuthoredJournal();
    const { prisma } = fakePrisma(null, row({ status: "pending" }));

    await (await buildResolver(prisma, new MovableClock(NOW), journal)).resolve(TOKEN);

    expect(journal.facts).toEqual([
      {
        type: "staff_user.activated",
        subjectType: "staff_user",
        subjectId: "s1",
        payload: {
          subjectLabel: "Colette Bréal",
          person: { firstName: "Colette", lastName: "Bréal" },
        },
      },
    ]);
    expect(journal.authors).toEqual([{ type: "staff", id: "s1" }]);
  });

  it("n'écrit rien quand la fiche liée était déjà active — ce n'est pas une activation", async () => {
    const journal = new AuthoredJournal();
    const { prisma } = fakePrisma(null, row({ status: "active" }));

    const access = await (
      await buildResolver(prisma, new MovableClock(NOW), journal)
    ).resolve(TOKEN);

    expect(access?.staffUserId).toBe("s1");
    expect(journal.facts).toEqual([]);
  });

  it("n'écrit rien pour la liaison PERDUE — le `sub` perdant n'est pas celui de la fiche", async () => {
    const journal = new AuthoredJournal();
    const { prisma } = fakePrisma(null, row({ status: "pending" }), true);

    await (await buildResolver(prisma, new MovableClock(NOW), journal)).resolve(TOKEN);

    expect(journal.facts).toEqual([]);
  });

  it("écrit `activated` aussi quand la fiche était DÉJÀ liée — l'invitation relie d'avance", async () => {
    const journal = new AuthoredJournal();
    const { prisma, updates } = fakePrisma(row({ auth0Id: TOKEN.subject, status: "invited" }));

    await (await buildResolver(prisma, new MovableClock(NOW), journal)).resolve(TOKEN);

    expect(updates).toEqual([{ id: "s1", status: "active" }]);
    expect(journal.types()).toEqual(["staff_user.activated"]);
    expect(journal.authors).toEqual([{ type: "staff", id: "s1" }]);
  });

  /**
   * Décision du 2026-09-19 : l'entrée d'une personne ne dépend jamais du
   * journal. Une panne qui refuserait la connexion se répéterait à chaque
   * requête tant que la fiche resterait `invited`.
   */
  it("journal en panne : la personne entre, le fait manque, l'erreur est journalisée", async () => {
    const { prisma, updates } = fakePrisma(row({ auth0Id: TOKEN.subject, status: "invited" }));
    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: Clock, useValue: new MovableClock(NOW) },
        { provide: Journal, useValue: new RecordingJournal(new Error("journal en panne")) },
        { provide: AppConfig, useValue: { bootstrapAdminEmail: (): string => RESCUE_EMAIL } },
        ObservedResolver,
      ],
    }).compile();
    const resolver = moduleRef.get(ObservedResolver);

    const access = await resolver.resolve(TOKEN);

    expect(access?.staffUserId).toBe("s1");
    expect(updates).toEqual([{ id: "s1", status: "active" }]);
    expect(resolver.lost).toEqual(["s1"]);
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

/** Le résolveur observé, monté comme en production — pour lire ce qu'il rapporte. */
async function observed(prisma: object): Promise<ObservedResolver> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      { provide: PrismaService, useValue: prisma },
      { provide: Clock, useValue: new MovableClock(NOW) },
      { provide: Journal, useValue: new AuthoredJournal() },
      { provide: AppConfig, useValue: { bootstrapAdminEmail: (): string => RESCUE_EMAIL } },
      ObservedResolver,
    ],
  }).compile();
  return moduleRef.get(ObservedResolver);
}

/**
 * Plan `documentation/staff/plan-roles-lus-en-base.md` §3.2 : le résolveur lit
 * la DÉFINITION du rôle, plus `ROLE_GRANTS`. Chaque ligne du tableau a son cas.
 */
describe("PrismaStaffAccessResolver — les droits viennent de la définition en base", () => {
  const linked = { auth0Id: TOKEN.subject } as const;
  const DENY_TAX = { resource: "pim_tax", action: "write", effect: "deny" } as const;
  const ALLOW_GROWTH = { resource: "b2b_growth", action: "read", effect: "allow" } as const;

  it("lit les droits de la définition, pas ceux du contrat", async () => {
    // Une définition éditée à l'écran : la comptabilité n'y a plus que les commandes.
    const edited = {
      label: "Comptabilité",
      grants: [{ resource: "b2b_orders", action: "read" }],
      archivedAt: null,
    };
    const { prisma } = fakePrisma(row({ ...linked, roleDefinition: edited }));

    const access = await (await buildResolver(prisma, new MovableClock(NOW))).resolve(TOKEN);

    expect(access?.permissions).toEqual(["b2b_orders:read"]);
    expect(access).toMatchObject({ role: "comptabilite", roleLabel: "Comptabilité" });
  });

  it("résout un rôle créé à l'écran, hors enum", async () => {
    const custom = {
      role: null,
      roleKey: "vendeur-marche",
      roleDefinition: {
        label: "Vendeur du marché",
        grants: [{ resource: "b2b_counter", action: "read" }],
        archivedAt: null,
      },
    };
    const { prisma } = fakePrisma(row({ ...linked, ...custom }));

    const access = await (await buildResolver(prisma, new MovableClock(NOW))).resolve(TOKEN);

    expect(access).toEqual({
      staffUserId: "s1",
      role: "vendeur-marche",
      roleLabel: "Vendeur du marché",
      permissions: ["b2b_counter:read"],
    });
  });

  it("définition archivée : aucun droit par le rôle, les écarts seuls", async () => {
    const archived = {
      ...seeded("comptabilite"),
      label: "Comptabilité",
      grants: [],
      archivedAt: new Date(0),
    };
    const { prisma } = fakePrisma(
      row({ ...linked, roleDefinition: archived, overrides: [{ ...ALLOW_GROWTH }] }),
    );

    const access = await (await buildResolver(prisma, new MovableClock(NOW))).resolve(TOKEN);

    expect(access?.permissions).toEqual(["b2b_growth:read"]);
  });

  it("droits illisibles : ce rôle tombe seul, écarts gardés, erreur rapportée avec la clé", async () => {
    // Le cas de la base de dev du 2026-09-25 : une ressource d'une version abandonnée.
    const broken = {
      label: "Comptabilité",
      grants: [{ resource: "storefront" }],
      archivedAt: null,
    };
    const { prisma } = fakePrisma(
      row({ ...linked, roleDefinition: broken, overrides: [{ ...ALLOW_GROWTH }] }),
    );
    const resolver = await observed(prisma);

    const access = await resolver.resolve(TOKEN);

    expect(access?.permissions).toEqual(["b2b_growth:read"]);
    expect(resolver.unreadable).toEqual(["comptabilite"]);
  });

  it("clé nulle (fiche d'avant la migration) : repli de transition sur ROLE_GRANTS", async () => {
    const { prisma } = fakePrisma(
      row({ ...linked, roleKey: null, roleDefinition: null, overrides: [{ ...DENY_TAX }] }),
    );

    const access = await (await buildResolver(prisma, new MovableClock(NOW))).resolve(TOKEN);

    expect(access?.permissions).toEqual(resolveStaffPermissions("comptabilite", [{ ...DENY_TAX }]));
    expect(ROLE_GRANTS.comptabilite.pim_tax).toBe("write");
  });
});

/**
 * Plan §3.4 : la fiche RACINE résout toujours `superadmin` — ancrée sur la
 * fiche que `findStaff` a trouvée, jamais sur la revendication `email` du jeton.
 */
describe("PrismaStaffAccessResolver — 🔴 le secours s'ancre sur la fiche liée", () => {
  const rescueToken: StaffPrincipal = { ...TOKEN, email: RESCUE_EMAIL };

  it("ouvre tout à la fiche racine liée, même vidée et sur un rôle archivé", async () => {
    const emptied = { label: "Administrateur", grants: [], archivedAt: new Date(0) };
    const { prisma } = fakePrisma(
      row({
        email: RESCUE_EMAIL,
        auth0Id: TOKEN.subject,
        role: "admin",
        roleKey: "admin",
        roleDefinition: emptied,
        overrides: [{ resource: "staff_access", action: "write", effect: "deny" }],
      }),
    );

    const access = await (await buildResolver(prisma, new MovableClock(NOW))).resolve(TOKEN);

    expect(access?.role).toBe(SUPER_ADMIN_ROLE_KEY);
    expect(access?.permissions).toEqual(ALL_STAFF_PERMISSIONS);
  });

  it("n'ouvre rien de plus à un jeton qui ANNONCE l'adresse de secours sous un autre `sub`", async () => {
    // Le `sub` du jeton est lié à une fiche ordinaire : c'est ELLE qui décide.
    const { prisma } = fakePrisma(row({ auth0Id: TOKEN.subject }));

    const access = await (await buildResolver(prisma, new MovableClock(NOW))).resolve(rescueToken);

    expect(access?.role).toBe("comptabilite");
    expect(access?.permissions).not.toContain("staff_access:write");
  });

  it("n'ouvre rien à un jeton non vérifié qui annonce l'adresse de secours", async () => {
    const root = row({
      email: RESCUE_EMAIL,
      role: "admin",
      roleKey: "admin",
      roleDefinition: seeded("admin"),
    });
    const { prisma } = fakePrisma(null, root);

    const access = await (
      await buildResolver(prisma, new MovableClock(NOW))
    ).resolve({ ...rescueToken, emailVerified: false });

    expect(access).toBeNull();
  });

  it("n'ouvre rien à un jeton qui annonce l'adresse d'une fiche racine déjà liée ailleurs", async () => {
    const root = row({
      email: RESCUE_EMAIL,
      auth0Id: "auth0|le-vrai-secours",
      role: "admin",
      roleKey: "admin",
      roleDefinition: seeded("admin"),
    });
    const { prisma } = fakePrisma(null, root);

    const access = await (await buildResolver(prisma, new MovableClock(NOW))).resolve(rescueToken);

    expect(access).toBeNull();
  });
});
