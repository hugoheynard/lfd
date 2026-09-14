import type { StaffNavPreferencesPatch } from "@lfd/contracts";

import { StaffNavPreferencesRepository } from "../../domain/staff-nav-preferences.repository.js";
import { UpdateStaffNavPrefsCommand } from "../update-staff-nav-prefs.command.js";
import { UpdateStaffNavPrefsHandler } from "../update-staff-nav-prefs.handler.js";

/** Double du port : enregistre les appels, ne touche à aucune base. */
class FakeStaffNavPreferencesRepository extends StaffNavPreferencesRepository {
  readonly calls: { staffUserId: string; patch: StaffNavPreferencesPatch }[] = [];

  merge(staffUserId: string, patch: StaffNavPreferencesPatch): Promise<void> {
    this.calls.push({ staffUserId, patch });
    return Promise.resolve();
  }
}

describe("UpdateStaffNavPrefsHandler", () => {
  it("range la préférence pour la personne du jeton", async () => {
    const repo = new FakeStaffNavPreferencesRepository();
    const handler = new UpdateStaffNavPrefsHandler(repo);

    await handler.execute(
      new UpdateStaffNavPrefsCommand("staff_1", { worksheetCategory: "pains" }),
    );

    expect(repo.calls).toEqual([{ staffUserId: "staff_1", patch: { worksheetCategory: "pains" } }]);
  });

  /**
   * Le handler ne complète PAS la charge : une clé absente doit rester absente
   * jusqu'au port, sinon la fusion perdrait son sens et une future préférence
   * envoyée seule effacerait la catégorie.
   */
  it("relaie la charge telle quelle, sans lui ajouter de défaut", async () => {
    const repo = new FakeStaffNavPreferencesRepository();
    const handler = new UpdateStaffNavPrefsHandler(repo);

    await handler.execute(new UpdateStaffNavPrefsCommand("staff_2", {}));

    expect(repo.calls[0]?.patch).toEqual({});
  });

  it("relaie l'effacement explicite du choix", async () => {
    const repo = new FakeStaffNavPreferencesRepository();
    const handler = new UpdateStaffNavPrefsHandler(repo);

    await handler.execute(new UpdateStaffNavPrefsCommand("staff_3", { worksheetCategory: null }));

    expect(repo.calls[0]?.patch).toEqual({ worksheetCategory: null });
  });
});
