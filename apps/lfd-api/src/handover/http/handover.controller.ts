import { type OrderHandoverView } from "@lfd/contracts";
import { Controller, Get, Param, Post, Req, UnauthorizedException } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import type { AuthenticatedStaffRequest } from "../../platform/auth/staff-principal.js";
import { ConfirmHandoverCommand } from "../application/commands/confirm-handover.command.js";
import { ConfirmManualHandoverCommand } from "../application/commands/confirm-manual-handover.command.js";
import { GetHandoverQuery } from "../application/queries/get-handover.query.js";

/**
 * La **remise** — la surface que le QR d'un client ouvre, et son chemin de
 * secours.
 *
 * Le parcours physique : le client présente son écran, le staff scanne avec
 * l'appareil photo natif de son téléphone, l'URL ouvre l'app admin, il vérifie
 * le sac et confirme. Aucun lecteur de code-barres, aucune app à installer —
 * un QR qui encode une URL est déjà scannable par tous les téléphones du monde.
 *
 * 🔴 **Cette surface vivait sous `/admin/handover`, chez le commerce, jusqu'au
 * 2026-09-07.** C'est au labo qu'on retire — le client s'y présente, le coursier
 * y charge —, et le fournil enregistre maintenant la remise chez lui. Le
 * commerce l'apprend par un fait et en tire `fulfilled`.
 *
 * ⚠️ **Le QR déjà parti dans les courriels continue de fonctionner.** Il encode
 * `{admin}/retrait/{token}`, c'est-à-dire une route du **front**, qui ne bouge
 * pas : seul le chemin d'API qu'elle appelle a changé. Déplacer la route front
 * aurait cassé chaque code déjà envoyé à un client.
 *
 * **Les DEUX acheminements passent par ici**, retrait comme livraison : en
 * coursier, le destinataire montre le code de son courriel et c'est le coursier
 * qui scanne, avec sa session staff. Même jeton, même porte, même geste — ce qui
 * reste ferme, c'est qu'il faut être deux.
 *
 * **Porte staff**, comme les autres surfaces `/admin/*`. C'est essentiel ici et
 * pas seulement conventionnel — c'est cette porte qui fait du scan une preuve.
 * Sans elle, quiconque a vu un QR par-dessus une épaule pourrait attester sa
 * propre remise.
 *
 * `b2b_orders` reste la ressource, inchangée : le fournil partage celle du
 * contrôleur de journée. Déplacer le code ne doit retirer le geste à personne —
 * le commercial qui prend la commande est souvent celui qui remet le sac, et
 * c'est un droit qu'on lui a donné explicitement.
 */
@Controller("admin/production/handover")
@AdminSurface("b2b_orders")
export class HandoverController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  /**
   * **La remise SAISIE À LA MAIN**, par le numéro de commande.
   *
   * Déclarée **avant** `:token` : deux segments, donc `:token` ne l'avalerait
   * pas — mais l'ordre rend l'intention lisible sans avoir à y réfléchir.
   */
  @Post("manual/:reference")
  async confirmManually(
    @Param("reference") reference: string,
    @Req() request: AuthenticatedStaffRequest,
  ): Promise<OrderHandoverView> {
    return this.commands.execute<ConfirmManualHandoverCommand, OrderHandoverView>(
      new ConfirmManualHandoverCommand(reference, staffSubjectOf(request)),
    );
  }

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
