import { NavPreferencesRepository } from "../../../domain/ports/nav-preferences.repository.js";
import type { CatalogueView } from "../../../domain/value-objects/nav-preferences.js";
import { UpdateNavPreferencesCommand } from "../update-nav-preferences.command.js";
import { UpdateNavPreferencesHandler } from "../update-nav-preferences.handler.js";

/** Double du port : enregistre les appels, ne touche à aucune base. */
class FakeNavPreferencesRepository extends NavPreferencesRepository {
  readonly calls: { userId: string; view: CatalogueView }[] = [];

  saveCatalogueView(userId: string, view: CatalogueView): Promise<void> {
    this.calls.push({ userId, view });
    return Promise.resolve();
  }
}

describe("UpdateNavPreferencesHandler", () => {
  it("persiste la vue choisie pour la personne du Principal", async () => {
    const repo = new FakeNavPreferencesRepository();
    const handler = new UpdateNavPreferencesHandler(repo);

    await handler.execute(new UpdateNavPreferencesCommand("user_1", "shelves"));

    expect(repo.calls).toEqual([{ userId: "user_1", view: "shelves" }]);
  });

  it("relaie chaque vue sans la réécrire", async () => {
    const repo = new FakeNavPreferencesRepository();
    const handler = new UpdateNavPreferencesHandler(repo);

    await handler.execute(new UpdateNavPreferencesCommand("user_2", "list"));

    expect(repo.calls[0]?.view).toBe("list");
  });
});
