import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  correctLegalEntityPayloadSchema,
  declareLegalEntityPayloadSchema,
  type CorrectLegalEntityPayload,
  type CreatedIdResponse,
  type DeclareLegalEntityPayload,
  type LegalEntityView,
} from "@lfd/contracts";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import {
  CorrectLegalEntityCommand,
  DeclareLegalEntityCommand,
  SetLegalEntityArchivedCommand,
} from "../application/commands/legal-entity-commands.js";
import {
  GetLegalEntityQuery,
  ListLegalEntitiesQuery,
} from "../application/queries/legal-entity-queries.js";

/**
 * **Le registre** des entités juridiques émettrices — qui elles sont, et
 * lesquelles émettent encore.
 *
 * Staff-only sans jumeau client, et pas par oubli : un client n'a aucune raison
 * d'interroger notre identité d'émetteur autrement qu'en lisant le document
 * qu'on lui envoie, où elle est **figée**. Une route qui la résoudrait à la
 * demande contredirait la copie.
 *
 * ## Ce fichier ne porte QUE l'identité et le cycle de vie
 *
 * Découpé en trois le 2026-09-12, sur la même adresse de base. Le fichier
 * unique tenait douze routes et trois raisons de changer :
 *
 * - **ici** — l'identité et le cycle de vie : ce qui se corrige, et ce qui
 *   cesse d'émettre ;
 * - {@link AdminLegalEntityBankingController} — l'ICS, le compte créancier, le
 *   délai de pré-notification : ce qui décide de l'encaissement, et ce qu'on
 *   relit quand quelque chose a été détourné ;
 * - {@link AdminLegalEntityDocumentsController} — le logo et la fiche de
 *   mandat : du multipart, des en-têtes, un `StreamableFile`, et le partage
 *   `inline`/`attachment` qui est une frontière de sécurité à lui seul.
 *
 * Le découpage prolonge une distinction qui était déjà écrite ici : les gestes
 * d'encaissement avaient chacun leur route plutôt que d'être des champs de la
 * correction, parce que **ranger un geste sans retour parmi cinq champs qui se
 * corrigent tous les jours est la meilleure façon de le faire poser par
 * mégarde**. Ils ne se croisent plus du tout.
 *
 * ⚠️ Trois contrôleurs, une seule adresse de base et une seule ressource de
 * permission (`b2b_accounting`). Les chemins ne se recouvrent pas — `:id` et
 * `:id/logo` n'ont pas le même nombre de segments —, donc l'ordre
 * d'enregistrement dans le module ne décide de rien.
 */
@Controller("admin/accounting/legal-entities")
@AdminSurface("b2b_accounting")
export class AdminLegalEntitiesController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  async list(): Promise<readonly LegalEntityView[]> {
    return this.queries.execute<ListLegalEntitiesQuery, readonly LegalEntityView[]>(
      new ListLegalEntitiesQuery(),
    );
  }

  @Get(":id")
  async one(@Param("id") id: string): Promise<LegalEntityView> {
    return this.queries.execute<GetLegalEntityQuery, LegalEntityView>(new GetLegalEntityQuery(id));
  }

  /**
   * Déclare une entité — sans ICS ni compte, qui arrivent après.
   *
   * Rend l'identifiant seul, jamais la vue : une écriture ne rend pas un modèle
   * de lecture, l'appelant relit. Ce n'est pas une cérémonie — c'est ce qui
   * garantit que l'écran affiche ce que la base porte, et pas ce que le handler
   * croyait écrire.
   */
  @Post()
  async declare(
    @Body(new ZodBody(declareLegalEntityPayloadSchema)) payload: DeclareLegalEntityPayload,
  ): Promise<CreatedIdResponse> {
    const id = await this.commands.execute<DeclareLegalEntityCommand, string>(
      new DeclareLegalEntityCommand(payload),
    );
    return { id };
  }

  /** Corrige l'identité et l'adresse. Les documents déjà émis en ont pris copie. */
  @Put(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async correct(
    @Param("id") id: string,
    @Body(new ZodBody(correctLegalEntityPayloadSchema)) payload: CorrectLegalEntityPayload,
  ): Promise<void> {
    await this.commands.execute(new CorrectLegalEntityCommand(id, payload));
  }

  /**
   * Archive — **pas de suppression**. Une entité citée par un mandat signé ou une
   * facture émise ne s'efface pas : le document garde son identifiant, et un
   * `DELETE` transformerait une référence en trou.
   */
  @Put(":id/archived")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setArchived(@Param("id") id: string, @Body("archived") archived: boolean): Promise<void> {
    await this.commands.execute(new SetLegalEntityArchivedCommand(id, archived === true));
  }
}
