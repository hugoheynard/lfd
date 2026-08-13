import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppConfig } from '../config/app-config.js';
import { PrismaClient } from './client/client.js';

/**
 * Client Prisma exposé comme provider Nest (couche infrastructure).
 *
 * Le **schéma de l'URL** choisit le transport, exactement comme côté B2B :
 *
 * - `prisma+postgres://…` → **Accelerate** (pooling + cache côté Prisma) ;
 * - `postgresql://…` / `postgres://…` → **adapter `pg`** (node-postgres, TCP +
 *   pool), pour un Postgres joignable en direct — le mode des tests e2e, qui ont
 *   besoin d'une base jetable et locale.
 *
 * ⚠️ Ce branchement existe parce que son absence a coûté une panne. Ce service
 * montait `adapter-pg` INCONDITIONNELLEMENT : présenter une chaîne Accelerate
 * donnait un déploiement vert, une migration réussie (Prisma migrate accepte les
 * deux formes) et un **500 à la première requête**. Deux backends voisins qui
 * n'acceptaient pas les mêmes chaînes, sans rien qui le dise à celui qui remplit
 * les secrets : constaté en production le 2026-08-13.
 *
 * ⚠️ En mode Accelerate la connexion est **paresseuse** : `$connect()` n'ouvre
 * aucune session physique, il ne prouve donc PAS que la base est joignable.
 * Idem pour le pool `pg`. Seule une configuration manquante est détectée au boot
 * (par `AppConfig`).
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: AppConfig) {
    const url = config.databaseUrl();
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
 * Vrai si l'URL désigne un Postgres joignable en direct, par opposition au proxy
 * Prisma Postgres (`prisma+postgres://`).
 */
function isDirectPostgresUrl(url: string): boolean {
  return url.startsWith('postgresql://') || url.startsWith('postgres://');
}
