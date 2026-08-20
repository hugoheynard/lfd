import { Injectable } from "@nestjs/common";

import { Clock } from "../time/clock.js";

/**
 * **Combien d'opérations, et pour quel schéma.**
 *
 * Prisma Postgres facture à l'**opération**, et une opération est *un appel de
 * client ORM* — pas une instruction SQL. Son tableau de bord compte par base ;
 * il ne sait rien des schémas, qui n'existent pas dans sa comptabilité. Pour
 * savoir lequel mange le forfait, il faut donc compter chez nous.
 *
 * Ce compteur est branché sur `$allOperations` : il s'incrémente **une fois par
 * appel ORM**, exactement l'unité facturée. Compter les instructions SQL aurait
 * été gratuit — `pg_stat_user_tables` porte déjà la colonne `schemaname` — mais
 * une requête avec `include` en touche trois : le chiffre aurait été juste,
 * réponse à une autre question, et il aurait fini par servir à décider.
 *
 * Il vit en mémoire du processus et repart de zéro à chaque redémarrage. C'est
 * assumé : ce qu'on lit est un **régime**, pas un total de facturation — le
 * total, c'est Prisma qui l'a.
 */
@Injectable()
export class SchemaOpsCounter {
  private readonly counts = new Map<string, number>();
  private startedAt: number | null = null;

  constructor(private readonly clock: Clock) {}

  /** Une opération de plus, rangée sous le schéma de son modèle. */
  record(model: string | undefined): void {
    const now = this.clock.now().getTime();
    this.startedAt ??= now;
    const bucket = schemaOf(model);
    this.counts.set(bucket, (this.counts.get(bucket) ?? 0) + 1);
  }

  /**
   * Le régime observé, par schéma, en opérations par minute.
   *
   * Un régime et non un cumul : un cumul depuis le démarrage n'est comparable ni
   * d'un écran à l'autre, ni d'un déploiement au suivant — deux processus d'âges
   * différents rendraient des chiffres incomparables sur la même carte.
   */
  perMinute(): readonly SchemaOpsRate[] {
    const minutes = this.elapsedMinutes();
    if (minutes === null) {
      return [];
    }
    return [...this.counts.entries()]
      .map(([schema, operations]) => ({ schema, operations, perMinute: operations / minutes }))
      .sort((left, right) => right.operations - left.operations);
  }

  /**
   * Minutes écoulées depuis la première opération, ou `null` tant qu'il est trop
   * tôt pour diviser. Sous une seconde, un taux serait du bruit multiplié par
   * soixante — et ce bruit-là s'afficherait comme une mesure.
   */
  private elapsedMinutes(): number | null {
    if (this.startedAt === null) {
      return null;
    }
    const elapsedMs = this.clock.now().getTime() - this.startedAt;
    return elapsedMs < MIN_ELAPSED_MS ? null : elapsedMs / 60_000;
  }
}

/** Sous une seconde d'observation, on ne rend pas de taux. */
const MIN_ELAPSED_MS = 1_000;

export interface SchemaOpsRate {
  /** Le schéma Postgres, ou `RAW_BUCKET` pour ce qui ne passe par aucun modèle. */
  readonly schema: string;
  readonly operations: number;
  readonly perMinute: number;
}

/**
 * Ce qui n'a pas de modèle : `$queryRaw`, `$executeRaw`, `$transaction`. Ces
 * appels sont facturés comme les autres, et les taire ferait mentir le total —
 * or c'est le total qui approche la facture.
 */
export const RAW_BUCKET = "SQL brut";

/** Le schéma par défaut : celui de la très grande majorité des modèles. */
const DEFAULT_SCHEMA = "public";

/**
 * **Les modèles qui ne vivent pas dans `public`.**
 *
 * Écrits ici plutôt que déduits : Prisma 7 n'expose plus de DMMF utilisable au
 * runtime, et déduire du nom serait deviner. La dérive est rattrapée par un
 * test qui relit `schema.prisma` et compare — un modèle ajouté dans `growth`
 * sans passer ici fait rougir la suite au lieu d'être compté sous `public`,
 * silencieusement et à tort.
 */
const NON_PUBLIC_SCHEMA_OF_MODEL: Readonly<Record<string, string>> = {
  ActivityEvent: "growth",
  LeadScore: "growth",
  Lead: "growth",
  MarketNafCode: "growth",
  MarketZone: "growth",
  CompanyTermination: "growth",
  AvailabilityRule: "growth",
  AvailabilityException: "growth",
  Appointment: "growth",
  BookingPolicySettings: "growth",
  NodeStatusLog: "ops",
  MailSend: "ops",
  WebhookEvent: "ops",
  // Le référentiel, depuis B4. Il avait sa propre BASE : ses opérations
  // n'apparaissaient donc nulle part dans ce compteur, et le forfait qu'elles
  // consommaient se lisait sur une autre facture. Elles comptent ici désormais,
  // sous leur schéma.
  SkuRegistry: "pim",
  Category: "pim",
  TvaRegime: "pim",
  Emplacement: "pim",
  EmplacementTable: "pim",
  Product: "pim",
  ProductVariant: "pim",
  ShopifySettings: "pim",
  ShopifyProductBinding: "pim",
  ShopifyPushSnapshot: "pim",
  ShopifyVariantBinding: "pim",
  NutritionDeclaration: "pim",
  ProductEditorial: "pim",
  MediaAsset: "pim",
  ProductMedia: "pim",
  B2bChannelBinding: "pim",
};

/** Le schéma d'un modèle, ou le seau du SQL brut quand il n'y a pas de modèle. */
export function schemaOf(model: string | undefined): string {
  if (model === undefined) {
    return RAW_BUCKET;
  }
  return NON_PUBLIC_SCHEMA_OF_MODEL[model] ?? DEFAULT_SCHEMA;
}

/** Les modèles déclarés hors `public` — lu par le test de parité, et par lui seul. */
export const DECLARED_NON_PUBLIC_MODELS: Readonly<Record<string, string>> =
  NON_PUBLIC_SCHEMA_OF_MODEL;
