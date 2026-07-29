import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { AppConfig } from "../config/app-config.js";
import { PrismaClient } from "./client/client.js";

/**
 * Client Prisma exposé comme provider Nest (couche infrastructure).
 *
 * On se connecte à **Prisma Postgres** via **Accelerate** : `DATABASE_B2B_URL`
 * est une URL `prisma+postgres://…` que Prisma 7 accepte nativement en
 * `accelerateUrl` (union discriminée avec `adapter` — l'un OU l'autre). Accelerate
 * fournit le pooling + le cache, donc aucun driver `pg` à câbler.
 *
 * ⚠️ La connexion est **paresseuse** : `$connect()` n'ouvre pas de session
 * physique, il ne prouve donc PAS que la base est joignable. Seule une
 * configuration manquante est détectée au boot (par `AppConfig`).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: AppConfig) {
    super({ accelerateUrl: config.databaseUrl() });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
