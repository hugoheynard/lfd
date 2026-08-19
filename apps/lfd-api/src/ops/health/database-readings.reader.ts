import { Injectable, Logger } from "@nestjs/common";
import type { NodeReading } from "@lfd/ops-contract";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  SchemaOpsCounter,
  type SchemaOpsRate,
} from "../../platform/database/schema-ops.counter.js";

/** Ce que Postgres rend pour une base : deux entiers, pas une ligne de plus. */
interface DatabaseFacts {
  readonly connections: bigint;
  readonly bytes: bigint;
}

/**
 * **Ce que la base sait dire d'elle-même.**
 *
 * Deux faits seulement, et choisis pour ce qu'ils annoncent :
 *
 * - **les connexions ouvertes**, parce que c'est la ressource qui manque en
 *   premier. Chaque instance a son pool ; le jour où `max_instances` remonte,
 *   c'est ce chiffre qui butera contre `max_connections` avant tout le reste —
 *   et il buterait sans prévenir, par un timeout côté application ;
 * - **la taille**, parce qu'elle ne redescend jamais toute seule et qu'on la
 *   découvre d'ordinaire par une facture.
 *
 * Ce n'est PAS de la télémétrie Prisma : le client n'expose ses compteurs que
 * derrière un drapeau de préversion, et l'activer pour deux chiffres qu'un
 * `SELECT` donne déjà serait payer un risque de génération pour rien.
 */
@Injectable()
export class DatabaseReadingsReader {
  private readonly logger = new Logger(DatabaseReadingsReader.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ops: SchemaOpsCounter,
  ) {}

  async read(): Promise<readonly NodeReading[]> {
    try {
      const [facts] = await this.prisma.$queryRaw<DatabaseFacts[]>`
        SELECT
          (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) AS connections,
          pg_database_size(current_database()) AS bytes
      `;
      if (facts === undefined) {
        return [];
      }
      return [
        ...operationsReading(this.ops.perMinute()),
        {
          label: "Connexions",
          value: Number(facts.connections),
          hint: "Sessions ouvertes sur cette base. C'est la ressource qui manque en premier.",
        },
        {
          label: "Taille",
          value: Math.round(Number(facts.bytes) / 1024 / 1024),
          unit: "Mo",
          hint: "Elle ne redescend pas toute seule.",
        },
      ];
    } catch (error) {
      // Une carte de santé n'a pas le droit de tomber avec ce qu'elle observe.
      // Sans relevé, le nœud reste affiché — muet, et c'est une information.
      this.logger.warn("Relevés de base indisponibles", error);
      // Le comptage d'opérations, lui, vit en mémoire : il survit à une base
      // muette, et c'est justement un jour d'incident qu'on veut savoir ce
      // qu'on est en train de consommer.
      return operationsReading(this.ops.perMinute());
    }
  }
}

/** Jours moyens dans un mois — pour projeter un régime sur une facture. */
const DAYS_PER_MONTH = 30;

/**
 * **Ce que le forfait est en train de consommer.**
 *
 * Un seul relevé, et pas un par schéma : la carte n'affiche que trois lignes par
 * nœud, et les remplir avec la répartition chasserait la taille de la base — le
 * chiffre qu'on découvre d'ordinaire par une facture. Le total porte donc la
 * répartition dans son `hint`, où elle est lisible sans coûter une ligne.
 *
 * La projection mensuelle est là parce que c'est la seule forme comparable au
 * forfait : « 42 opérations par minute » ne se compare à rien, « 1,8 M par
 * mois » se compare au million inclus.
 */
function operationsReading(rates: readonly SchemaOpsRate[]): readonly NodeReading[] {
  if (rates.length === 0) {
    return [];
  }
  const perMinute = rates.reduce((total, rate) => total + rate.perMinute, 0);
  const operations = rates.reduce((total, rate) => total + rate.operations, 0);
  return [
    {
      label: "Opérations",
      value: Math.round(perMinute),
      unit: "/min",
      hint: `${shareOf(rates, operations)}. Au régime observé depuis le démarrage, ≈ ${monthly(perMinute)} par mois. Prisma facture l'appel ORM, pas l'instruction SQL.`,
    },
  ];
}

/** La répartition, en parts entières — « public 78 %, growth 20 % ». */
function shareOf(rates: readonly SchemaOpsRate[], total: number): string {
  return rates
    .map((rate) => `${rate.schema} ${Math.round((rate.operations / total) * 100)} %`)
    .join(", ");
}

/** Le régime projeté sur un mois, en millions quand il y en a. */
function monthly(perMinute: number): string {
  const total = perMinute * 60 * 24 * DAYS_PER_MONTH;
  if (total >= 1_000_000) {
    return `${(total / 1_000_000).toFixed(1)} M d'opérations`;
  }
  return `${Math.round(total / 1_000)} k opérations`;
}
