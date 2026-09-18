import { RecordingJournal } from "../../../../platform/journal/__tests__/recording-journal.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { TrackingUnitOfWork } from "../../../directory/application/__tests__/staff-doubles.js";
import { StaffRoleDefinition } from "../../domain/staff-role-definition.js";
import { StaffRoleStillHeldError } from "../../domain/staff-role-errors.js";
import { STAFF_ROLE_FACTS } from "../../domain/staff-role-facts.js";
import { StaffRoleRepository } from "../../domain/staff-role.repository.js";
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

/** Les rôles en mémoire ; chaque `save` note s'il a eu lieu dans la transaction. */
class InMemoryRoles extends StaffRoleRepository {
  readonly saves: boolean[] = [];
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

  load(key: string): Promise<StaffRoleDefinition | null> {
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
    return Promise.resolve(this.members);
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
  return { uow, roles, journal };
}

describe("les rôles se journalisent — dans la transaction", () => {
  it("crée : le rôle et son fait partent ensemble", async () => {
    const { uow, roles, journal } = setup();
    const handler = new CreateStaffRoleHandler(roles, journal, uow);

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
    const { uow, roles, journal } = setup();
    const handler = new UpdateStaffRoleHandler(roles, journal, uow);

    await handler.execute(
      new UpdateStaffRoleCommand("logistique", {
        label: "Logistique",
        grants: [...LOGISTICS.grants],
      }),
    );
    expect(journal.facts).toEqual([]);

    await handler.execute(
      new UpdateStaffRoleCommand("logistique", {
        label: "Expédition",
        grants: [...LOGISTICS.grants],
      }),
    );
    expect(journal.types()).toEqual([STAFF_ROLE_FACTS.updated]);
    expect(journal.facts[0]?.payload).toMatchObject({
      label: "Expédition",
      previousLabel: "Logistique",
    });
  });

  it("archive puis restaure, un fait chacun", async () => {
    const { uow, roles, journal } = setup();

    await new ArchiveStaffRoleHandler(roles, new FixedClock(NOW), journal, uow).execute(
      new ArchiveStaffRoleCommand("logistique"),
    );
    await new RestoreStaffRoleHandler(roles, journal, uow).execute(
      new RestoreStaffRoleCommand("logistique"),
    );

    expect(journal.types()).toEqual([STAFF_ROLE_FACTS.archived, STAFF_ROLE_FACTS.restored]);
  });

  it("n'écrit rien quand l'agrégat refuse l'archivage", async () => {
    const { uow, roles, journal } = setup({ members: 2 });

    await expect(
      new ArchiveStaffRoleHandler(roles, new FixedClock(NOW), journal, uow).execute(
        new ArchiveStaffRoleCommand("logistique"),
      ),
    ).rejects.toBeInstanceOf(StaffRoleStillHeldError);
    expect(roles.saves).toEqual([]);
    expect(journal.facts).toEqual([]);
  });

  it("remonte la panne du journal — l'écriture est dans la même unité de travail", async () => {
    const { uow, roles, journal } = setup({ journalDown: true });

    await expect(
      new RestoreStaffRoleHandler(roles, journal, uow).execute(
        new RestoreStaffRoleCommand("logistique"),
      ),
    ).resolves.toBeUndefined();
    // Restaurer un rôle qui n'est pas archivé n'est pas un fait : le journal
    // n'est pas appelé, donc sa panne ne se voit pas. On l'éprouve sur un vrai geste.
    await expect(
      new ArchiveStaffRoleHandler(roles, new FixedClock(NOW), journal, uow).execute(
        new ArchiveStaffRoleCommand("logistique"),
      ),
    ).rejects.toThrow("journal en panne");
    expect(roles.saves).toEqual([true, true]);
  });
});
