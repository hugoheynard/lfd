import { Module } from "@nestjs/common";

import { PricingModule } from "../pricing/pricing.module.js";
import { PromotionPickupDiscountAnnouncer } from "../promotions/application/promotion-pickup-discount.announcer.js";
import { PickupDiscountAnnouncer } from "./domain/pickup-discount.announcer.js";
import { AnnouncedPickupAddressRepository } from "./infrastructure/announced-pickup-address.repository.js";
import { GetPublicPickupScheduleHandler } from "./application/get-public-pickup-schedule.handler.js";
import { ListPickupAddressesHandler } from "./application/list-pickup-addresses.handler.js";
import { ListPublicPickupSlotsHandler } from "./application/list-public-pickup-slots.handler.js";
import { SavePublicPickupScheduleHandler } from "./application/save-public-pickup-schedule.handler.js";
import { CreatePickupAddressHandler } from "./application/create-pickup-address.handler.js";
import { RemovePickupAddressHandler } from "./application/remove-pickup-address.handler.js";
import { UpdatePickupAddressHandler } from "./application/update-pickup-address.handler.js";
import { PickupAddressRepository } from "./domain/pickup-address.repository.js";
import { PickupScheduleRepository } from "./domain/pickup-schedule.repository.js";
import { PublicPickupScheduleReader } from "./domain/public-pickup-schedule.reader.js";
import { PrismaPickupAddressRepository } from "./infrastructure/prisma-pickup-address.repository.js";
import { PrismaPickupScheduleRepository } from "./infrastructure/prisma-pickup-schedule.repository.js";
import { PrismaPublicPickupScheduleReader } from "./infrastructure/prisma-public-pickup-schedule.reader.js";
import { AdminPickupAddressesController } from "./http/admin-pickup-addresses.controller.js";
import { PickupAddressesController } from "./http/pickup-addresses.controller.js";
import { SitesModule } from "../sites/sites.module.js";
import { PickupPointNames } from "../account/domain/ports/pickup-point-names.js";
import { SitePickupPointNames } from "./infrastructure/site-pickup-point-names.js";

/**
 * **Points de retrait** (globaux) — les sites qui remettent, vus du client.
 * Exporte `PickupAddressRepository` : le contexte `orders` en a besoin pour
 * figer le snapshot d'une commande retrait. Ses gestes d'écriture passent par
 * l'agrégat `Site` (`SitesModule`, lot S1), qu'il réexporte.
 */
@Module({
  // `PricingModule` pour la source des promotions : la bascule ferme la remise
  // des sites (plan des promotions, L8) et l'annonce lit les promotions.
  imports: [SitesModule, PricingModule],
  controllers: [PickupAddressesController, AdminPickupAddressesController],
  providers: [
    // La remise annoncée suit la source des promotions (L8) : le port est le
    // décorateur, l'adaptateur Prisma en est la lecture brute.
    PrismaPickupAddressRepository,
    { provide: PickupDiscountAnnouncer, useClass: PromotionPickupDiscountAnnouncer },
    { provide: PickupAddressRepository, useClass: AnnouncedPickupAddressRepository },
    // L'horaire PUBLIC : deux ports, un par sens (ISP). Un écran qui affiche une
    // grille n'a rien à faire d'un port capable de la réécrire.
    { provide: PickupScheduleRepository, useClass: PrismaPickupScheduleRepository },
    { provide: PublicPickupScheduleReader, useClass: PrismaPublicPickupScheduleReader },
    ListPickupAddressesHandler,
    CreatePickupAddressHandler,
    UpdatePickupAddressHandler,
    RemovePickupAddressHandler,
    SavePublicPickupScheduleHandler,
    GetPublicPickupScheduleHandler,
    // La surface PUBLIQUE des créneaux : elle ne sert que des heures, jamais
    // les règles qui les produisent.
    ListPublicPickupSlotsHandler,
    // Le port que les comptes et les paniers déclarent pour nommer un point
    // au journal (§7 du plan des phrases, 2026-10-30).
    { provide: PickupPointNames, useClass: SitePickupPointNames },
  ],
  exports: [PickupAddressRepository, PickupPointNames, SitesModule],
})
export class PickupAddressesModule {}
