import {
  Global,
  Inject,
  Injectable,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";

import { AppConfig } from "../config/app-config.js";
import { countedPrisma, type CountedPrismaClient } from "./counted-prisma.js";
import { PrismaService } from "./prisma.service.js";
import { SchemaOpsCounter } from "./schema-ops.counter.js";

/**
 * Le client **nu**, avant comptage. Il n'existe que pour être enveloppé :
 * personne ne l'injecte, et son jeton est un symbole pour que ce soit vrai par
 * construction plutôt que par convention.
 */
const RAW_PRISMA = Symbol("RAW_PRISMA");

/**
 * Le cycle de vie de la connexion, **au seul endroit qui compte** : celui du
 * client réellement injecté. Le porter sur `PrismaService` le ferait jouer deux
 * fois — une fois pour le client nu, une fois pour le compté — sur la même
 * connexion sous-jacente, et un `$disconnect` en double pendant l'arrêt est une
 * course qu'on ne veut pas avoir à déboguer un jour de mise en production.
 */
@Injectable()
class PrismaConnection implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(PrismaService) private readonly prisma: CountedPrismaClient) {}

  async onModuleInit(): Promise<void> {
    await this.prisma.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

/**
 * Couche infrastructure : accès base de données.
 * Global pour que `PrismaService` soit injectable partout sans réimport.
 *
 * Le jeton `PrismaService` rend le client **compté** (cf. `counted-prisma.ts`).
 * C'est la seule façon que le comptage soit exhaustif : `$extends` produit un
 * nouveau client, donc exposer le client nu sous son propre jeton garantirait
 * qu'une part des appels échappe au compteur — et un compteur partiel est pire
 * qu'aucun, parce qu'on le croit.
 *
 * L'objet rendu est un proxy Prisma : il relaie les délégués de modèle vers le
 * client sous-jacent. Ce sont les suites e2e — qui exercent le vrai service
 * contre un vrai Postgres — qui le vérifient, pas une assertion sur un double.
 */
@Global()
@Module({
  providers: [
    SchemaOpsCounter,
    PrismaConnection,
    {
      provide: RAW_PRISMA,
      inject: [AppConfig],
      useFactory: (config: AppConfig): PrismaService => new PrismaService(config),
    },
    {
      provide: PrismaService,
      inject: [RAW_PRISMA, SchemaOpsCounter],
      useFactory: countedPrisma,
    },
  ],
  exports: [PrismaService, SchemaOpsCounter],
})
export class DatabaseModule {}
