import { Injectable } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { AppConfig } from "../config/app-config.js";
import { PrismaClient } from "./client/client.js";

/**
 * Client Prisma exposé comme provider Nest (couche infrastructure).
 *
 * Le **schéma de l'URL** choisit le transport (`AppConfig.databaseTransport`),
 * parce que Prisma 7 expose une union discriminée (`adapter` XOR
 * `accelerateUrl`) et qu'aucune des deux branches ne sait faire le travail de
 * l'autre :
 *
 * - `postgresql://…` → **adapter `pg`**. Le mode des **tests e2e** et du poste,
 *   et celui de la **production** une fois sortie d'Accelerate : le pooler
 *   mutualisé de Prisma Postgres (`pooled.db.prisma.io`), joint en TCP depuis
 *   le container (`documentation/ops/plan-sortie-d-accelerate.md`).
 * - `prisma+postgres://…` → **Accelerate**, que Prisma retire le 1er décembre
 *   2026. Branche gardée pour le retour arrière, jusqu'au resserrement.
 *
 * 🔴 **Le pool `pg` est réglé, pas laissé aux défauts.** Ceux de `pg-pool`
 * sont faits pour un poste : dix connexions et **aucun délai d'acquisition**.
 * Derrière un pooler partagé, le second défaut transforme une saturation en
 * requêtes qui pendent sans fin, et le premier double pendant la minute où
 * l'ancienne et la nouvelle instance coexistent à chaque déploiement.
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
      config.databaseTransport() === "pg"
        ? { adapter: new PrismaPg({ connectionString: url, ...POOL }) }
        : { accelerateUrl: url },
    );
  }
}

/**
 * Le pool d'UNE instance.
 *
 * - `max: 5` — deux instances coexistent une à deux minutes à chaque
 *   déploiement (l'ancienne répond encore, cf. `deploy_lfd_api.yml`) : dix
 *   connexions au pire. L'offre Prisma est **Pro** : 250 connexions
 *   mutualisées (Hugo, 2026-09-19), donc 2 à 4 % d'occupées. Relever ce
 *   plafond ne se justifie que si des requêtes ATTENDENT une connexion —
 *   elles finissent alors en « base indisponible » sous charge.
 * - `connectionTimeoutMillis` — une requête qui n'obtient pas de connexion
 *   ÉCHOUE, en « base indisponible », au lieu de pendre. Le défaut est
 *   l'attente infinie, et un pooler muet bloquerait jusqu'au boot.
 * - `idleTimeoutMillis` — explicite plutôt qu'hérité, pour qu'il se lise ici.
 */
const POOL = {
  max: 5,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
} as const;
