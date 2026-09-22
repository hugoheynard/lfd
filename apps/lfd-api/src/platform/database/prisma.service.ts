import { Injectable } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { AppConfig } from "../config/app-config.js";
import { PrismaClient } from "./client/client.js";

/**
 * Client Prisma exposé comme provider Nest (couche infrastructure).
 *
 * **Un seul transport : l'adaptateur `pg`.** Le pooler mutualisé de Prisma
 * Postgres (`pooled.db.prisma.io`) joint en TCP depuis le container, et le même
 * chemin pour les e2e et le poste.
 *
 * 🔴 **Il y en avait deux jusqu'au 2026-09-22** : le schéma de l'URL choisissait
 * entre l'adaptateur et `accelerateUrl`. Accelerate a été quitté en production
 * le 2026-09-19 — `/health` l'a prouvé — et la branche a survécu le temps du
 * retour arrière. Elle est retirée (geste 8 du plan de sortie).
 *
 * Ce qui la remplace n'est pas rien : `AppConfig` **refuse au démarrage** une
 * URL qui ne serait pas un Postgres direct. Sans ce refus, une URL
 * `prisma+postgres://` serait passée telle quelle à l'adaptateur `pg`, qui
 * échouerait à la première requête par un message de pilote, loin de sa cause.
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
 */
@Injectable()
export class PrismaService extends PrismaClient {
  constructor(config: AppConfig) {
    super({ adapter: new PrismaPg({ connectionString: config.databaseUrl(), ...POOL }) });
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
