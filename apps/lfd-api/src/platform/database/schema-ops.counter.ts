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
 * assumé : ce qu'on lit est un **taux**, pas un total de facturation — le
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
   * **Le cumul brut, par schéma** — sans division ni fenêtre.
   *
   * Distinct de {@link perMinute}, qui rend un TAUX et se tait sous une seconde
   * d'observation. Ici on rend ce qui a été compté, tout de suite : c'est ce
   * qu'il faut pour répondre à « combien d'opérations cette requête a-t-elle
   * coûté », qui n'est pas la même question que « à quel rythme tourne ce
   * processus ».
   *
   * Sert le budget d'opérations éprouvé en e2e — un nombre de requêtes qui
   * grandit avec la taille du panier est la définition d'un N+1, et c'est un
   * défaut qui ne se voit jamais sur un jeu de données de test.
   */
  snapshot(): readonly SchemaOpsCount[] {
    return [...this.counts.entries()]
      .map(([schema, operations]) => ({ schema, operations }))
      .sort((left, right) => right.operations - left.operations);
  }

  /** Le total, tous schémas confondus. */
  total(): number {
    return [...this.counts.values()].reduce((sum, count) => sum + count, 0);
  }

  /**
   * Le taux observé, par schéma, en opérations par minute.
   *
   * Un taux et non un cumul : un cumul depuis le démarrage n'est comparable ni
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

/** Ce qui a été compté sous un schéma, sans mise en forme. */
export interface SchemaOpsCount {
  readonly schema: string;
  readonly operations: number;
}

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
  Operation: "pim",
  OperationItem: "pim",
  Category: "pim",
  CategoryContextVat: "pim",
  // Les deux satellites d'une famille : ses textes, et ses rattachements à la
  // bibliothèque de médias. Optionnels tous les deux — pas de ligne quand rien
  // n'est renseigné.
  CategoryEditorial: "pim",
  CategoryMedia: "pim",
  // La matrice de canaux en table (C0-d) : une ligne par (lieu, contexte).
  CategoryChannel: "pim",
  ProductChannelOverride: "pim",
  ProductChannel: "pim",
  ProductContextVat: "pim",
  SalesContext: "pim",
  // D'où l'on vend (p-0) : les boutiques ET la plateforme professionnelle,
  // qui n'était jusqu'ici qu'un `NULL` dans la matrice.
  PointOfSale: "pim",
  PointOfSaleContext: "pim",
  PointOfSaleTable: "pim",
  VatRate: "pim",
  // Les décisions comptables globales de la maison (le rapport prix pro /
  // prix public). Singleton, comme `BookingPolicySettings`.
  AccountingRules: "pim",
  Product: "pim",
  ProductVariant: "pim",
  ProductPackaging: "pim",
  // Hors service depuis le 2026-09-22 : plus aucun code ne l'ouvre, et la table
  // reste en base le temps qu'un déploiement à part la supprime. Elle reste donc
  // ici — cette liste décrit le SCHÉMA, pas ce que le code lit.
  NutritionDeclaration: "pim",
  // Les deux tables qui l'ont remplacée (`plan-separer-allergenes-et-nutrition.md`).
  VariantAllergens: "pim",
  NutritionValues: "pim",
  OrderTimeLimit: "pim",
  ProductEditorial: "pim",
  ProductReadiness: "pim",
  CatalogContent: "pim",
  CatalogRevision: "pim",
  CatalogRevisionItem: "pim",
  CatalogRevisionPublication: "pim",
  // Les deux référentiels de provenance, et la liaison qui les cite. Le
  // troisième motif « une dimension pilotée par la donnée » du référentiel,
  // après les contextes de vente et les taux.
  Appellation: "pim",
  Ingredient: "pim",
  ProductIngredient: "pim",
  // Le référentiel d'allergènes, semé et verrouillé par migration, et la
  // liaison qui le pose sur l'ingrédient.
  AllergenCategory: "pim",
  AllergenEntry: "pim",
  IngredientAllergen: "pim",
  // La MÉDIATHÈQUE a son schéma depuis le 2026-09-23 : la table n'a pas été
  // recopiée, elle a changé de schéma d'un `SET SCHEMA` instantané.
  MediaAsset: "media",
  /** L'historique des dépôts REFUSÉS — des tentatives, pas des images. */
  MediaUploadFailure: "media",
  ProductMedia: "pim",
  B2bChannelBinding: "pim",

  // Le fournil, qui tient sa propre écriture depuis le 2026-09-07. Il ne connaît
  // une commande que par un identifiant opaque et un snapshot : aucune de ces
  // tables n'a de clé étrangère vers `public`, et c'est ce qui rend le compteur
  // par schéma lisible — un pic ici est un pic de production, pas de commerce.
  ProductionDay: "production",
  ProductionDayChange: "production",
  ProductionOrder: "production",
  ProductionOrderLine: "production",
  ProductionCount: "production",
  // Les fournées (2026-09-28, plan `plan-fournees-progressives.md`, D1) : une
  // ligne par sortie de four, lue avec la journée.
  ProductionBatch: "production",
  // Le paramétrage du four — combien de pièces tiennent dans un contenant. Il
  // n'est lu qu'à l'ouverture d'une fiche d'atelier ; s'il pesait un jour dans
  // le compteur, c'est qu'une lecture le redemande par ligne au lieu d'un coup.
  ProductionContainer: "production",
  OrderHandover: "production",
  // La garde passée au livreur (2026-10-01, `plan-a-la-porte.md`, BQ) : écrite
  // par le retrait après un départ, lue par le fournil avant un verdict.
  OrderDeparture: "production",
  // Les pièces d'une remise à la porte (2026-10-01, `plan-a-la-porte.md`, B1) :
  // écrites par le retrait avec l'attestation, relues au rejeu du livreur.
  OrderHandoverProof: "production",
  // Le contrôle qualité du superviseur (2026-09-28, plan `plan-controle-qualite.md`,
  // QC2) : un verdict par ligne, ses photos, et les dépôts qui attendent leur verdict.
  ProductionQualityCheck: "production",
  ProductionQualityPhoto: "production",
  ProductionQualityUpload: "production",
  // La livraison : son code vit dans `src/delivery/`, ses tables dans son
  // propre schéma depuis le 2026-09-30 (`plan-schema-delivery.md`, SD-D1). Un
  // pic sur la flotte est un geste de réglage, rare par nature.
  // Son journal de journée — alimenté par les déclencheurs, balayé la nuit.
  DeliveryDayChange: "delivery",
  DeliveryVehicle: "delivery",
  DeliveryDeparture: "delivery",
  DeliveryDoorstepSettings: "delivery",
  // La composition (lot 3) : quelques écritures par geste, un matin.
  DeliveryRound: "delivery",
  DeliveryRoundStop: "delivery",
  // Le chargement (lot 4) : une écriture par bac scanné, un matin, au dépôt.
  DeliveryBin: "delivery",
  DeliveryBinLoad: "delivery",
  DeliveryStopExecution: "delivery",
  // À la porte (plan « À la porte », lot A) : un signalement par problème, en route.
  DeliveryIncident: "delivery",
  // La décision du commercial (plan « À la porte », B3) : une ligne par arrêt signalé.
  DeliveryStopDecision: "delivery",
  // Le calculateur de tournée (lot 7) : un réglage, et le cache du géocodage.
  DeliveryRoutingSettings: "delivery",
  DeliveryGeocode: "delivery",
  // Les scénarios du simulateur (L9-C7) : réglage, sans journée ni client.
  DeliverySimulationScenario: "delivery",
  // Les bacs et leurs contenances (lot 4 bis, tranche A) : un réglage, une case à la fois.
  DeliveryBinType: "delivery",
  DeliveryBinCapacity: "delivery",
  // La bibliothèque d'achat (lot B1) : des candidats, saisis à la main, rarement.
  DeliveryPurchaseVehicleCandidate: "delivery",
  DeliveryPurchaseBinCandidate: "delivery",
  // Les scénarios d'achat (lot B3) : une sélection nommée, enregistrée à la main.
  DeliveryPurchaseScenario: "delivery",
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
