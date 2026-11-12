import type { CompanyMemberInvitedView } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import {
  type IntentCodec,
  OncePerIntent,
  readIntentBoolean,
  readIntentString,
} from "../../../../platform/intent/once-per-intent.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { CompanyAccessOpenedEvent } from "../../domain/events/person-acts.event.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { CompanyMemberReader } from "../../domain/ports/company-member.repository.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { toMemberView } from "../queries/company-member.view.js";
import { AccountAccessGranter } from "../services/grant-account-access.service.js";
import { InviteCompanyMemberCommand } from "./invite-company-member.command.js";
import { companyNamed, personName, personRef } from "../../domain/events/journal-names.js";

/**
 * Ouvre un accès, et rend **le membre tel qu'il est ensuite**.
 *
 * L'exception à « une commande ne renvoie pas de modèle de lecture » est
 * assumée : l'écran doit dire tout de suite qui vient d'être invité et si
 * l'e-mail est parti. Relire la liste ne le dirait pas — elle ne porte pas le
 * sort de l'envoi, et le commercial a encore le client au téléphone.
 *
 * Ici, contrairement à l'ouverture d'un compte, un échec du fournisseur
 * d'identité **remonte** : l'invitation est le seul but de l'appel. L'avaler
 * laisserait croire à un accès ouvert qui n'existe pas.
 *
 * `@hors-transaction` l'ouverture d'accès appelle le fournisseur d'identité et
 * le mailer, qu'aucune transaction de base n'annule. Le fait
 * `company.access_opened` s'écrit donc APRÈS sa réussite (depuis le
 * 2026-09-19 — `GrantAccountAccess` ne journalise rien, vérifié ce jour-là) :
 * un journal en panne échoue la requête sans défaire l'accès, et le même geste
 * repasse — l'ouverture est idempotente sur l'adresse.
 *
 * **Une fois par intention** (plan `plan-service-e-mails.md`, revue, cas 4) :
 * un second clic de même clé ne rouvre rien et ne renvoie pas l'e-mail ; il
 * relit le membre et rend le `mailSent` du premier.
 */
@CommandHandler(InviteCompanyMemberCommand)
export class InviteCompanyMemberHandler implements ICommandHandler<
  InviteCompanyMemberCommand,
  CompanyMemberInvitedView
> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly members: CompanyMemberReader,
    private readonly access: AccountAccessGranter,
    private readonly events: DomainEventPublisher,
    private readonly intents: OncePerIntent,
  ) {}

  async execute(command: InviteCompanyMemberCommand): Promise<CompanyMemberInvitedView> {
    const granted = await this.intents.run(
      {
        actorId: command.invitedBy,
        key: command.intentKey,
        gesture: "account.invite-member",
        subject: intentSubject(command.companyId, {
          email: command.email,
          firstName: command.firstName,
          lastName: command.lastName,
          phone: command.phone,
          role: command.role,
        }),
      },
      INVITED_REPLAY,
      () => this.invite(command),
    );

    // Relu depuis la liste : c'est la même source que l'écran, donc pas de
    // divergence possible entre ce qu'on annonce et ce qu'il affichera ensuite.
    const members = await this.members.listOf(command.companyId);
    const member = members.find((row) => row.userId === granted.userId);
    if (member === undefined) {
      // Rattaché puis introuvable : deux réponses incompatibles de la même base.
      throw new CompanyNotFoundError(command.companyId);
    }
    return { member: toMemberView(member), mailSent: granted.mailSent };
  }

  private async invite(command: InviteCompanyMemberCommand): Promise<MemberInvited> {
    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }

    const granted = await this.access.grant({
      companyId: command.companyId,
      companyName: company.displayName(),
      email: command.email,
      firstName: command.firstName,
      lastName: command.lastName,
      phone: command.phone,
      role: command.role,
      invitedBy: command.invitedBy,
      intentKey: command.intentKey,
    });

    await this.events.publishTraced(
      new CompanyAccessOpenedEvent(
        companyNamed(command.companyId, company),
        personRef(granted.userId, personName(command.firstName, command.lastName)),
        command.role,
      ),
    );
    return { userId: granted.userId, mailSent: granted.mailSent };
  }
}

/** Ce que l'invitation garde pour un second clic : qui, et si l'e-mail est parti. */
interface MemberInvited {
  readonly userId: string;
  readonly mailSent: boolean;
}

const INVITED_REPLAY: IntentCodec<MemberInvited> = {
  write: (result) => ({ userId: result.userId, mailSent: result.mailSent }),
  read: (record, gesture) => ({
    userId: readIntentString(record, "userId", gesture),
    mailSent: readIntentBoolean(record, "mailSent", gesture),
  }),
};
