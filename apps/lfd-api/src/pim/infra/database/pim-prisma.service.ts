import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";

import { AppConfig } from "../../../infra/config/app-config.js";
import { PrismaClient } from "./client/client.js";

/**
 * **Le second client Prisma** : celui du référentiel PIM.
 *
 * Deux clients dans un seul processus, sur **deux bases inchangées**. C'est ce
 * qui rend la fusion des processus (B2) possible sans la moindre migration de
 * données : le PIM garde sa base, le B2B garde la sienne, et la consolidation en
 * schémas est une décision distincte, remise à plus tard (B4).
 *
 * Le branchement de transport est le même que côté B2B, et pour la même raison
 * apprise en production le 2026-08-13 : le **schéma de l'URL** choisit le
 * transport. Une chaîne Accelerate montée sur `adapter-pg` donne un déploiement
 * vert, une migration réussie, et un 500 à la première requête.
 *
 * ⚠️ Ce service n'est **pas encore branché** dans `AppModule` : rien ne le
 * consomme tant que les contextes du PIM n'ont pas déménagé (B2c). L'importer
 * maintenant obligerait chaque environnement à porter `DATABASE_PIM_URL` pour
 * démarrer, sans rien en faire — un boot qui échoue pour du code mort est le
 * pire échange possible.
 */
@Injectable()
export class PimPrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: AppConfig) {
    const url = config.pimDatabaseUrl();
    super(
      isDirectPostgresUrl(url)
        ? { adapter: new PrismaPg({ connectionString: url }) }
        : { accelerateUrl: url },
    );
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

/**
 * Vrai si l'URL désigne un Postgres joignable en direct, par opposition au
 * proxy Prisma Postgres (`prisma+postgres://`).
 */
function isDirectPostgresUrl(url: string): boolean {
  return url.startsWith("postgresql://") || url.startsWith("postgres://");
}
