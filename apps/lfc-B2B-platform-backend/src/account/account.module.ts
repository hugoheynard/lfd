import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";

import { CreateCompanyHandler } from "./application/commands/create-company.handler.js";
import { UpdateMyProfileHandler } from "./application/commands/update-my-profile.handler.js";
import { GetMyAccountHandler } from "./application/queries/get-my-account.handler.js";
import { AccountReader } from "./domain/ports/account.reader.js";
import { CompanyRepository } from "./domain/ports/company.repository.js";
import { CustomerIdentityPort } from "./domain/ports/customer-identity.port.js";
import { UserProfileRepository } from "./domain/ports/user-profile.repository.js";
import { Auth0CustomerIdentity } from "./infrastructure/auth0-customer-identity.js";
import { PrismaAccountReader } from "./infrastructure/prisma-account.reader.js";
import { PrismaCompanyRepository } from "./infrastructure/prisma-company.repository.js";
import { PrismaUserProfileRepository } from "./infrastructure/prisma-user-profile.repository.js";
import { CompaniesController } from "./http/companies.controller.js";
import { MeController } from "./http/me.controller.js";

/**
 * Contexte **compte** : la personne (son profil) et ses entreprises.
 *
 * Les ports sont câblés sur leurs adaptateurs ici, dans le seul fichier du
 * contexte qui connaisse les deux côtés. Les handlers, eux, ne voient que les
 * classes abstraites — c'est ce qui les rend testables avec de simples doubles,
 * sans Prisma ni réseau.
 */
@Module({
  imports: [CqrsModule],
  controllers: [MeController, CompaniesController],
  providers: [
    UpdateMyProfileHandler,
    CreateCompanyHandler,
    GetMyAccountHandler,
    { provide: UserProfileRepository, useClass: PrismaUserProfileRepository },
    { provide: CompanyRepository, useClass: PrismaCompanyRepository },
    { provide: AccountReader, useClass: PrismaAccountReader },
    { provide: CustomerIdentityPort, useClass: Auth0CustomerIdentity },
  ],
})
export class AccountModule {}
