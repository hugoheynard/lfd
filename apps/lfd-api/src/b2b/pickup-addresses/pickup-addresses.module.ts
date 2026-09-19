import { Module } from "@nestjs/common";

import { GetPublicPickupScheduleHandler } from "./application/get-public-pickup-schedule.handler.js";
import { ListPickupAddressesHandler } from "./application/list-pickup-addresses.handler.js";
import { ListPublicPickupSlotsHandler } from "./application/list-public-pickup-slots.handler.js";
import { SavePublicPickupScheduleHandler } from "./application/save-public-pickup-schedule.handler.js";
import { CreatePickupAddressHandler } from "./application/create-pickup-address.handler.js";
import { RemovePickupAddressHandler } from "./application/remove-pickup-address.handler.js";
import { SetDefaultPickupAddressHandler } from "./application/set-default-pickup-address.handler.js";
import { UpdatePickupAddressHandler } from "./application/update-pickup-address.handler.js";
import { PickupAddressRepository } from "./domain/pickup-address.repository.js";
import { PickupScheduleRepository } from "./domain/pickup-schedule.repository.js";
import { PublicPickupScheduleReader } from "./domain/public-pickup-schedule.reader.js";
import { PrismaPickupAddressRepository } from "./infrastructure/prisma-pickup-address.repository.js";
import { PrismaPickupScheduleRepository } from "./infrastructure/prisma-pickup-schedule.repository.js";
import { PrismaPublicPickupScheduleReader } from "./infrastructure/prisma-public-pickup-schedule.reader.js";
import { AdminPickupAddressesController } from "./http/admin-pickup-addresses.controller.js";
import { PickupAddressesController } from "./http/pickup-addresses.controller.js";

/**
 * **Points de retrait** (globaux) — le fallback d'acheminement tant que la
 * livraison n'existe pas. Exporte `PickupAddressRepository` : le contexte
 * `orders` en a besoin pour figer le snapshot d'une commande retrait.
 */
@Module({
  controllers: [PickupAddressesController, AdminPickupAddressesController],
  providers: [
    { provide: PickupAddressRepository, useClass: PrismaPickupAddressRepository },
    // L'horaire PUBLIC : deux ports, un par sens (ISP). Un écran qui affiche une
    // grille n'a rien à faire d'un port capable de la réécrire.
    { provide: PickupScheduleRepository, useClass: PrismaPickupScheduleRepository },
    { provide: PublicPickupScheduleReader, useClass: PrismaPublicPickupScheduleReader },
    ListPickupAddressesHandler,
    CreatePickupAddressHandler,
    UpdatePickupAddressHandler,
    RemovePickupAddressHandler,
    SetDefaultPickupAddressHandler,
    SavePublicPickupScheduleHandler,
    GetPublicPickupScheduleHandler,
    // La surface PUBLIQUE des créneaux : elle ne sert que des heures, jamais
    // les règles qui les produisent.
    ListPublicPickupSlotsHandler,
  ],
  exports: [PickupAddressRepository],
})
export class PickupAddressesModule {}
