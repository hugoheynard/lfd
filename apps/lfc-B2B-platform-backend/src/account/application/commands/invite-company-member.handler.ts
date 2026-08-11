import type { CompanyMemberInvitedView } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { CompanyMemberReader } from "../../domain/ports/company-member.repository.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { toMemberView } from "../queries/company-member.view.js";
import { AccountAccessGranter } from "../services/grant-account-access.service.js";
import { InviteCompanyMemberCommand } from "./invite-company-member.command.js";

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
  ) {}

  async execute(command: InviteCompanyMemberCommand): Promise<CompanyMemberInvitedView> {
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
    });

    // Relu depuis la liste : c'est la même source que l'écran, donc pas de
    // divergence possible entre ce qu'on annonce et ce qu'il affichera ensuite.
    const members = await this.members.listOf(command.companyId);
    const member = members.find((row) => row.userId === granted.userId);
    if (member === undefined) {
      // Rattaché puis introuvable : deux réponses incompatibles de la même base.
      throw new CompanyNotFoundError(command.companyId);
    }
    return { member: toMemberView(member), outcome: granted.outcome, mailSent: granted.mailSent };
  }
}
