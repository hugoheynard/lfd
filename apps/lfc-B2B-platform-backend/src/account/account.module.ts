import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";

import { PlatformSettingsModule } from "../platform-settings/platform-settings.module.js";
import { ActivateCompanyByStaffHandler } from "./application/commands/activate-company.handler.js";
import { AddCompanyContactHandler } from "./application/commands/add-company-contact.handler.js";
import {
  AddDeliveryAddressByStaffHandler,
  SaveBillingAddressByStaffHandler,
  GrantTermsHandler,
  PreferFulfillmentByStaffHandler,
  UpdateIdentityByStaffHandler,
  UploadKbisByStaffHandler,
} from "./application/commands/admin-company.handlers.js";
import { AddDeliveryAddressHandler } from "./application/commands/add-delivery-address.handler.js";
import { CreateCompanyByStaffHandler } from "./application/commands/create-company-by-staff.handler.js";
import { CreateCompanyHandler } from "./application/commands/create-company.handler.js";
import { RemoveCompanyContactHandler } from "./application/commands/remove-company-contact.handler.js";
import { RemoveDeliveryAddressHandler } from "./application/commands/remove-delivery-address.handler.js";
import { HandleSupportRequestHandler } from "./application/commands/handle-support-request.handler.js";
import { RequestActivationSupportHandler } from "./application/commands/request-activation-support.handler.js";
import { ListSupportRequestsHandler } from "./application/queries/list-support-requests.handler.js";
import { SaveBillingAddressHandler } from "./application/commands/save-billing-address.handler.js";
import { SetDefaultDeliveryAddressHandler } from "./application/commands/set-default-delivery-address.handler.js";
import { UpdateCompanyContactHandler } from "./application/commands/update-company-contact.handler.js";
import { UpdateCompanyIdentityHandler } from "./application/commands/update-company-identity.handler.js";
import { UpdateDeliveryAddressHandler } from "./application/commands/update-delivery-address.handler.js";
import { RequestPaymentTermHandler } from "./application/commands/request-payment-term.handler.js";
import { UpdateMyProfileHandler } from "./application/commands/update-my-profile.handler.js";
import { UpdateNavPreferencesHandler } from "./application/commands/update-nav-preferences.handler.js";
import { UpdatePrimaryContactHandler } from "./application/commands/update-primary-contact.handler.js";
import { UploadKbisHandler } from "./application/commands/upload-kbis.handler.js";
import { DownloadKbisHandler } from "./application/queries/download-kbis.handler.js";
import { GetMyAccountHandler } from "./application/queries/get-my-account.handler.js";
import { GetCompanyForStaffHandler } from "./application/queries/get-company-for-staff.handler.js";
import { ListAllCompaniesHandler } from "./application/queries/list-all-companies.handler.js";
import { ListCompanyAddressesHandler } from "./application/queries/list-company-addresses.handler.js";
import { AccountReader } from "./domain/ports/account.reader.js";
import { AdminCompanyReader } from "./domain/ports/admin-company.reader.js";
import { CompanyAddressReader } from "./domain/ports/company-address.reader.js";
import { CompanyAddressRepository } from "./domain/ports/company-address.repository.js";
import { CompanyContactRepository } from "./domain/ports/company-contact.repository.js";
import { CompanyRepository } from "./domain/ports/company.repository.js";
import { CustomerIdentityPort } from "./domain/ports/customer-identity.port.js";
import {
  CompanyMemberReader,
  CompanyMemberRepository,
} from "./domain/ports/company-member.repository.js";
import {
  AccountAccessGranter,
  GrantAccountAccess,
} from "./application/services/grant-account-access.service.js";
import { CompanyContactBook } from "./application/services/company-contact-book.service.js";
import { ListCompanyMembersHandler } from "./application/queries/list-company-members.handler.js";
import { InviteCompanyMemberHandler } from "./application/commands/invite-company-member.handler.js";
import {
  AddContactByStaffHandler,
  RemoveContactByStaffHandler,
  UpdateContactByStaffHandler,
  UpdatePrimaryContactByStaffHandler,
} from "./application/commands/admin-contact.handlers.js";
import { EstablishmentDirectory } from "./domain/ports/establishment-directory.js";
import { OnCompanyDeclaredResolveNaf } from "./application/handlers/on-company-declared-resolve-naf.handler.js";
import { RechercheEntreprisesEstablishmentDirectory } from "./infrastructure/recherche-entreprises-establishment.directory.js";
import { MembershipReader } from "./domain/ports/membership.reader.js";
import { NavPreferencesRepository } from "./domain/ports/nav-preferences.repository.js";
import { UserProfileRepository } from "./domain/ports/user-profile.repository.js";
import { Auth0CustomerIdentity } from "./infrastructure/auth0-customer-identity.js";
import { Auth0ManagementClient } from "./infrastructure/auth0-management.client.js";
import {
  PrismaCompanyMemberReader,
  PrismaCompanyMemberRepository,
} from "./infrastructure/prisma-company-member.repository.js";
import { PrismaAccountReader } from "./infrastructure/prisma-account.reader.js";
import { PrismaAdminCompanyReader } from "./infrastructure/prisma-admin-company.reader.js";
import { PrismaCompanyAddressReader } from "./infrastructure/prisma-company-address.reader.js";
import { PrismaCompanyAddressRepository } from "./infrastructure/prisma-company-address.repository.js";
import { PrismaCompanyContactRepository } from "./infrastructure/prisma-company-contact.repository.js";
import { PrismaCompanyRepository } from "./infrastructure/prisma-company.repository.js";
import { PrismaMembershipReader } from "./infrastructure/prisma-membership.reader.js";
import { PrismaNavPreferencesRepository } from "./infrastructure/prisma-nav-preferences.repository.js";
import { PrismaUserProfileRepository } from "./infrastructure/prisma-user-profile.repository.js";
import { PrismaSupportRequestRepository } from "./infrastructure/prisma-support-request.repository.js";
import { SupportRequestRepository } from "./domain/ports/support-request.repository.js";
import { AdminCompaniesController } from "./http/admin-companies.controller.js";
import { AdminCompanyMembersController } from "./http/admin-company-members.controller.js";
import { AdminCompanyContactsController } from "./http/admin-company-contacts.controller.js";
import { AdminCompanyPiecesController } from "./http/admin-company-pieces.controller.js";
import { CompaniesController } from "./http/companies.controller.js";
import { AdminSupportController } from "./http/admin-support.controller.js";
import { SupportController } from "./http/support.controller.js";
import { ChangeCompanyStatusHandler } from "./application/commands/change-company-status.handler.js";
import { GetCustomerSheetHandler } from "./application/queries/get-customer-sheet.handler.js";
import { CustomerSheetReader } from "./domain/ports/customer-sheet.reader.js";
import { PrismaCustomerSheetReader } from "./infrastructure/prisma-customer-sheet.reader.js";
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
  imports: [CqrsModule, PlatformSettingsModule],
  controllers: [
    MeController,
    CompaniesController,
    CompanyContactsController,
    CompanyKbisController,
    CompanyAddressesController,
    SupportController,
    AdminSupportController,
    AdminCompaniesController,
    AdminCompanyMembersController,
    AdminCompanyContactsController,
    AdminCompanyPiecesController,
  ],
  providers: [
    UpdateMyProfileHandler,
    UpdateNavPreferencesHandler,
    CreateCompanyHandler,
    CreateCompanyByStaffHandler,
    ListCompanyMembersHandler,
    InviteCompanyMemberHandler,
    UpdatePrimaryContactByStaffHandler,
    AddContactByStaffHandler,
    UpdateContactByStaffHandler,
    RemoveContactByStaffHandler,
    { provide: AccountAccessGranter, useClass: GrantAccountAccess },
    // Le carnet d'interlocuteurs : ses deux règles (une adresse, un rôle) valent
    // pour les deux portes, elles ne vivent donc pas dans les handlers.
    CompanyContactBook,
    Auth0ManagementClient,
    { provide: CompanyMemberReader, useClass: PrismaCompanyMemberReader },
    { provide: CompanyMemberRepository, useClass: PrismaCompanyMemberRepository },
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
    GetCompanyForStaffHandler,
    UpdateCompanyIdentityHandler,
    RequestPaymentTermHandler,
    ActivateCompanyByStaffHandler,
    ChangeCompanyStatusHandler,
    GetCustomerSheetHandler,
    UploadKbisByStaffHandler,
    UpdateIdentityByStaffHandler,
    GrantTermsHandler,
    PreferFulfillmentByStaffHandler,
    SaveBillingAddressByStaffHandler,
    AddDeliveryAddressByStaffHandler,
    RequestActivationSupportHandler,
    HandleSupportRequestHandler,
    ListSupportRequestsHandler,
    ListAllCompaniesHandler,
    { provide: UserProfileRepository, useClass: PrismaUserProfileRepository },
    { provide: NavPreferencesRepository, useClass: PrismaNavPreferencesRepository },
    { provide: AdminCompanyReader, useClass: PrismaAdminCompanyReader },
    { provide: CustomerSheetReader, useClass: PrismaCustomerSheetReader },
    { provide: CompanyRepository, useClass: PrismaCompanyRepository },
    { provide: CompanyContactRepository, useClass: PrismaCompanyContactRepository },
    { provide: CompanyAddressRepository, useClass: PrismaCompanyAddressRepository },
    { provide: CompanyAddressReader, useClass: PrismaCompanyAddressReader },
    { provide: MembershipReader, useClass: PrismaMembershipReader },
    { provide: AccountReader, useClass: PrismaAccountReader },
    { provide: CustomerIdentityPort, useClass: Auth0CustomerIdentity },
    { provide: SupportRequestRepository, useClass: PrismaSupportRequestRepository },
    OnCompanyDeclaredResolveNaf,
    { provide: EstablishmentDirectory, useClass: RechercheEntreprisesEstablishmentDirectory },
  ],
})
export class AccountModule {}
