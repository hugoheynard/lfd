import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";

import { AddCompanyContactHandler } from "./application/commands/add-company-contact.handler.js";
import { AddDeliveryAddressHandler } from "./application/commands/add-delivery-address.handler.js";
import { CreateCompanyHandler } from "./application/commands/create-company.handler.js";
import { RemoveCompanyContactHandler } from "./application/commands/remove-company-contact.handler.js";
import { RemoveDeliveryAddressHandler } from "./application/commands/remove-delivery-address.handler.js";
import { RequestActivationSupportHandler } from "./application/commands/request-activation-support.handler.js";
import { SaveBillingAddressHandler } from "./application/commands/save-billing-address.handler.js";
import { SetDefaultDeliveryAddressHandler } from "./application/commands/set-default-delivery-address.handler.js";
import { UpdateCompanyContactHandler } from "./application/commands/update-company-contact.handler.js";
import { UpdateCompanyIdentityHandler } from "./application/commands/update-company-identity.handler.js";
import { UpdateDeliveryAddressHandler } from "./application/commands/update-delivery-address.handler.js";
import { RequestPaymentTermHandler } from "./application/commands/request-payment-term.handler.js";
import { UpdateMyProfileHandler } from "./application/commands/update-my-profile.handler.js";
import { UpdatePrimaryContactHandler } from "./application/commands/update-primary-contact.handler.js";
import { UploadKbisHandler } from "./application/commands/upload-kbis.handler.js";
import { DownloadKbisHandler } from "./application/queries/download-kbis.handler.js";
import { GetMyAccountHandler } from "./application/queries/get-my-account.handler.js";
import { ListAllCompaniesHandler } from "./application/queries/list-all-companies.handler.js";
import { ListCompanyAddressesHandler } from "./application/queries/list-company-addresses.handler.js";
import { AccountReader } from "./domain/ports/account.reader.js";
import { AdminCompanyReader } from "./domain/ports/admin-company.reader.js";
import { CompanyAddressReader } from "./domain/ports/company-address.reader.js";
import { CompanyAddressRepository } from "./domain/ports/company-address.repository.js";
import { CompanyContactRepository } from "./domain/ports/company-contact.repository.js";
import { CompanyRepository } from "./domain/ports/company.repository.js";
import { CustomerIdentityPort } from "./domain/ports/customer-identity.port.js";
import { KbisStore } from "./domain/ports/kbis-store.js";
import { MembershipReader } from "./domain/ports/membership.reader.js";
import { UserProfileRepository } from "./domain/ports/user-profile.repository.js";
import { Auth0CustomerIdentity } from "./infrastructure/auth0-customer-identity.js";
import { PrismaAccountReader } from "./infrastructure/prisma-account.reader.js";
import { PrismaAdminCompanyReader } from "./infrastructure/prisma-admin-company.reader.js";
import { PrismaCompanyAddressReader } from "./infrastructure/prisma-company-address.reader.js";
import { PrismaCompanyAddressRepository } from "./infrastructure/prisma-company-address.repository.js";
import { PrismaCompanyContactRepository } from "./infrastructure/prisma-company-contact.repository.js";
import { PrismaCompanyRepository } from "./infrastructure/prisma-company.repository.js";
import { PrismaMembershipReader } from "./infrastructure/prisma-membership.reader.js";
import { PrismaUserProfileRepository } from "./infrastructure/prisma-user-profile.repository.js";
import { PrismaSupportRequestRepository } from "./infrastructure/prisma-support-request.repository.js";
import { S3KbisStore } from "./infrastructure/s3-kbis-store.js";
import { SupportRequestRepository } from "./domain/ports/support-request.repository.js";
import { AdminCompaniesController } from "./http/admin-companies.controller.js";
import { CompaniesController } from "./http/companies.controller.js";
import { CompanySupportController } from "./http/company-support.controller.js";
import { CompanyAddressesController } from "./http/company-addresses.controller.js";
import { CompanyContactsController } from "./http/company-contacts.controller.js";
import { CompanyKbisController } from "./http/company-kbis.controller.js";
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
  controllers: [
    MeController,
    CompaniesController,
    CompanyContactsController,
    CompanyKbisController,
    CompanyAddressesController,
    CompanySupportController,
    AdminCompaniesController,
  ],
  providers: [
    UpdateMyProfileHandler,
    CreateCompanyHandler,
    GetMyAccountHandler,
    UpdatePrimaryContactHandler,
    AddCompanyContactHandler,
    UpdateCompanyContactHandler,
    RemoveCompanyContactHandler,
    UploadKbisHandler,
    DownloadKbisHandler,
    SaveBillingAddressHandler,
    AddDeliveryAddressHandler,
    UpdateDeliveryAddressHandler,
    RemoveDeliveryAddressHandler,
    SetDefaultDeliveryAddressHandler,
    ListCompanyAddressesHandler,
    UpdateCompanyIdentityHandler,
    RequestPaymentTermHandler,
    RequestActivationSupportHandler,
    ListAllCompaniesHandler,
    { provide: UserProfileRepository, useClass: PrismaUserProfileRepository },
    { provide: AdminCompanyReader, useClass: PrismaAdminCompanyReader },
    { provide: CompanyRepository, useClass: PrismaCompanyRepository },
    { provide: CompanyContactRepository, useClass: PrismaCompanyContactRepository },
    { provide: CompanyAddressRepository, useClass: PrismaCompanyAddressRepository },
    { provide: CompanyAddressReader, useClass: PrismaCompanyAddressReader },
    { provide: MembershipReader, useClass: PrismaMembershipReader },
    { provide: AccountReader, useClass: PrismaAccountReader },
    { provide: CustomerIdentityPort, useClass: Auth0CustomerIdentity },
    { provide: KbisStore, useClass: S3KbisStore },
    { provide: SupportRequestRepository, useClass: PrismaSupportRequestRepository },
  ],
})
export class AccountModule {}
