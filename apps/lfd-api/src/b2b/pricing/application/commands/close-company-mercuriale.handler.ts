import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { CompanyMercurialeReader } from "../../domain/ports/company-mercuriale.reader.js";
import { CompanyMercurialeRepository } from "../../domain/ports/company-mercuriale.repository.js";
import { CloseCompanyMercurialeCommand } from "./close-company-mercuriale.command.js";
import { describeMercuriale, designated } from "./company-mercuriale-support.js";

@CommandHandler(CloseCompanyMercurialeCommand)
export class CloseCompanyMercurialeHandler implements ICommandHandler<
  CloseCompanyMercurialeCommand,
  number
> {
  constructor(
    private readonly mercuriales: CompanyMercurialeRepository,
    private readonly reader: CompanyMercurialeReader,
    private readonly clock: Clock,
  ) {}

  /**
   * Archive la mercuriale, et rend le nombre d'articles qu'elle portait.
   *
   * **Archiver et non borner.** Les deux se défendent ; archiver est celui qui
   * rend sa place dans la contrainte d'exclusion, donc le seul qui permette de
   * reposer sur la même période — ce qu'on vient précisément faire. Rien n'est
   * perdu : une lecture datée d'avant la clôture la retrouve, et ce qu'elle a
   * facturé est figé sur les commandes.
   *
   * @throws {PosedMercurialeNotFoundError} rien ne correspond chez ce client.
   * @throws {ArchivedMercurialeIsSealedError} elle est déjà close.
   */
  async execute(command: CloseCompanyMercurialeCommand): Promise<number> {
    const { companyId, payload, staffUserId } = command;
    const mercuriale = await designated(this.reader, companyId, payload);
    const now = this.clock.now();
    const closed = mercuriale.close(staffUserId, now, payload.reason);

    await this.mercuriales.update(closed, {
      subjectType: "mercuriale",
      subjectId: closed.id,
      kind: "archived",
      actor: staffUserId,
      at: now,
      reason: payload.reason,
      // Le résumé décrit la mercuriale d'AVANT, comme partout dans ce journal :
      // ce qu'on relit est ce qui a été clos.
      summary: describeMercuriale(mercuriale),
      subjectLabel: mercuriale.label,
    });
    return mercuriale.lines.length;
  }
}
