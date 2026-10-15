import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Journal } from "../../../platform/journal/journal.js";
import { StaffAccessCache } from "../staff-access-cache.port.js";
import { roleUpdatedFact } from "../domain/staff-role-facts.js";
import { StaffRoleRepository } from "../domain/staff-role.repository.js";
import { loadEditableRole } from "./staff-role-support.js";
import { UpdateStaffRoleCommand } from "./staff-role.commands.js";

/**
 * Réécrit un rôle. Le fait dit ce qui a changé — libellé, droits ajoutés,
 * retirés, modifiés —, et une redéfinition identique n'en écrit aucun.
 *
 * 🔴 **L'édition prend effet tout de suite** (plan `plan-roles-lus-en-base.md`
 * §3.3) : le résolveur lit la définition, et le cache d'accès est oublié après
 * le commit. Sans cet oubli, un retrait de droit mettrait jusqu'à trente
 * secondes à s'appliquer — sur cette instance ; les autres gardent leur cache
 * jusqu'à expiration, défaut assumé et écrit au plan.
 *
 * La **précondition** facultative (`expectedPermissions`, plan
 * `plan-outils-agent-droits.md`) refuse d'écrire sur un rôle qui a changé
 * depuis la lecture de l'appelant : l'écran ne l'envoie pas, les outils agent
 * toujours.
 */
@CommandHandler(UpdateStaffRoleCommand)
export class UpdateStaffRoleHandler implements ICommandHandler<UpdateStaffRoleCommand, void> {
  constructor(
    private readonly roles: StaffRoleRepository,
    private readonly journal: Journal,
    private readonly uow: UnitOfWork,
    private readonly cache: StaffAccessCache,
  ) {}

  async execute(command: UpdateStaffRoleCommand): Promise<void> {
    await this.uow.run(async () => {
      // Verrouillé dans la transaction : la précondition et l'écriture voient
      // le même état, sans qu'une édition concurrente se glisse entre les deux.
      const role = await loadEditableRole(this.roles, command.key, { forUpdate: true });
      const expected = command.payload.expectedPermissions;
      if (expected !== undefined) {
        role.assertUnchangedSince(expected);
      }
      const before = role.toPersistence();
      role.redefine(command.payload, {
        actorId: command.actorId,
        keepers: await this.roles.directoryKeepers(),
      });
      await this.roles.save(role);
      const fact = roleUpdatedFact(before, role.toPersistence(), command.agentTool);
      if (fact !== null) {
        await this.journal.append(fact);
      }
    });
    this.cache.forgetAll();
  }
}
