import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { type OrderHandoverView } from "@lfd/contracts";
import { Controller, Get, Param, Post, Req, UnauthorizedException } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import type { AuthenticatedStaffRequest } from "../../../platform/auth/staff-principal.js";
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
 * 🔴 **Depuis le 2026-09-07, les DEUX acheminements passent par ici.** Le
 * retrait comme la livraison : en coursier, le destinataire montre le code de
 * son courriel et c'est le coursier qui scanne, avec sa session staff. Même
 * jeton, même porte, même geste — ce qui reste ferme, c'est qu'il faut être
 * deux.
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

  /**
   * **La remise SAISIE À LA MAIN**, par le numéro de commande.
   *
   * Le chemin de secours, et la raison pour laquelle la règle de l'autoscan
   * tient : le destinataire n'a pas toujours son courriel — un magasinier,
   * quelqu'un d'autre à l'accueil, un téléphone déchargé. Sans cette porte,
   * quelqu'un demanderait d'imprimer le code sur le colis « juste pour les
   * livraisons difficiles », et un coursier scannerait son propre carton.
   *
   * Déclarée **avant** `:token` : deux segments, donc `:token` ne l'avalerait
   * pas — mais l'ordre rend l'intention lisible sans avoir à y réfléchir.
   *
   * Elle grave `via: "manual"`. Une remise saisie n'a eu qu'UNE partie : la
   * présenter comme un scan la rendrait fausse plutôt que faible.
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
