import { Injectable } from "@nestjs/common";

import { Clock } from "../../../platform/time/clock.js";
import {
  B2bCatalogFeedPreview,
  type FeedPreview,
} from "../../../pim/channels/b2b-platform/products/feed-preview.js";
import {
  compareToReference,
  type MirrorEntry,
  type ParityReport,
  type ReferenceEntry,
} from "../domain/catalog-parity.js";
import { compareOperations, type OperationChange } from "../domain/operation-parity.js";
import { CatalogAdminReader } from "../domain/ports/catalog-admin.reader.js";
import { ReceivedOperationsReader } from "../domain/ports/received-operations.reader.js";
import { operationFactsOf } from "./operation-facts.js";

/**
 * Confronte le miroir de la plateforme à ce que le référentiel publierait.
 *
 * Les deux lectures sont **réelles** : la projection telle que le fil
 * l'enverrait, et le catalogue tel que la plateforme le tient. Comparer deux
 * requêtes plus simples prouverait que deux tables se ressemblent, pas que la
 * caisse rendrait la même monnaie.
 *
 * ## 🔴 Le miroir, c'est ce qui est REÇU — pas ce qui est vendable
 *
 * Ce service lisait `CatalogReader.listSellable()`, qui retire deux populations :
 * les articles **masqués localement**, et ceux **sans taux applicable**. Or
 * masquer est un geste normal, porté par l'agrégat et exposé au commercial par
 * le droit `b2b_catalog:write`. Chaque article masqué tombait donc en `missing`,
 * c'est-à-dire sous la ligne « rien n'explique cet écart » : la décision qui
 * donne le droit fabriquait le bruit.
 *
 * Le raisonnement juste était **déjà écrit** dans `catalog-parity.ts`, pour le
 * prix : « le prix B2B négocié est une décision légitime de la plateforme, pas
 * une dérive ». `LocalDecision` porte trois décisions ; la doctrine n'avait été
 * appliquée qu'à la première. C'est le même argument, mot pour mot, pour les
 * deux autres.
 *
 * D'où `CatalogAdminReader.list()` : la parité **est** un écran d'administration,
 * elle lit le port d'administration. Un article dont le taux a disparu côté PIM
 * s'y range tout seul et du bon côté — il sort de la projection, donc de la
 * référence, et apparaît en `stale` : « dans le miroir, plus publié ».
 */
@Injectable()
export class CheckCatalogParityService {
  constructor(
    private readonly feed: B2bCatalogFeedPreview,
    private readonly catalog: CatalogAdminReader,
    private readonly clock: Clock,
    private readonly operations: ReceivedOperationsReader,
  ) {}

  async check(): Promise<ParityReport> {
    return (await this.confront()).parity;
  }

  /**
   * La confrontation elle-même — **la projection ET son écart**, en un passage.
   *
   * `check()` n'en garde que l'écart, parce que c'est tout ce que ses quatre
   * consommateurs demandent. L'aperçu avant envoi, lui, a besoin des deux : ce
   * qui partirait, et ce que ça changerait au canal. Les deux lectures sont
   * faites ensemble et non par deux appelants successifs — sans quoi l'écran
   * comparerait une projection à un miroir lus à deux instants différents, et
   * l'empreinte qu'il garderait ne serait pas celle qu'il montre.
   */
  async confront(): Promise<CatalogConfrontation> {
    // L'instant est pris UNE fois, sur le `Clock`. Il venait d'un `new Date()`
    // en couche application — que le CLAUDE.md §3.2 interdit — et le JSDoc
    // justifiait même l'appel unique, ce qui rendait la dette d'autant plus
    // facile à ne jamais voir.
    const now = this.clock.now();
    const [preview, mirror, received] = await Promise.all([
      this.feed.preview(now.toISOString()),
      this.catalog.list(),
      this.operations.list(),
    ]);

    const reference = preview.snapshot.products.flatMap((product) =>
      product.variants.map((variant) => ({
        sku: variant.sku,
        name: variant.name,
        priceMillicents: variant.priceMillicents,
        vatRate: variant.vatRatePercent,
        // `?? false` comme à l'ingestion : un produit d'avant la v11 n'est pas exclusif.
        operationOnly: product.operationOnly ?? false,
      })),
    );

    return {
      preview,
      reference,
      parity: compareToReference(reference, mirror.map(asMirrorEntry)),
      // Les opérations de LA MÊME projection — celles que le fil v11 porterait,
      // archivées déjà écartées par `projectOperations` — contre le miroir.
      operations: compareOperations(
        preview.snapshot.operations.map((operation) => operationFactsOf(operation, now)),
        received.map((entry) => ({ facts: entry.received, withdrawnAt: entry.withdrawnAt })),
      ),
    };
  }
}

/** Ce qu'un passage de confrontation rend : les deux côtés, et leur écart. */
export interface CatalogConfrontation {
  readonly preview: FeedPreview;
  /** La projection aplatie en articles — l'unité que la comparaison manipule. */
  readonly reference: readonly ReferenceEntry[];
  readonly parity: ParityReport;
  /** Ce que l'envoi ferait aux opérations datées du canal. */
  readonly operations: readonly OperationChange[];
}

/** Le miroir, réduit aux champs que la comparaison regarde. */
export function asMirrorEntry(item: {
  readonly sku: string;
  readonly name: string;
  readonly pimPriceMillicents: number;
  readonly vatRatePercent: number | null;
  readonly operationOnly: boolean;
}): MirrorEntry {
  return {
    sku: item.sku,
    name: item.name,
    pimPriceMillicents: item.pimPriceMillicents,
    vatRate: item.vatRatePercent,
    operationOnly: item.operationOnly,
  };
}
