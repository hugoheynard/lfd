import type { OrderDraftView } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import { OrderDraftRepository } from "../../domain/ports/order-draft.repository.js";
import { OrderCompanyNotFoundError } from "../../domain/errors/order-errors.js";
import { SaveOrderDraftCommand } from "./save-order-draft.command.js";

/**
 * Enregistre le brouillon d'une société — création ou remplacement.
 *
 * **La seule règle est que la société existe.** Un brouillon n'a pas d'autre
 * invariant : ni ligne obligatoire, ni acheteur, ni adresse. Ceux-là valent pour
 * une commande *passée*, et les exiger ici reviendrait à interdire d'interrompre
 * un appel au milieu — ce que cette fonctionnalité existe précisément pour
 * permettre.
 *
 * Rien n'est vérifié du **contenu** non plus : un SKU retiré du catalogue depuis
 * l'enregistrement ne rend pas le brouillon invalide, il rendra la passation
 * impossible, et c'est là que ce sera dit. Un brouillon qu'on refuserait de
 * garder parce qu'il ne passerait pas serait un brouillon qui ne sert à rien.
 */
@CommandHandler(SaveOrderDraftCommand)
export class SaveOrderDraftHandler implements ICommandHandler<
  SaveOrderDraftCommand,
  OrderDraftView
> {
  constructor(
    private readonly drafts: OrderDraftRepository,
    private readonly guard: OrderGuardReader,
  ) {}

  async execute(command: SaveOrderDraftCommand): Promise<OrderDraftView> {
    const status = await this.guard.companyStatusOf(command.companyId);
    if (status === null) {
      throw new OrderCompanyNotFoundError(command.companyId);
    }
    return this.drafts.save(command.companyId, command.payload, command.savedByStaffId);
  }
}
