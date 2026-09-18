import { StaffUserRemovalRetiredError } from "../../domain/staff-user-errors.js";
import { RemoveStaffUserHandler } from "../remove-staff-user.handler.js";
import { RemoveStaffUserCommand } from "../staff-user.commands.js";

/**
 * Régression : `DELETE /admin/staff-users/:id` supprimait la fiche, et avec
 * elle l'auteur de tout ce que la personne avait fait — et la seule trace de
 * ses `sub` avant leur conversion (plan `plan-l-auteur-est-la-fiche.md`,
 * étape 0, 2026-09-18).
 */
describe("RemoveStaffUserHandler", () => {
  it("refuse toute suppression, en nommant le geste qui la remplace", async () => {
    const handler = new RemoveStaffUserHandler();

    const refusal = handler.execute(new RemoveStaffUserCommand("s1", "staff_moi"));

    await expect(refusal).rejects.toBeInstanceOf(StaffUserRemovalRetiredError);
    await expect(refusal).rejects.toMatchObject({ code: "staff_user.removal_retired" });
    await expect(refusal).rejects.toThrow(/suspendez-la/);
  });
});
