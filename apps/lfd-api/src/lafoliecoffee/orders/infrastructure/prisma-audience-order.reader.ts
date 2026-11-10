import { BUSINESS_TIME_ZONE, type AudienceDimension } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  AUDIENCE_COUNTED_PAYMENT_STATUSES,
  AUDIENCE_EXCLUDED_ORDER_STATUSES,
} from "../../audiences/domain/audience-scope.js";
import { loyaltyBounds } from "../../audiences/domain/loyalty-tiers.js";
import { timeSliceBounds } from "../../audiences/domain/order-moments.js";
import { HOME_CALLING_CODE, HOME_ORDER_LOCALE } from "../../audiences/domain/stay-profiles.js";
import {
  AudienceOrderReader,
  type AudienceSkuRevenue,
  type AudienceTally,
} from "../../audiences/domain/ports/audience-order.reader.js";

/** L'instant de passation à Paris — `created_at` est stocké en UTC sans fuseau. */
const LOCAL_AT = Prisma.sql`(("o"."created_at" AT TIME ZONE 'UTC') AT TIME ZONE ${BUSINESS_TIME_ZONE})`;

/**
 * **Un signal étranger sur la commande** (lot A3) : une langue autre que le
 * français, ou le téléphone ACTUEL de la personne (`users.phone`, texte
 * libre) qui commence par `+` ou `00` et un autre indicatif que le nôtre.
 * Un numéro sans indicatif ne dit rien. La langue absente non plus.
 */
const FOREIGN_ORDER = Prisma.sql`(
  COALESCE("o"."locale" <> ${HOME_ORDER_LOCALE}, false)
  OR (
    regexp_replace(COALESCE("u"."phone", ''), '[^0-9+]', '', 'g') ~ '^([+]|00)[1-9]'
    AND regexp_replace(COALESCE("u"."phone", ''), '[^0-9+]', '', 'g') !~ ('^([+]|00)' || ${HOME_CALLING_CODE})
  )
)`;

/** Des bornes entières, typées une à une : un paramètre nu serait lu en texte. */
function intArray(bounds: readonly number[]): Prisma.Sql {
  return Prisma.sql`ARRAY[${Prisma.join(bounds.map((bound) => Prisma.sql`${bound}::int`))}]`;
}

/** La clé brute d'une case et son libellé lu en base, exprimés sur `scoped`. */
interface DimensionSql {
  readonly key: Prisma.Sql;
  readonly label: Prisma.Sql;
}

const NO_LABEL = Prisma.sql`NULL::text`;

/** Sur toutes les commandes du MÊME client dans le périmètre. */
const PER_CLIENT = Prisma.sql`OVER (PARTITION BY "client")`;

/**
 * Les trois signaux de séjour d'un client, encodés `étranger-écart-semaines`
 * (`staySignalsOf`) — la règle qui les nomme est dans le domaine
 * (`stay-profiles.ts`), pas ici. Une clé par client : l'addition des cases
 * reste juste. Les particuliers seulement.
 */
const STAY_SIGNALS_KEY = Prisma.sql`CASE WHEN "clientele" = 'public' THEN
  (CASE WHEN bool_or("foreign_order") ${PER_CLIENT} THEN '1' ELSE '0' END)
  || '-' || (MAX("local_day") ${PER_CLIENT} - MIN("local_day") ${PER_CLIENT})::text
  || '-' || (MAX("week_rank") ${PER_CLIENT})::text
END`;

/**
 * La clé brute de chaque coupe — une entrée par coupe, que le domaine nomme
 * (`audience-dimensions.ts`). `NULL` = la commande n'est pas dans la coupe
 * (un particulier n'a pas d'activité, une livraison pas de point de retrait).
 *
 * Lu le 2026-10-18 : `pickup_address` porte les champs postaux du point et
 * son `siteId` (`pickupSnapshotSchema`, facultatif avant le lot S2) ;
 * `delivery_address_snapshot` les champs postaux livrés (`codePostal`,
 * `ville`…, `billingAddressPayloadSchema`) ; `fulfillment` ne porte que la
 * tranche, le contact et la signature — rien d'un lieu.
 */
const DIMENSIONS: Readonly<Record<AudienceDimension, DimensionSql>> = {
  clientele: { key: Prisma.sql`"clientele"`, label: NO_LABEL },
  activity: {
    key: Prisma.sql`CASE WHEN "clientele" = 'pro' THEN "naf" END`,
    label: NO_LABEL,
  },
  fulfillment: { key: Prisma.sql`"method"`, label: NO_LABEL },
  pickup_site: {
    key: Prisma.sql`CASE WHEN "method" = 'pickup' THEN COALESCE(NULLIF("pickup"->>'siteId', ''), '') END`,
    label: Prisma.sql`NULLIF(btrim("pickup"->>'label'), '')`,
  },
  delivery_zone: {
    key: Prisma.sql`CASE WHEN "method" = 'delivery' THEN COALESCE(NULLIF(btrim("drop"->>'codePostal'), ''), '') END`,
    label: Prisma.sql`NULLIF(btrim("drop"->>'ville'), '')`,
  },
  loyalty: {
    key: Prisma.sql`width_bucket("client_orders"::int, ${intArray(loyaltyBounds())})::text`,
    label: NO_LABEL,
  },
  moment: {
    key: Prisma.sql`EXTRACT(ISODOW FROM "local_at")::int::text || '-' || width_bucket(EXTRACT(HOUR FROM "local_at")::int, ${intArray(timeSliceBounds())})::text`,
    label: NO_LABEL,
  },
  // `""` = la commande ne porte pas de langue (d'avant la colonne, ou staff).
  order_locale: { key: Prisma.sql`COALESCE("locale", '')`, label: NO_LABEL },
  stay_profile: { key: STAY_SIGNALS_KEY, label: NO_LABEL },
};

const ALL: DimensionSql = { key: Prisma.sql`'all'`, label: NO_LABEL };

interface TallyRow {
  readonly rawKey: string;
  readonly rawLabel: string | null;
  readonly clients: number;
  readonly orders: number;
  readonly revenueHtCents: number;
  readonly revenueTtcCents: number;
}

/**
 * **Les commandes, en agrégats par case** — implémente le port que les
 * audiences déclarent (lot A1).
 *
 * Une requête par lecture, un `GROUP BY` côté base : rien ne sort qu'une
 * ligne par case brute. Le client compté est la société pour un pro, la
 * personne sinon (`COALESCE(company_id, placed_by_user_id)`) — il sert au
 * `COUNT(DISTINCT)` et à la fidélité, et ne quitte jamais la requête.
 *
 * Pas de mur société : un total de la boutique entière, lu par le staff.
 * L'activité se lit sur `companies.naf_code`, une jointure DANS le commerce.
 */
@Injectable()
export class PrismaAudienceOrderReader extends AudienceOrderReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async tally(
    dimension: AudienceDimension,
    from: string,
    to: string,
  ): Promise<readonly AudienceTally[]> {
    return this.prisma.$queryRaw<TallyRow[]>(
      tallySql(keyed(scope(from, to, false), DIMENSIONS[dimension])),
    );
  }

  async skuRevenue(
    dimension: AudienceDimension,
    from: string,
    to: string,
  ): Promise<readonly AudienceSkuRevenue[]> {
    return this.prisma.$queryRaw<AudienceSkuRevenue[]>(
      skuSql(keyed(scope(from, to, false), DIMENSIONS[dimension])),
    );
  }

  async subscriptionTally(from: string, to: string): Promise<AudienceTally | null> {
    const rows = await this.prisma.$queryRaw<TallyRow[]>(
      tallySql(keyed(scope(from, to, true), ALL)),
    );
    return rows[0] ?? null;
  }

  async subscriptionSkuRevenue(from: string, to: string): Promise<readonly AudienceSkuRevenue[]> {
    return this.prisma.$queryRaw<AudienceSkuRevenue[]>(skuSql(keyed(scope(from, to, true), ALL)));
  }
}

/**
 * Les commandes de la période (jour de passation à Paris ; la borne brute
 * sur `created_at`, élargie d'un jour de chaque côté, garde l'index), sous
 * le périmètre de `audience-scope.ts`.
 */
function scope(from: string, to: string, subscriptions: boolean): Prisma.Sql {
  const origin = subscriptions
    ? Prisma.sql`"o"."from_subscription_id" IS NOT NULL`
    : Prisma.sql`"o"."from_subscription_id" IS NULL`;
  return Prisma.sql`
    SELECT
      "o"."id",
      COALESCE("o"."company_id", "o"."placed_by_user_id") AS "client",
      GREATEST(0, "o"."subtotal_cents" - "o"."discount_cents" - "o"."voucher_discount_cents") AS "ht",
      "o"."total_cents" AS "ttc",
      ${LOCAL_AT} AS "local_at",
      "o"."fulfillment_method"::text AS "method",
      CASE WHEN "o"."clientele"::text = 'pro'
        OR ("o"."clientele" IS NULL AND "o"."company_id" IS NOT NULL)
        THEN 'pro' ELSE 'public' END AS "clientele",
      COALESCE("c"."naf_code", '') AS "naf",
      "o"."pickup_address" AS "pickup",
      "o"."delivery_address_snapshot" AS "drop",
      COUNT(*) OVER (PARTITION BY COALESCE("o"."company_id", "o"."placed_by_user_id")) AS "client_orders",
      "o"."locale" AS "locale",
      ${FOREIGN_ORDER} AS "foreign_order",
      ${LOCAL_AT}::date AS "local_day",
      dense_rank() OVER (
        PARTITION BY COALESCE("o"."company_id", "o"."placed_by_user_id")
        ORDER BY date_trunc('week', ${LOCAL_AT})
      ) AS "week_rank"
    FROM "orders" "o"
    LEFT JOIN "companies" "c" ON "c"."id" = "o"."company_id"
    LEFT JOIN "users" "u" ON "u"."id" = "o"."placed_by_user_id"
    WHERE "o"."created_at" >= ${from}::date - 1
      AND "o"."created_at" < ${to}::date + 2
      AND ${LOCAL_AT}::date BETWEEN ${from}::date AND ${to}::date
      AND "o"."status"::text NOT IN (${Prisma.join([...AUDIENCE_EXCLUDED_ORDER_STATUSES])})
      AND "o"."payment_status"::text IN (${Prisma.join([...AUDIENCE_COUNTED_PAYMENT_STATUSES])})
      AND ${origin}`;
}

/** Chaque commande du périmètre, avec la clé brute de sa case dans la coupe. */
function keyed(scoped: Prisma.Sql, dimension: DimensionSql): Prisma.Sql {
  return Prisma.sql`
    WITH "scoped" AS (${scoped}),
    "keyed" AS (
      SELECT "id", "client", "ht", "ttc", ${dimension.key} AS "key", ${dimension.label} AS "label"
      FROM "scoped"
    )`;
}

function tallySql(withKeyed: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`${withKeyed}
    SELECT
      "key" AS "rawKey",
      MAX("label") AS "rawLabel",
      COUNT(DISTINCT "client")::int AS "clients",
      COUNT(*)::int AS "orders",
      SUM("ht")::int AS "revenueHtCents",
      SUM("ttc")::int AS "revenueTtcCents"
    FROM "keyed"
    WHERE "key" IS NOT NULL
    GROUP BY "key"
    ORDER BY "key"`;
}

/** Le CA HT des LIGNES (avant remise de commande) — ce qui range les familles. */
function skuSql(withKeyed: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`${withKeyed}
    SELECT "k"."key" AS "rawKey", "l"."sku" AS "sku", SUM("l"."line_total_cents")::int AS "revenueHtCents"
    FROM "keyed" "k"
    JOIN "order_lines" "l" ON "l"."order_id" = "k"."id"
    WHERE "k"."key" IS NOT NULL
    GROUP BY 1, 2
    ORDER BY 1, 2`;
}
