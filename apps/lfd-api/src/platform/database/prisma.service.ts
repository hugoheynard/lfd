import { Injectable } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { AppConfig } from "../config/app-config.js";
import { PrismaClient } from "./client/client.js";

/**
 * Client Prisma exposé comme provider Nest (couche infrastructure).
 *
 * Le **schéma de l'URL** choisit le transport, parce que Prisma 7 expose une
 * union discriminée (`adapter` XOR `accelerateUrl`) et qu'aucune des deux
 * branches ne sait faire le travail de l'autre :
 *
 * - `prisma+postgres://…` → **Accelerate** (la prod et le dev applicatif).
 *   Accelerate apporte le pooling et le cache, donc aucun driver à câbler.
 * - `postgresql://…` → **adapter `pg`** vers un Postgres joignable en direct.
 *   C'est le mode des **tests e2e**, qui ont besoin d'une base jetable, locale
 *   et remise à zéro entre les suites (cf. `test/e2e-harness.ts`) — Accelerate
 *   ne sait pas viser un conteneur local, et son cache masquerait les écritures
 *   que les tests viennent justement vérifier.
 *
 * Une seule et même classe pour les deux : les tests exercent le vrai provider,
 * les vraies contraintes SQL et les vraies migrations, et non un double.
 *
 * ⚠️ Le cycle de vie n'est PAS ici : c'est `PrismaConnection` qui ouvre et ferme
 * la connexion, parce que l'objet réellement injecté sous ce jeton est le client
 * **compté** (cf. `database.module.ts`), et qu'il ne doit y avoir qu'un seul
 * endroit qui appelle `$connect`. Porter les crochets sur cette classe les
 * ferait jouer deux fois sur le même client, une fois par jeton.
 *
 * ⚠️ En mode Accelerate la connexion est **paresseuse** : `$connect()` n'ouvre
 * pas de session physique, il ne prouve donc PAS que la base est joignable.
 * Seule une configuration manquante est détectée au boot (par `AppConfig`).
 */
@Injectable()
export class PrismaService extends PrismaClient {
  constructor(config: AppConfig) {
    const url = config.databaseUrl();
    super(
      isDirectPostgresUrl(url)
        ? { adapter: new PrismaPg({ connectionString: url }) }
        : { accelerateUrl: url },
    );
  }
}

/**
 * Vrai si l'URL désigne un Postgres joignable en direct, par opposition au
 * proxy Prisma Postgres (`prisma+postgres://`).
 */
function isDirectPostgresUrl(url: string): boolean {
  return url.startsWith("postgresql://") || url.startsWith("postgres://");
}
