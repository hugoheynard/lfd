import { Body, Controller, HttpCode, HttpStatus, Param, Put } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import {
  assignCreditorIdentifierPayloadSchema,
  setCreditorAccountPayloadSchema,
  setPreNotificationPayloadSchema,
  type AssignCreditorIdentifierPayload,
  type SetCreditorAccountPayload,
  type SetPreNotificationPayload,
} from "@lfd/contracts";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import {
  AssignCreditorIdentifierCommand,
  SetCreditorAccountCommand,
  SetPreNotificationCommand,
} from "../application/commands/legal-entity-commands.js";

/**
 * **Ce qui décide de l'encaissement** — l'ICS, le compte, le délai de
 * pré-notification.
 *
 * Ces trois gestes avaient déjà chacun leur route plutôt que d'être des champs
 * de la correction, et le motif était écrit : **ranger un geste sans retour
 * parmi cinq champs qui se corrigent tous les jours est la meilleure façon de
 * le faire poser par mégarde.** Les sortir dans leur propre surface prolonge ce
 * raisonnement d'un cran — on ne les croise plus en lisant le registre.
 *
 * Ce qui les réunit n'est pas leur forme (trois `PUT` de un champ) mais leur
 * conséquence : chacun engage de l'argent qui arrive, ou un document déjà
 * signé. C'est la surface qu'on relit quand quelque chose a été détourné.
 *
 * ⚠️ Même ressource de permission que le registre (`b2b_accounting`), et c'est
 * volontaire : la distinction fine est déjà faite entre `b2b_accounting` et
 * `b2b_payments` — enregistrer le mandat d'un client est un travail quotidien,
 * changer le compte qui reçoit l'argent de l'entreprise est la cible numéro un
 * de la fraude au virement. Redécouper à l'intérieur d'`accounting` donnerait
 * l'illusion d'un mur là où il n'y en a pas.
 */
@Controller("admin/accounting/legal-entities")
@AdminSurface("b2b_accounting")
export class AdminLegalEntityBankingController {
  constructor(private readonly commands: CommandBus) {}

  /**
   * Attribue l'ICS. **Irréversible** — l'agrégat refuse d'en poser un second, et
   * répond 409 en nommant celui qui est déjà en place.
   */
  @Put(":id/creditor-identifier")
  @HttpCode(HttpStatus.NO_CONTENT)
  async assignIcs(
    @Param("id") id: string,
    @Body(new ZodBody(assignCreditorIdentifierPayloadSchema))
    payload: AssignCreditorIdentifierPayload,
  ): Promise<void> {
    await this.commands.execute(new AssignCreditorIdentifierCommand(id, payload.ics));
  }

  /**
   * Enregistre le compte où l'argent arrive.
   *
   * L'IBAN monte ici en clair — le seul endroit du système — et ne redescend
   * par aucune route : `LegalEntityView` n'en porte que quatre caractères. Le
   * **BIC** monte par la même route et redescend en entier : il désigne une
   * banque, pas un compte.
   *
   * Les deux sont exigés **ensemble**, parce qu'ils se lisent sur le même RIB.
   */
  @Put(":id/creditor-account")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setAccount(
    @Param("id") id: string,
    @Body(new ZodBody(setCreditorAccountPayloadSchema)) payload: SetCreditorAccountPayload,
  ): Promise<void> {
    await this.commands.execute(new SetCreditorAccountCommand(id, payload.iban, payload.bic));
  }

  /**
   * Le délai annoncé au débiteur entre l'avis et le débit. Il se **négocie avec
   * la banque** : c'est une saisie, pas un réglage technique, et deux entités
   * peuvent ne pas avoir le même.
   */
  @Put(":id/pre-notification")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setPreNotification(
    @Param("id") id: string,
    @Body(new ZodBody(setPreNotificationPayloadSchema)) payload: SetPreNotificationPayload,
  ): Promise<void> {
    await this.commands.execute(new SetPreNotificationCommand(id, payload.days));
  }
}
