import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { type OrderHandoverView } from "@lfd/contracts";
import { Controller, Get, Param, Post, Req, UnauthorizedException } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import type { AuthenticatedStaffRequest } from "../../../platform/auth/staff-principal.js";
import { ConfirmHandoverCommand } from "../application/commands/confirm-handover.command.js";
import { GetHandoverQuery } from "../application/queries/get-handover.query.js";

/**
 * La **remise au comptoir** — la surface que le QR d'un client ouvre.
 *
 * Le parcours physique : le client présente son écran, le staff scanne avec
 * l'appareil photo natif de son téléphone, l'URL ouvre l'app admin, il vérifie
 * le sac et confirme. Aucun lecteur de code-barres, aucune app à installer —
 * un QR qui encode une URL est déjà scannable par tous les téléphones du monde.
 *
 * **Porte staff**, comme les autres surfaces `/admin/*` : `@Public()` désarme le
 * guard client, `AdminAuthGuard` réarme la porte staff. C'est essentiel ici et
 * pas seulement conventionnel — c'est cette porte qui fait du scan une preuve.
 * Sans elle, quiconque a vu un QR par-dessus une épaule pourrait attester sa
 * propre remise.
 */
@Controller("admin/handover")
@AdminSurface("b2b_orders")
export class AdminHandoverController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  /** Ce qu'il y a derrière ce QR — avant de confirmer quoi que ce soit. */
  @Get(":token")
  async one(@Param("token") token: string): Promise<OrderHandoverView> {
    return this.queries.execute<GetHandoverQuery, OrderHandoverView>(new GetHandoverQuery(token));
  }

  /**
   * Atteste la remise. Rend l'attestation obtenue (qui, quand) plutôt qu'un
   * corps vide : au comptoir, la confirmation doit s'afficher dans la seconde,
   * sans second aller-retour.
   */
  @Post(":token")
  async confirm(
    @Param("token") token: string,
    @Req() request: AuthenticatedStaffRequest,
  ): Promise<OrderHandoverView> {
    return this.commands.execute<ConfirmHandoverCommand, OrderHandoverView>(
      new ConfirmHandoverCommand(token, staffSubjectOf(request)),
    );
  }
}

/**
 * L'identité staff posée par le guard. Le `?` du type l'autorise à manquer ;
 * en pratique le guard a couru avant nous, mais on refuse plutôt que d'écrire
 * une attestation anonyme — une preuve sans auteur n'est pas une preuve.
 */
function staffSubjectOf(request: AuthenticatedStaffRequest): string {
  const subject = request.staff?.subject;
  if (subject === undefined || subject === "") {
    throw new UnauthorizedException("Identité staff absente de la requête.");
  }
  return subject;
}
