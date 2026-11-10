import { Injectable } from "@nestjs/common";

import { AccountEmailAmbiguousError } from "../../account/domain/errors/account-errors.js";
import { CompanyMemberRepository } from "../../account/domain/ports/company-member.repository.js";
import {
  EmailSenderAccountReader,
  type PresumedAccount,
} from "../domain/ports/email-sender-account.reader.js";

/**
 * Le compte d'une adresse, par LA règle des comptes (`findAccountByEmail` :
 * égalité normalisée, un compte connectable l'emporte sur un invité). Une
 * adresse que plusieurs comptes portent ne désigne personne : on ne choisit
 * pas pour le client.
 */
@Injectable()
export class MemberEmailSenderAccountReader extends EmailSenderAccountReader {
  constructor(private readonly members: CompanyMemberRepository) {
    super();
  }

  async presumedOf(email: string): Promise<PresumedAccount | null> {
    try {
      const account = await this.members.findAccountByEmail(email);
      return account === null ? null : { userId: account.userId };
    } catch (error) {
      if (error instanceof AccountEmailAmbiguousError) {
        return null;
      }
      throw error;
    }
  }
}
