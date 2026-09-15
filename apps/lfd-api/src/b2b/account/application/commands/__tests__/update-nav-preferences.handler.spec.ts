import { PERSONAL_WORKSPACE } from "@lfd/contracts";

import { WorkspaceOutOfReachError } from "../../../domain/errors/account-errors.js";
import { NavPreferencesRepository } from "../../../domain/ports/nav-preferences.repository.js";
import type { NavPreferencesPatch } from "../../../domain/value-objects/nav-preferences.js";
import { UpdateNavPreferencesCommand } from "../update-nav-preferences.command.js";
import { UpdateNavPreferencesHandler } from "../update-nav-preferences.handler.js";

/** Double du port : enregistre les fusions demandées, ne touche à aucune base. */
class RecordingNavPreferencesRepository extends NavPreferencesRepository {
  readonly merges: { userId: string; patch: NavPreferencesPatch }[] = [];

  merge(userId: string, patch: NavPreferencesPatch): Promise<void> {
    this.merges.push({ userId, patch });
    return Promise.resolve();
  }
}

function setup(): {
  readonly repo: RecordingNavPreferencesRepository;
  readonly handler: UpdateNavPreferencesHandler;
} {
  const repo = new RecordingNavPreferencesRepository();
  return { repo, handler: new UpdateNavPreferencesHandler(repo) };
}

describe("UpdateNavPreferencesHandler", () => {
  it("fusionne la vue choisie pour la personne du Principal, sans autre clé", async () => {
    const { repo, handler } = setup();

    await handler.execute(
      new UpdateNavPreferencesCommand("user_1", [], { catalogueView: "shelves" }),
    );

    expect(repo.merges).toEqual([{ userId: "user_1", patch: { catalogueView: "shelves" } }]);
  });

  it("range une société de la personne comme espace", async () => {
    const { repo, handler } = setup();

    await handler.execute(
      new UpdateNavPreferencesCommand("user_1", ["co_1", "co_2"], { workspace: "co_2" }),
    );

    expect(repo.merges).toEqual([{ userId: "user_1", patch: { workspace: "co_2" } }]);
  });

  it("range « perso » quel que soit le nombre de sociétés", async () => {
    const { repo, handler } = setup();

    await handler.execute(
      new UpdateNavPreferencesCommand("user_1", ["co_1"], { workspace: PERSONAL_WORKSPACE }),
    );

    expect(repo.merges[0]?.patch).toEqual({ workspace: PERSONAL_WORKSPACE });
  });

  it("transmet l'effacement du choix d'espace", async () => {
    const { repo, handler } = setup();

    await handler.execute(new UpdateNavPreferencesCommand("user_1", [], { workspace: null }));

    expect(repo.merges[0]?.patch).toEqual({ workspace: null });
  });

  it("🔴 refuse une société étrangère, et n'écrit RIEN — pas même la vue", async () => {
    const { repo, handler } = setup();

    await expect(
      handler.execute(
        new UpdateNavPreferencesCommand("user_1", ["co_1"], {
          catalogueView: "list",
          workspace: "co_du_concurrent",
        }),
      ),
    ).rejects.toBeInstanceOf(WorkspaceOutOfReachError);
    expect(repo.merges).toEqual([]);
  });
});
