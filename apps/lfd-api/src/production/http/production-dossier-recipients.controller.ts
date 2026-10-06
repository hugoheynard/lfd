import {
  type CreatedIdResponse,
  type DossierRecipientPayload,
  type DossierRecipientView,
  type DossierStaffCandidateView,
  dossierRecipientPayloadSchema,
} from "@lfd/contracts";
import { Body, Controller, Delete, Get, HttpCode, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../platform/shared/http/zod-body.pipe.js";
import { AddExternalDossierRecipientCommand } from "../application/commands/add-external-dossier-recipient.command.js";
import { AddStaffDossierRecipientCommand } from "../application/commands/add-staff-dossier-recipient.command.js";
import { RemoveDossierRecipientCommand } from "../application/commands/remove-dossier-recipient.command.js";
import { ListDossierRecipientsQuery } from "../application/queries/list-dossier-recipients.query.js";
import { ListDossierStaffCandidatesQuery } from "../application/queries/list-dossier-staff-candidates.query.js";

/** Le code de retour d'un geste qui n'a rien à rendre — le client relit. */
const NO_CONTENT = 204;

/**
 * **Production › Réglages › Destinataires du dossier du jour** (plan
 * `documentation/production/dossier-prod-du-jour.md`, décisions 3-4, lot E2).
 *
 * Sous `production_settings` : lire en `GET`, régler sinon (décision 3). Le
 * contrôleur ne juge que la FORME ; l'adresse, le nom, le doublon et la fiche
 * choisie sont jugés par le domaine. Il n'injecte que les bus.
 */
@Controller("admin/production/settings/dossier-recipients")
@AdminSurface("production_settings")
export class ProductionDossierRecipientsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** La liste, fiches du personnel relues dans l'annuaire. */
  @Get()
  list(): Promise<readonly DossierRecipientView[]> {
    return this.queries.execute<ListDossierRecipientsQuery, readonly DossierRecipientView[]>(
      new ListDossierRecipientsQuery(),
    );
  }

  /** Le personnel qu'on peut choisir : non suspendu, avec une adresse. */
  @Get("staff-candidates")
  staffCandidates(): Promise<readonly DossierStaffCandidateView[]> {
    return this.queries.execute<
      ListDossierStaffCandidatesQuery,
      readonly DossierStaffCandidateView[]
    >(new ListDossierStaffCandidatesQuery());
  }

  /**
   * Inscrit une personne du personnel ou une autre personne. 400 sur une
   * adresse ou un nom invalide, 404 sur une fiche inconnue, 409 sur un doublon
   * ou une fiche suspendue.
   */
  @Post()
  async add(
    @Body(new ZodBody(dossierRecipientPayloadSchema)) body: DossierRecipientPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<CreatedIdResponse> {
    const id =
      body.kind === "staff"
        ? await this.commands.execute<AddStaffDossierRecipientCommand, string>(
            new AddStaffDossierRecipientCommand(body.staffUserId, staffUserId),
          )
        : await this.commands.execute<AddExternalDossierRecipientCommand, string>(
            new AddExternalDossierRecipientCommand(
              body.email,
              body.firstName ?? null,
              body.lastName ?? null,
              body.jobTitle ?? null,
              staffUserId,
            ),
          );
    return { id };
  }

  /** Retire un destinataire ; 404 s'il n'est pas (ou plus) dans la liste. */
  @Delete(":id")
  @HttpCode(NO_CONTENT)
  async remove(@Param("id") id: string, @StaffUserId() staffUserId: string): Promise<void> {
    await this.commands.execute<RemoveDossierRecipientCommand, void>(
      new RemoveDossierRecipientCommand(id, staffUserId),
    );
  }
}
