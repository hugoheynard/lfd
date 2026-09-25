import { RecordingJournal } from "../../../../platform/journal/__tests__/recording-journal.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  RecordingAccessCache,
  TrackingUnitOfWork,
} from "../../../directory/application/__tests__/staff-doubles.js";
import { StaffRoleDefinition, type DirectoryKeeper } from "../../domain/staff-role-definition.js";
import {
  StaffRoleLastDirectoryKeeperError,
  StaffRoleSelfRevokeError,
  StaffRoleStillHeldError,
} from "../../domain/staff-role-errors.js";
import { STAFF_ROLE_FACTS } from "../../domain/staff-role-facts.js";
import {
  StaffRoleRepository,
  type StaffRoleLoadOptions,
} from "../../domain/staff-role.repository.js";
import { ArchiveStaffRoleHandler } from "../archive-staff-role.handler.js";
import { CreateStaffRoleHandler } from "../create-staff-role.handler.js";
import { RestoreStaffRoleHandler } from "../restore-staff-role.handler.js";
import {
  ArchiveStaffRoleCommand,
  CreateStaffRoleCommand,
  RestoreStaffRoleCommand,
  UpdateStaffRoleCommand,
} from "../staff-role.commands.js";
import { UpdateStaffRoleHandler } from "../update-staff-role.handler.js";

/** Un instant quelconque : l'archivage ne le compare à rien. */
const NOW = new Date(0);

/** L'auteur des redéfinitions — une fiche qui ne tient pas l'annuaire par défaut. */
const ACTOR = "staff_auteur";

/**
 * Les rôles en mémoire ; chaque `save` note s'il a eu lieu dans la transaction,
 * chaque `load` s'il a verrouillé, et `memberCount` s'il a compté DEDANS.
 */
class InMemoryRoles extends StaffRoleRepository {
  readonly saves: boolean[] = [];
  readonly loads: { readonly forUpdate: boolean; readonly insideTransaction: boolean }[] = [];
  readonly counts: boolean[] = [];
  keepers: readonly DirectoryKeeper[] = [];
  private readonly rows = new Map<string, StaffRoleDefinition>();

  constructor(
    private readonly uow: TrackingUnitOfWork,
    private readonly members = 0,
  ) {
    super();
  }

  seed(role: StaffRoleDefinition): void {
    this.rows.set(role.key, role);
  }

  load(key: string, options?: StaffRoleLoadOptions): Promise<StaffRoleDefinition | null> {
    this.loads.push({
      forUpdate: options?.forUpdate === true,
      insideTransaction: this.uow.inside,
    });
    const found = this.rows.get(key);
    return Promise.resolve(
      found === undefined ? null : StaffRoleDefinition.reconstitute(found.toPersistence()),
    );
  }

  save(role: StaffRoleDefinition): Promise<void> {
    this.saves.push(this.uow.inside);
    this.rows.set(role.key, role);
    return Promise.resolve();
  }

  memberCount(): Promise<number> {
    this.counts.push(this.uow.inside);
    return Promise.resolve(this.members);
  }

  directoryKeepers(): Promise<readonly DirectoryKeeper[]> {
    return Promise.resolve(this.keepers);
  }
}

const LOGISTICS = {
  key: "logistique",
  label: "Logistique",
  grants: [{ resource: "b2b_orders", action: "write" }],
} as const;

function setup(options: { journalDown?: boolean; members?: number } = {}) {
  const uow = new TrackingUnitOfWork();
  const roles = new InMemoryRoles(uow, options.members ?? 0);
  roles.seed(StaffRoleDefinition.define({ ...LOGISTICS, grants: [...LOGISTICS.grants] }));
  const journal = new RecordingJournal(options.journalDown ? new Error("journal en panne") : null);
  const cache = new RecordingAccessCache(uow);
  return { uow, roles, journal, cache };
}

describe("les rôles se journalisent — dans la transaction", () => {
  it("crée : le rôle et son fait partent ensemble", async () => {
    const { uow, roles, journal, cache } = setup();
    const handler = new CreateStaffRoleHandler(roles, journal, uow, cache);

    await handler.execute(
      new CreateStaffRoleCommand({
        key: "atelier",
        label: "Atelier",
        grants: [{ resource: "b2b_alerts", action: "read" }],
      }),
    );

    expect(roles.saves).toEqual([true]);
    expect(journal.types()).toEqual([STAFF_ROLE_FACTS.created]);
    expect(journal.facts[0]?.payload).toMatchObject({ label: "Atelier" });
  });

  it("modifie : un fait quand quelque chose change, aucun sinon", async () => {
    const { uow, roles, journal, cache } = setup();
    const handler = new UpdateStaffRoleHandler(roles, journal, uow, cache);

    await handler.execute(
      new UpdateStaffRoleCommand(
        "logistique",
        {
          label: "Logistique",
          grants: [...LOGISTICS.grants],
        },
        ACTOR,
      ),
    );
    expect(journal.facts).toEqual([]);

    await handler.execute(
      new UpdateStaffRoleCommand(
        "logistique",
        {
          label: "Expédition",
          grants: [...LOGISTICS.grants],
        },
        ACTOR,
      ),
    );
    expect(journal.types()).toEqual([STAFF_ROLE_FACTS.updated]);
    expect(journal.facts[0]?.payload).toMatchObject({
      label: "Expédition",
      previousLabel: "Logistique",
    });
  });

  it("archive puis restaure, un fait chacun", async () => {
    const { uow, roles, journal, cache } = setup();

    await new ArchiveStaffRoleHandler(roles, new FixedClock(NOW), journal, uow, cache).execute(
      new ArchiveStaffRoleCommand("logistique"),
    );
    await new RestoreStaffRoleHandler(roles, journal, uow, cache).execute(
      new RestoreStaffRoleCommand("logistique"),
    );

    expect(journal.types()).toEqual([STAFF_ROLE_FACTS.archived, STAFF_ROLE_FACTS.restored]);
  });

  it("n'écrit rien quand l'agrégat refuse l'archivage", async () => {
    const { uow, roles, journal, cache } = setup({ members: 2 });

    await expect(
      new ArchiveStaffRoleHandler(roles, new FixedClock(NOW), journal, uow, cache).execute(
        new ArchiveStaffRoleCommand("logistique"),
      ),
    ).rejects.toBeInstanceOf(StaffRoleStillHeldError);
    expect(roles.saves).toEqual([]);
    expect(journal.facts).toEqual([]);
  });

  it("remonte la panne du journal — l'écriture est dans la même unité de travail", async () => {
    const { uow, roles, journal, cache } = setup({ journalDown: true });

    await expect(
      new RestoreStaffRoleHandler(roles, journal, uow, cache).execute(
        new RestoreStaffRoleCommand("logistique"),
      ),
    ).resolves.toBeUndefined();
    // Restaurer un rôle qui n'est pas archivé n'est pas un fait : le journal
    // n'est pas appelé, donc sa panne ne se voit pas. On l'éprouve sur un vrai geste.
    await expect(
      new ArchiveStaffRoleHandler(roles, new FixedClock(NOW), journal, uow, cache).execute(
        new ArchiveStaffRoleCommand("logistique"),
      ),
    ).rejects.toThrow("journal en panne");
    expect(roles.saves).toEqual([true, true]);
  });
});

describe("une écriture de définition prend effet tout de suite — le cache est oublié", () => {
  /**
   * Plan `plan-roles-lus-en-base.md` §3.3 : le résolveur lit la définition,
   * mais garde trente secondes. Sans cet oubli, un retrait de droit attendrait.
   * APRÈS le commit : vidé avant, une requête concurrente le remplirait avec
   * l'état d'avant.
   */
  it("après chacun des quatre gestes, et hors de la transaction", async () => {
    const { uow, roles, journal, cache } = setup();

    await new CreateStaffRoleHandler(roles, journal, uow, cache).execute(
      new CreateStaffRoleCommand({
        key: "atelier",
        label: "Atelier",
        grants: [{ resource: "b2b_alerts", action: "read" }],
      }),
    );
    await new UpdateStaffRoleHandler(roles, journal, uow, cache).execute(
      new UpdateStaffRoleCommand(
        "logistique",
        { label: "Expédition", grants: [...LOGISTICS.grants] },
        ACTOR,
      ),
    );
    await new ArchiveStaffRoleHandler(roles, new FixedClock(NOW), journal, uow, cache).execute(
      new ArchiveStaffRoleCommand("logistique"),
    );
    await new RestoreStaffRoleHandler(roles, journal, uow, cache).execute(
      new RestoreStaffRoleCommand("logistique"),
    );

    expect(cache.forgotten).toEqual([
      { insideTransaction: false },
      { insideTransaction: false },
      { insideTransaction: false },
      { insideTransaction: false },
    ]);
  });

  it("n'oublie rien quand l'agrégat refuse", async () => {
    const { uow, roles, journal, cache } = setup({ members: 1 });

    await expect(
      new ArchiveStaffRoleHandler(roles, new FixedClock(NOW), journal, uow, cache).execute(
        new ArchiveStaffRoleCommand("logistique"),
      ),
    ).rejects.toBeInstanceOf(StaffRoleStillHeldError);
    expect(cache.forgotten).toEqual([]);
  });
});

describe("archiver — verrou, compte et écriture dans la même transaction", () => {
  /**
   * Régression (plan §3.3) : le compte et l'archivage se faisaient hors de
   * toute unité de travail, et une attribution concurrente passait entre les
   * deux — un rôle archivé se retrouvait porté.
   */
  it("charge sous FOR UPDATE et compte DANS la transaction", async () => {
    const { uow, roles, journal, cache } = setup();

    await new ArchiveStaffRoleHandler(roles, new FixedClock(NOW), journal, uow, cache).execute(
      new ArchiveStaffRoleCommand("logistique"),
    );

    expect(roles.loads).toEqual([{ forUpdate: true, insideTransaction: true }]);
    expect(roles.counts).toEqual([true]);
  });
});

describe("redéfinir — on ne vide pas l'annuaire", () => {
  const GATEKEEPER = {
    key: "gardien",
    label: "Gardien",
    grants: [
      { resource: "staff_access", action: "write" },
      { resource: "b2b_orders", action: "read" },
    ],
  } as const;
  const WITHOUT_DIRECTORY = {
    label: "Gardien",
    grants: [{ resource: "b2b_orders", action: "read" }],
  } as const;

  function withGatekeeper(keepers: readonly DirectoryKeeper[]) {
    const context = setup();
    context.roles.seed(
      StaffRoleDefinition.define({ ...GATEKEEPER, grants: [...GATEKEEPER.grants] }),
    );
    context.roles.keepers = keepers;
    const handler = new UpdateStaffRoleHandler(
      context.roles,
      context.journal,
      context.uow,
      context.cache,
    );
    const strip = (actorId: string): Promise<void> =>
      handler.execute(
        new UpdateStaffRoleCommand(
          "gardien",
          { ...WITHOUT_DIRECTORY, grants: [...WITHOUT_DIRECTORY.grants] },
          actorId,
        ),
      );
    return { ...context, strip };
  }

  it("refuse de retirer staff_access:write au dernier rôle qui le porte", async () => {
    const { roles, strip } = withGatekeeper([{ staffUserId: "s_a", roleKey: "gardien" }]);

    await expect(strip(ACTOR)).rejects.toBeInstanceOf(StaffRoleLastDirectoryKeeperError);
    expect(roles.saves).toEqual([]);
  });

  it("refuse que l'auteur se le retire en éditant le rôle qu'il porte", async () => {
    const { strip } = withGatekeeper([
      { staffUserId: ACTOR, roleKey: "gardien" },
      { staffUserId: "s_b", roleKey: "admin" },
    ]);

    await expect(strip(ACTOR)).rejects.toBeInstanceOf(StaffRoleSelfRevokeError);
  });

  it("laisse faire quand un autre rôle tient encore l'annuaire", async () => {
    const { roles, strip } = withGatekeeper([
      { staffUserId: "s_a", roleKey: "gardien" },
      { staffUserId: "s_b", roleKey: "admin" },
    ]);

    await strip(ACTOR);

    expect(roles.saves).toEqual([true]);
  });

  it("laisse faire quand personne ne porte ce rôle", async () => {
    const { roles, strip } = withGatekeeper([]);

    await strip(ACTOR);

    expect(roles.saves).toEqual([true]);
  });
});
