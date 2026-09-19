import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { CompanyMercurialeReader } from "../../domain/ports/company-mercuriale.reader.js";
import { CompanyMercurialeRepository } from "../../domain/ports/company-mercuriale.repository.js";
import { describeMercuriale, designated } from "./company-mercuriale-support.js";
import { RenameCompanyMercurialeCommand } from "./rename-company-mercuriale.command.js";

@CommandHandler(RenameCompanyMercurialeCommand)
export class RenameCompanyMercurialeHandler implements ICommandHandler<
  RenameCompanyMercurialeCommand,
  number
> {
  constructor(
    private readonly mercuriales: CompanyMercurialeRepository,
    private readonly reader: CompanyMercurialeReader,
    private readonly clock: Clock,
  ) {}

  /**
   * Renomme, et rend le nombre d'articles — la réponse garde sa forme.
   *
   * **Aucun prix ne bouge**, et plus rien ne l'empêche de le prouver : le
   * libellé est une colonne, l'adaptateur n'écrit qu'elle.
   *
   * Le refus d'homonymie a disparu avec l'identité. Il n'existait que parce que
   * deux mercuriales de même nom et de même fenêtre se seraient confondues à la
   * lecture suivante — c'était la contrepartie d'une identité déduite.
   *
   * @throws {PosedMercurialeNotFoundError} rien ne correspond chez ce client.
   * @throws {ArchivedMercurialeIsSealedError} elle est close : une décision
   *   terminée garde la phrase qu'elle portait.
   */
  async execute(command: RenameCompanyMercurialeCommand): Promise<number> {
    const { companyId, payload, staffUserId } = command;
    const mercuriale = await designated(this.reader, companyId, payload);
    const label = payload.newLabel.trim();
    const renamed = mercuriale.rename(label);

    await this.mercuriales.rename(renamed, {
      subjectType: "mercuriale",
      subjectId: renamed.id,
      kind: "renamed",
      actor: staffUserId,
      at: this.clock.now(),
      // Aucun motif : l'écran n'en demande pas pour ce geste. La paraphrase
      // que l'API écrivait ici (« Mercuriale « X » posée… ») n'en était pas un —
      // elle redisait l'acte, que le type et la phrase disent déjà (TODO des
      // phrases du journal, 2026-09-19). Les lignes d'avant la gardent.
      reason: null,
      summary: describeMercuriale(mercuriale),
      // Le NOUVEAU nom : c'est celui qu'elle porte depuis.
      subjectLabel: label,
    });
    return mercuriale.lines.length;
  }
}
