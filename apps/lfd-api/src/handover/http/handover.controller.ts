import { type HandoverQueueView, type OrderHandoverView } from "@lfd/contracts";
import { Controller, Get, Param, Post, Query, Req, UnauthorizedException } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import type { AuthenticatedStaffRequest } from "../../platform/auth/staff-principal.js";
import { ConfirmHandoverCommand } from "../application/commands/confirm-handover.command.js";
import { ConfirmManualHandoverCommand } from "../application/commands/confirm-manual-handover.command.js";
import { GetHandoverByOrderQuery } from "../application/queries/get-handover-by-order.query.js";
import { GetHandoverQueueQuery } from "../application/queries/get-handover-queue.query.js";
import { GetHandoverQuery } from "../application/queries/get-handover.query.js";

/**
 * **Les deux chemins de cette surface**, et pourquoi il y en a deux.
 *
 * 🔴 `admin/production/handover` est **déprécié**, pas mort. Le back-office est
 * une SPA déployée par SON PROPRE workflow, indépendant de celui de l'API : un
 * onglet resté ouvert garde son bundle, et le QR d'un client peut l'ouvrir à
 * tout moment. Le `CLAUDE.md` §0 est explicite — « Un contrat déjà servi ne se
 * casse pas. […] il se déprécie, il ne disparaît pas dans le même déploiement. »
 *
 * Le retrait de l'ancien chemin est une tranche à part, au déploiement suivant.
 * Nest accepte un tableau de préfixes : les deux servent les mêmes handlers,
 * donc il n'y a **rien à maintenir en double** — c'est ce qui rend la
 * dépréciation gratuite, et donc tenable.
 */
const HANDOVER_ROUTES = ["admin/handover", "admin/production/handover"];

/**
 * La **remise** — la surface que le QR d'un client ouvre, et son chemin de
 * secours.
 *
 * Le parcours physique : le client présente son écran, le staff scanne avec
 * l'appareil photo natif de son téléphone, l'URL ouvre l'app admin, il vérifie
 * le sac et confirme. Aucun lecteur de code-barres, aucune app à installer —
 * un QR qui encode une URL est déjà scannable par tous les téléphones du monde.
 *
 * 🔴 **Cette surface a déjà déménagé deux fois** : du commerce vers le fournil le
 * 2026-09-07, puis du fournil vers son propre contexte le 2026-09-10. C'est au labo qu'on retire — le client s'y présente, le coursier
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
@Controller(HANDOVER_ROUTES)
@AdminSurface("b2b_orders")
export class HandoverController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  /**
   * **La file du comptoir** pour un jour de service.
   *
   * Déclarée **avant** `:token`, et ce n'est pas cosmétique : `file` est un
   * segment unique, donc `@Get(":token")` l'avalerait et chercherait un jeton
   * nommé « file ». L'ordre de déclaration est ce qui décide chez Nest.
   *
   * Le jour est **obligatoire** et arrive du client. Le serveur ne le déduit pas
   * de son horloge : un comptoir ouvert à cheval sur minuit, ou un écran laissé
   * ouvert toute la nuit, montreraient alors la mauvaise journée sans que
   * personne comprenne pourquoi.
   */
  @Get("file")
  async queue(@Query("jour") day: string): Promise<HandoverQueueView> {
    return this.queries.execute<GetHandoverQueueQuery, HandoverQueueView>(
      new GetHandoverQueueQuery(day),
    );
  }

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

  /**
   * **Ce qu'il y a dans le sac d'une commande de la file** — mêmes octets que
   * l'écran du scan, atteints par l'identifiant que la file vient de rendre.
   *
   * Déclarée **avant** `:token` : deux segments, donc `:token` ne l'avalerait
   * pas — mais l'ordre rend l'intention lisible sans y réfléchir.
   *
   * 🔴 Elle existe pour que le rail cesse d'appeler `admin/orders/:id`, qui rend
   * l'`OrderView` du client — prix, TVA, totaux, trace de négociation — sur un
   * poste où quelqu'un attend en face.
   */
  @Get("order/:id")
  async byOrder(@Param("id") orderId: string): Promise<OrderHandoverView> {
    return this.queries.execute<GetHandoverByOrderQuery, OrderHandoverView>(
      new GetHandoverByOrderQuery(orderId),
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
