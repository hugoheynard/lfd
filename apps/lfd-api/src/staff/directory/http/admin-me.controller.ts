import {
  staffNavPreferencesPatchSchema,
  type StaffMeView,
  type StaffNavPreferencesPatch,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, Patch } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSelfSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { GetStaffMeQuery } from "../application/get-staff-me.query.js";
import { UpdateStaffNavPrefsCommand } from "../application/update-staff-nav-prefs.command.js";

/**
 * « Qui suis-je, et que puis-je faire » — **le seul point** par lequel un écran
 * admin apprend ses droits.
 *
 * Un seul point, pour que le jour où le calcul des droits change — les rôles
 * définis en base, par exemple —, on change qui répond à cette question, pas un
 * écran. Surface réflexive : elle exige une fiche connue et non suspendue, mais
 * aucune permission — il faudrait sinon un droit pour apprendre qu'on n'en a
 * aucun.
 *
 * L'écriture des préférences y reste, et c'est la même raison : elle ne touche
 * QUE la personne que le jeton désigne. Aucune route d'ici ne prend d'identifiant
 * de cible, donc aucune n'a de périmètre à vérifier.
 */
@Controller("admin/me")
@AdminSelfSurface()
export class AdminMeController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  @Get()
  me(@StaffUserId() staffUserId: string): Promise<StaffMeView> {
    return this.queries.execute<GetStaffMeQuery, StaffMeView>(new GetStaffMeQuery(staffUserId));
  }

  /**
   * Enregistre une préférence de navigation — aujourd'hui la fiche d'atelier sur
   * laquelle le poste s'est mis.
   *
   * Rend `204` et rien d'autre : le client relit `/admin/me`. Une commande ne
   * renvoie pas de modèle de lecture, et ici ça tombe bien — l'écran a déjà
   * affiché ce qu'il vient d'écrire.
   */
  @Patch("prefs")
  @HttpCode(204)
  async updatePrefs(
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(staffNavPreferencesPatchSchema)) patch: StaffNavPreferencesPatch,
  ): Promise<void> {
    await this.commands.execute<UpdateStaffNavPrefsCommand, void>(
      new UpdateStaffNavPrefsCommand(staffUserId, patch),
    );
  }
}
