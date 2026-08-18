import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";

import { ListPickupAddressesHandler } from "./application/list-pickup-addresses.handler.js";
import {
  CreatePickupAddressHandler,
  RemovePickupAddressHandler,
  SetDefaultPickupAddressHandler,
  UpdatePickupAddressHandler,
} from "./application/pickup-address.handlers.js";
import { PickupAddressRepository } from "./domain/pickup-address.repository.js";
import { PrismaPickupAddressRepository } from "./infrastructure/prisma-pickup-address.repository.js";
import { AdminPickupAddressesController } from "./http/admin-pickup-addresses.controller.js";
import { PickupAddressesController } from "./http/pickup-addresses.controller.js";

/**
 * **Points de retrait** (globaux) — le fallback d'acheminement tant que la
 * livraison n'existe pas. Exporte `PickupAddressRepository` : le contexte
 * `orders` en a besoin pour figer le snapshot d'une commande retrait.
 */
@Module({
  imports: [CqrsModule],
  controllers: [PickupAddressesController, AdminPickupAddressesController],
  providers: [
    { provide: PickupAddressRepository, useClass: PrismaPickupAddressRepository },
    ListPickupAddressesHandler,
    CreatePickupAddressHandler,
    UpdatePickupAddressHandler,
    RemovePickupAddressHandler,
    SetDefaultPickupAddressHandler,
  ],
  exports: [PickupAddressRepository],
})
export class PickupAddressesModule {}
