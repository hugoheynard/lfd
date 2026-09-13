import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { NoIssuerError } from "../../../accounting/domain/errors/accounting-errors.js";
import { CreditorReader } from "../../../accounting/domain/ports/creditor.reader.js";
import { Clock } from "../../../../platform/time/clock.js";
import { SecretGenerator } from "../../../../platform/secret/secret-generator.js";
import {
  CompanyNotFoundForMandateError,
  MandateDraftAlreadyExistsError,
} from "../../domain/errors/mandate-errors.js";
import { mintMandate } from "../../domain/entities/payment-mandate.js";
import { PaymentMandateRepository } from "../../domain/payment-mandate.repository.js";
import { Rum } from "../../domain/value-objects/rum.js";
import { MintMandateCommand } from "./mint-mandate.command.js";

/**
 * Frappe un mandat **maison** : une RUM neuve, un émetteur nommé, aucune
 * signature.
 *
 * ## L'ordre des refus, et pourquoi il n'est pas indifférent
 *
 * On refuse **avant** de tirer la référence, jamais après. Une RUM consomme un
 * tirage et porte l'horodatage de sa frappe : en fabriquer une qu'on jette
 * ensuite laisserait croire, à la lecture des journaux, qu'un mandat a existé
 * ce jour-là. Les trois gardes — société connue, émetteur unique, pas de
 * brouillon en cours — sont donc toutes en amont.
 *
 * ## Le brouillon en cours se refuse ici ET en base
 *
 * L'index partiel `one_draft_per_company` tient la règle pour de bon ; ce
 * refus-ci n'existe que pour la **dire**. Sans lui, deux clics rapides rendent
 * une violation de contrainte remontée en 500, c'est-à-dire « erreur
 * inattendue » à quelqu'un qui a simplement cliqué deux fois. Le message nomme
 * le geste de sortie — ouvrir le brouillon existant, ou l'abandonner.
 *
 * 🔴 **`findDraft` et pas `findCurrent`.** En rotation bancaire, un mandat actif
 * est toujours en vigueur pendant qu'on frappe son remplaçant : `findCurrent`
 * rendrait l'actif et ne verrait jamais le brouillon.
 *
 * ## Ce que la frappe ne fait PAS
 *
 * Elle ne lit pas le RIB du client, et n'échoue pas s'il manque. Un mandat
 * existe pour être imprimé et signé ; le compte à débiter peut être recopié
 * après, et l'exiger d'abord imposerait un ordre que le terrain ne suit pas.
 * C'est l'impression qui refusera, en nommant ce qui manque.
 */
@CommandHandler(MintMandateCommand)
export class MintMandateHandler implements ICommandHandler<MintMandateCommand, string> {
  constructor(
    private readonly mandates: PaymentMandateRepository,
    private readonly creditors: CreditorReader,
    private readonly clock: Clock,
    private readonly secrets: SecretGenerator,
  ) {}

  async execute(command: MintMandateCommand): Promise<string> {
    const holder = await this.mandates.findHolder(command.companyId);
    if (holder === null) {
      throw new CompanyNotFoundForMandateError(command.companyId);
    }

    const creditor = await this.creditors.soleIssuer();
    if (creditor === null) {
      throw new NoIssuerError();
    }

    const existing = await this.mandates.findDraft(command.companyId);
    if (existing !== null) {
      throw new MandateDraftAlreadyExistsError(existing.toSnapshot().reference);
    }

    const rum = Rum.mint({
      customerReference: holder.reference,
      at: this.clock.now(),
      secret: this.secrets.next(),
    });

    return this.mandates.create(
      mintMandate({
        companyId: command.companyId,
        creditorId: creditor.legalEntityId,
        reference: rum.value,
      }),
    );
  }
}
