import { CommandBus, CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { SendMailCopyTrialCommand } from "../../../copy/application/commands/send-mail-copy-trial.command.js";
import { MailCopyManifest } from "../../../copy/domain/mail-copy-manifest.js";
import { MailCopyAdminReader } from "../../../copy/domain/ports/mail-copy-admin.reader.js";
import {
  UnknownMailCaseError,
  UnknownMailTemplateError,
} from "../../domain/mail-document-errors.js";
import { MailTemplateDocument } from "../../domain/mail-template-document.js";
import { MailDocumentReader } from "../../domain/ports/mail-document.reader.js";
import { MailTemplateCatalogue } from "../../domain/ports/mail-template-catalogue.js";
import { startingDocumentOf } from "../mail-editor-view.js";
import { SendMailDocumentTrialCommand } from "./send-mail-document-trial.command.js";

/**
 * L'essai de l'éditeur : résout le document que l'éditeur montre (le
 * brouillon, sinon le publié, sinon le document de départ) et le cas, puis
 * passe par **la commande d'essai de l'écran des textes**
 * (`SendMailCopyTrialCommand`) — une seule règle : l'adresse de la fiche de
 * l'appelant et elle seule, une fois par intention, le fait au journal.
 *
 * @sans-journal le fait `mail_copy.trial_sent` est écrit par la commande
 * déléguée ; en écrire un second ici doublerait l'essai au journal.
 */
@CommandHandler(SendMailDocumentTrialCommand)
export class SendMailDocumentTrialHandler implements ICommandHandler<
  SendMailDocumentTrialCommand,
  void
> {
  constructor(
    private readonly catalogue: MailTemplateCatalogue,
    private readonly reader: MailDocumentReader,
    private readonly copy: MailCopyAdminReader,
    private readonly manifest: MailCopyManifest,
    private readonly commands: CommandBus,
  ) {}

  /**
   * @throws {UnknownMailTemplateError} l'e-mail n'est pas au registre.
   * @throws {UnknownMailCaseError} l'e-mail n'a pas ce cas.
   * @throws {TrialRecipientMissingError} la fiche n'a pas d'adresse active.
   */
  async execute(command: SendMailDocumentTrialCommand): Promise<void> {
    const entry = this.catalogue.find(command.template);
    if (entry === null) {
      throw new UnknownMailTemplateError(command.template);
    }
    if (!entry.cases.some((candidate) => candidate.id === command.caseId)) {
      throw new UnknownMailCaseError(command.template, command.caseId);
    }
    const [state, orders] = await Promise.all([
      this.reader.stateOf(command.template),
      this.copy.sectionOrders(),
    ]);
    const document = (
      state === null
        ? MailTemplateDocument.untouched(command.template)
        : MailTemplateDocument.reconstitute(state)
    ).current(startingDocumentOf(entry, orders, this.manifest)).document;
    await this.commands.execute<SendMailCopyTrialCommand, void>(
      new SendMailCopyTrialCommand(
        command.template,
        command.locale,
        "draft",
        command.staffUserId,
        command.intentKey,
        { caseId: command.caseId, document },
      ),
    );
  }
}
