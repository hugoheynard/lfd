import { RecordingJournal } from "../../../../platform/journal/__tests__/recording-journal.js";
import {
  RecordingAccessCache,
  TrackingUnitOfWork,
} from "../../../directory/application/__tests__/staff-doubles.js";
import { StaffRoleDefinition } from "../../domain/staff-role-definition.js";
import { StaffRoleChangedSinceReadError } from "../../domain/staff-role-errors.js";
import { UpdateStaffRoleCommand } from "../staff-role.commands.js";
import { UpdateStaffRoleHandler } from "../update-staff-role.handler.js";
import { InMemoryRoles } from "./staff-role-doubles.js";

/**
 * La précondition et la trace d'agent d'une redéfinition (plan
 * `plan-outils-agent-droits.md`, corrections après vitruve).
 */

const ACTOR = "staff_auteur";

/** Ce que l'outil a lu : les droits RÉSOLUS du rôle, écriture comprise. */
const READ_PERMISSIONS = ["b2b_orders:read", "b2b_orders:write"];

function setup() {
  const uow = new TrackingUnitOfWork();
  const roles = new InMemoryRoles(uow);
  roles.seed(
    StaffRoleDefinition.define({
      key: "logistique",
      label: "Logistique",
      grants: [{ resource: "b2b_orders", action: "write" }],
    }),
  );
  const journal = new RecordingJournal(null);
  const cache = new RecordingAccessCache(uow);
  const handler = new UpdateStaffRoleHandler(roles, journal, uow, cache);
  return { roles, journal, handler };
}

/** Le rôle entier, avec un droit de plus — ce qu'un `role_grant` renvoie. */
const GRANTED = {
  label: "Logistique",
  grants: [
    { resource: "b2b_orders", action: "write" },
    { resource: "b2b_alerts", action: "read" },
  ],
} as const;

describe("la précondition d'une redéfinition", () => {
  it("écrit quand les droits lus sont encore ceux du rôle, dans n'importe quel ordre", async () => {
    const { roles, handler } = setup();

    await handler.execute(
      new UpdateStaffRoleCommand(
        "logistique",
        {
          ...GRANTED,
          grants: [...GRANTED.grants],
          expectedPermissions: [...READ_PERMISSIONS].reverse(),
        },
        ACTOR,
      ),
    );

    expect(roles.saves).toEqual([true]);
    expect(roles.loads).toEqual([{ forUpdate: true, insideTransaction: true }]);
  });

  it("refuse (409) un rôle qui a changé depuis la lecture, sans rien écrire", async () => {
    const { roles, journal, handler } = setup();

    const write = handler.execute(
      new UpdateStaffRoleCommand(
        "logistique",
        { ...GRANTED, grants: [...GRANTED.grants], expectedPermissions: ["b2b_orders:read"] },
        ACTOR,
      ),
    );

    await expect(write).rejects.toBeInstanceOf(StaffRoleChangedSinceReadError);
    await expect(write).rejects.toThrow(/« Logistique » a changé depuis votre lecture/u);
    expect(roles.saves).toEqual([]);
    expect(journal.facts).toEqual([]);
  });

  it("sans précondition — l'écran —, écrit comme avant", async () => {
    const { roles, handler } = setup();

    await handler.execute(
      new UpdateStaffRoleCommand("logistique", { ...GRANTED, grants: [...GRANTED.grants] }, ACTOR),
    );

    expect(roles.saves).toEqual([true]);
  });
});

describe("la trace d'un outil agent", () => {
  it("range le nom de l'outil dans le fait", async () => {
    const { journal, handler } = setup();

    await handler.execute(
      new UpdateStaffRoleCommand(
        "logistique",
        { ...GRANTED, grants: [...GRANTED.grants] },
        ACTOR,
        "role_grant",
      ),
    );

    expect(journal.facts[0]?.payload).toMatchObject({ via: { agentTool: "role_grant" } });
  });

  it("n'en pose aucune pour un geste d'écran", async () => {
    const { journal, handler } = setup();

    await handler.execute(
      new UpdateStaffRoleCommand("logistique", { ...GRANTED, grants: [...GRANTED.grants] }, ACTOR),
    );

    expect(journal.facts[0]?.payload).not.toHaveProperty("via");
  });
});
