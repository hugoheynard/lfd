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
import { assertSchemaIsFresh } from "./schema-freshness.js";
import { SchemaOpsCounter } from "./schema-ops.counter.js";
import { transactionalPrisma } from "./transactional-prisma.js";
import { UnitOfWork } from "./unit-of-work.js";

/**
 * Le client **nu**, avant comptage. Il n'existe que pour être enveloppé :
 * personne ne l'injecte, et son jeton est un symbole pour que ce soit vrai par
 * construction plutôt que par convention.
 */
const RAW_PRISMA = Symbol("RAW_PRISMA");

/**
 * Le cycle de vie de la connexion — et, dans la foulée, le **contrôle de
 * fraîcheur du schéma** (cf. `schema-freshness.ts`) : c'est le premier moment
 * où une requête est possible, et le dernier où l'on peut encore refuser de
 * démarrer plutôt que de servir une base à trous.
 *
 * Il est **au seul endroit qui compte** : celui du
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
    await assertSchemaIsFresh({ read: () => this.appliedMigrations() }, process.cwd());
  }

  /**
   * Le journal de Prisma, lu en SQL brut : le client généré ne modélise pas
   * `_prisma_migrations`, et c'est tant mieux — personne ne doit pouvoir
   * l'écrire depuis le code applicatif.
   *
   * Une base jamais migrée n'a pas encore la table ; on rend alors « rien
   * d'appliqué », ce qui est exactement vrai, plutôt que de laisser remonter
   * une erreur SQL que personne ne saurait relier au vrai problème.
   */
  private async appliedMigrations(): Promise<readonly string[]> {
    const [journal] = await this.prisma.$queryRaw<readonly { present: boolean }[]>`
      SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present
    `;
    if (journal?.present !== true) {
      return [];
    }
    const rows = await this.prisma.$queryRaw<readonly { migration_name: string }[]>`
      SELECT migration_name FROM public._prisma_migrations WHERE finished_at IS NOT NULL
    `;
    return rows.map((row) => row.migration_name);
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
      // Compté, PUIS routé vers la transaction ambiante. L'ordre compte : le
      // routage doit envelopper le comptage, sinon une écriture faite dans une
      // transaction échapperait au compteur.
      provide: PrismaService,
      inject: [RAW_PRISMA, SchemaOpsCounter],
      useFactory: (raw: PrismaService, counter: SchemaOpsCounter): CountedPrismaClient =>
        transactionalPrisma(countedPrisma(raw, counter)),
    },
    UnitOfWork,
  ],
  exports: [PrismaService, SchemaOpsCounter, UnitOfWork],
})
export class DatabaseModule {}
