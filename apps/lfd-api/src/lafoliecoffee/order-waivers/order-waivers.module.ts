import { Module } from "@nestjs/common";

import { OrderCutoffWaiverGate } from "../orders/domain/ports/order-cutoff-waiver.gate.js";
import { OrderLateFeeRepository } from "./domain/order-late-fee.repository.js";
import { ClearOrderLateFeeHandler } from "./application/clear-order-late-fee.handler.js";
import { GrantOrderCutoffWaiverHandler } from "./application/grant-order-cutoff-waiver.handler.js";
import { ListOpenOrderCutoffWaiversHandler } from "./application/list-open-order-cutoff-waivers.handler.js";
import { ListOrderCutoffWaiversHandler } from "./application/list-order-cutoff-waivers.handler.js";
import { OpenOrderCutoffWaiverReader } from "./domain/open-order-cutoff-waiver.reader.js";
import { PrismaOpenOrderCutoffWaiverReader } from "./infrastructure/prisma-open-order-cutoff-waiver.reader.js";
import { ReadOrderLateFeeHandler } from "./application/read-order-late-fee.handler.js";
import { RevokeOrderCutoffWaiverHandler } from "./application/revoke-order-cutoff-waiver.handler.js";
import { SaveOrderLateFeeHandler } from "./application/save-order-late-fee.handler.js";
import { OrderCutoffWaiverRepository } from "./domain/order-cutoff-waiver.repository.js";
import { AdminOrderCutoffWaiversController } from "./http/admin-order-cutoff-waivers.controller.js";
import { AdminOrderLateFeeController } from "./http/admin-order-late-fee.controller.js";
import { PrismaOrderCutoffWaiverGate } from "./infrastructure/prisma-order-cutoff-waiver.gate.js";
import { PrismaOrderLateFeeRepository } from "./infrastructure/prisma-order-late-fee.repository.js";
import { PrismaOrderCutoffWaiverRepository } from "./infrastructure/prisma-order-cutoff-waiver.repository.js";
import { PrismaOpenWaiverReader } from "./infrastructure/prisma-open-waiver.reader.js";
import { RepositoryLateFeeSettingReader } from "./infrastructure/repository-late-fee-setting.reader.js";
import {
  LateFeeSettingReader,
  OpenWaiverReader,
} from "../order-cutoffs/domain/deadline/ports/deadline-sources.js";

/**
 * **Dérogations d'heure limite** — l'autorisation de commander en retard.
 *
 * Deux ports, et c'est délibéré : `OrderCutoffWaiverRepository` est la surface
 * d'ADMINISTRATION (accorder, retirer, lister), `OrderCutoffWaiverGate` celle de
 * la PASSATION (consulter, consommer). Un consommateur ne dépend que des
 * méthodes qu'il appelle — et composer une commande n'autorise pas à accorder
 * une exception.
 *
 * Le second est exporté : c'est le contexte `orders` qui l'appelle.
 */
@Module({
  controllers: [AdminOrderCutoffWaiversController, AdminOrderLateFeeController],
  providers: [
    { provide: OrderCutoffWaiverRepository, useClass: PrismaOrderCutoffWaiverRepository },
    { provide: OrderCutoffWaiverGate, useClass: PrismaOrderCutoffWaiverGate },
    // La liste transverse de Réglages › Commandes › Heure limite (lot O1c) :
    // un port de lecture à part, la liste ne fait que lire.
    { provide: OpenOrderCutoffWaiverReader, useClass: PrismaOpenOrderCutoffWaiverReader },
    // La surtaxe vit ici parce qu'elle n'existe QUE par la dérogation : c'est ce
    // qu'une dérogation coûte. Deux ports — l'administration la règle par le
    // repository, le verdict du délai de commande la lit (`LateFeeSettingReader`).
    { provide: OrderLateFeeRepository, useClass: PrismaOrderLateFeeRepository },
    // Ce que le délai de commande lit d'ici pour son verdict : la dérogation
    // ouverte et le prix d'un retard, chacun par sa lecture.
    { provide: OpenWaiverReader, useClass: PrismaOpenWaiverReader },
    { provide: LateFeeSettingReader, useClass: RepositoryLateFeeSettingReader },
    GrantOrderCutoffWaiverHandler,
    RevokeOrderCutoffWaiverHandler,
    ListOrderCutoffWaiversHandler,
    ListOpenOrderCutoffWaiversHandler,
    SaveOrderLateFeeHandler,
    ClearOrderLateFeeHandler,
    ReadOrderLateFeeHandler,
  ],
  exports: [OrderCutoffWaiverGate, OpenWaiverReader, LateFeeSettingReader],
})
export class OrderWaiversModule {}
