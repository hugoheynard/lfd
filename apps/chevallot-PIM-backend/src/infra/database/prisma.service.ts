import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './client/client.js';

/**
 * Prisma 7 exige un **driver adapter** (ou Accelerate) — l'URL seule ne suffit
 * plus. On utilise `@prisma/adapter-pg` (node-postgres, TCP + pool) car l'app
 * tourne en **long-running** (ADR-02) ; `adapter-neon` vise le serverless/edge.
 * Neon parle le protocole Postgres standard, donc pg convient (ADR-09).
 *
 * Absence de `DATABASE_URL` = erreur de configuration : on échoue tôt et
 * clairement plutôt qu'à la première requête.
 */
function databaseUrl(): string {
  const url = process.env['DATABASE_URL'];
  if (url === undefined || url.trim() === '') {
    throw new Error(
      'DATABASE_URL manquant : copier .env.example en .env et renseigner la base (Neon).',
    );
  }
  return url;
}

/**
 * Client Prisma exposé comme provider Nest (couche infrastructure).
 * Ouvre la connexion au boot, la ferme à l'arrêt.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: databaseUrl() }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
