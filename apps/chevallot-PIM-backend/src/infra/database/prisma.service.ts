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
 * Prisma 7 exige un **driver adapter** (l'URL seule ne suffit plus) : on utilise
 * `@prisma/adapter-pg` (node-postgres, TCP + pool) car l'app tourne en
 * **long-running** (ADR-02) ; `adapter-neon` vise le serverless/edge. Neon parle
 * le protocole Postgres standard, donc pg convient (ADR-09).
 *
 * ⚠️ Le pool `pg` se connecte **paresseusement** : `$connect()` n'ouvre aucune
 * session physique, il ne prouve donc PAS que la base est joignable. Seule une
 * configuration manquante est détectée au boot (par `AppConfig`). Pour un vrai
 * fail-fast sur la connectivité, il faudrait un `SELECT 1` ici — décision
 * ouverte (cela ferait échouer le démarrage sans `pnpm dev:infra`).
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: AppConfig) {
    super({
      adapter: new PrismaPg({ connectionString: config.databaseUrl() }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
