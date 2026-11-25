import { Injectable, Logger } from "@nestjs/common";

import { DayOrdersReader } from "../../../channels/commerce/day-orders.reader.js";
import { ExpectedProductionReader } from "../../../channels/commerce/expected-production.reader.js";
import { ExpectedResuppliesReader } from "../../../channels/commerce/expected-resupplies.reader.js";
import {
  OvenWaitingOrdersReader,
  type OvenWaitingOrders,
} from "../../../channels/packing/oven-waiting-orders.reader.js";
import { ProductionDisplaySettings } from "../../../shared/print/index.js";
import { ProductionDisplaySettingsReader } from "../../../shared/print/index.js";
import { DayLineStepsReader } from "../../domain/ports/line-step.ports.js";
import { DayProblemsReader } from "../../domain/ports/production-problem.ports.js";
import { ProductionContainerReader } from "../../domain/ports/production-container.reader.js";
import { ProductionDayRepository } from "../../../day/index.js";
import { QualityLineStatusReader } from "../../../quality/index.js";
import { worksheetGroupsFrom } from "../../domain/services/production-worksheet-groups.js";
import { GroupingSourceReading } from "../../../workstations/index.js";
import { worksheetOf, type DemandedItem } from "../../domain/services/production-worksheet.js";
import { ServiceDay } from "../../../day/index.js";
import { ServiceRange } from "../../../day/index.js";
import { DayTrackingLevelsReading } from "./day-tracking-levels-reading.service.js";
import type { WorksheetContent } from "./worksheet-content.js";
import { WorksheetDeadlinesReading } from "./worksheet-deadlines-reading.service.js";
import { stepsPendingOf } from "./worksheet-line-steps.js";
import { groupView, lineViewOf } from "./worksheet-line-views.js";
import { WorksheetTrackingLevelsReading } from "./worksheet-tracking-levels.js";

/**
 * **La lecture d'une fiche d'atelier**, partagée par ses deux routes.
 *
 * La fiche datée et la fiche « en cours » rendent la même vue ; seule change la
 * façon de choisir le jour. Un handler n'en appelle pas un autre (§4) : ils se
 * partagent donc ce service, et chacun garde son cas d'usage nommé.
 *
 * ⚠️ **Les premières lectures partent ENSEMBLE** : aucune ne conditionne
 * les autres. Une journée ouverte n'utilise pas les arrivées, une journée
 * arrêtée n'utilise pas la demande — mais laquelle on jette ne se sait qu'après
 * avoir chargé la journée. Les rayons, eux, attendent : ils portent sur les SKU
 * de la fiche, qu'on ne connaît qu'une fois l'arbitrage fait.
 *
 * ## Une fiche sans rayons reste servie
 *
 * Les quantités ne dépendent pas du catalogue. Si le commerce ne répond pas, la
 * panne est **journalisée**, `shelvesKnown` vaut `false`, et tout va dans
 * « Rayon inconnu » : le fournil sort ses pièces quand même, et l'écran le dit.
 * Refuser la fiche pour un rangement ferait d'un confort une panne de production.
 *
 * ## Mode boutique, mode prod
 *
 * Le réglage d'affichage choisit le rangement (plan
 * `documentation/fournil/les-postes-du-fournil.md`, § 3.4). En mode boutique, seuls les
 * rayons sont lus. En mode prod, les articles et les postes le sont
 * ; s'ils ne répondent pas, la fiche est rangée par rayon, la panne
 * journalisée, `workstationsKnown` vaut `false` pour que l'écran le dise, et le
 * contenu n'est pas complet. La fiche sert aussi le mode du réglage (`grouping`).
 *
 * ## Paliers et pastilles (plan `documentation/fournil/la-fiche-d-atelier.md`, §3)
 *
 * Chaque ligne porte ses paliers — ses tranches, rangées par le réglage de
 * l'atelier — et le verdict qualité courant de son SKU, le même que la
 * Supervision, lu par le port que la qualité publie (`QualityLineStatusReader`).
 * Des tranches illisibles laissent la fiche servie, sans paliers. La
 * traduction d'une ligne vers le contrat vit dans `worksheet-line-views.ts`.
 *
 * ## La demande d'une journée ouverte : commandes ET réassorts
 *
 * Avant l'arrêt, la fiche additionne les réassorts « pour demain » envoyés
 * (`ExpectedResuppliesReader`) aux commandes, comme les postes : le compte à
 * rebours les compte aussi, et sans eux l'ajustement des paliers à la ligne
 * (`deadlinesOf`) rognerait ceux des commandes. Après l'arrêt, la quantité
 * vient du compte figé, qui porte déjà les deux : la demande n'y est pas lue.
 *
 * ## Ce qui attend le four (§3, Hugo, 2026-10-28)
 *
 * Le colisage dit, par SKU, combien de commandes du jour attendent le four et
 * la plus proche heure « prête pour » — la règle de la Supervision, par le
 * port que le fournil déclare. Sans nom de client. Une panne du colisage est
 * **journalisée** et met `waitingOrders: null` partout : la fiche reste servie.
 *
 * ## Le niveau de suivi de chaque ligne
 *
 * Le niveau figé de la journée, sinon celui que le premier passage figera
 * (`documentation/fournil/les-niveaux-de-suivi.md`), puis celui
 * du poste de chaque ligne. La lecture ne fige rien : elle n'écrit pas.
 * Des postes illisibles servent les lignes en détaillé, et la fiche n'est pas
 * gardée.
 *
 * ## Le plafond et le rouge ouvert de chaque ligne
 *
 * Les problèmes de la journée, traités compris : le plafond survit au
 * « traité », le panneau rouge ne montre que l'ouvert. La table écrit au
 * journal de la journée par déclencheur : un rouge fait relire la fiche.
 *
 * ## Les étapes de chaque ligne
 *
 * En mode prod, chaque ligne dit quels postes d'étape n'ont pas coché, lus
 * sur la carte courante et sur les étapes de la journée (`stepsPending`) ;
 * la table écrit au journal de la journée par déclencheur. En mode boutique,
 * aucune étape n'est exigée.
 *
 * ## Sans horloge
 *
 * Le contenu ne lit pas l'heure : il se range tel quel dans l'objet des
 * journées (`WorksheetContents`), et ce qui dépend de maintenant
 * (`relativeDay`) est posé à chaque réponse par `servedWorksheet`. Il dit
 * aussi s'il est complet : rayons, paliers ou attente du four en panne
 * donnent une fiche servie, jamais rangée.
 *
 * Il n'écrit rien, pas même un compteur — §4.
 */
@Injectable()
export class ProductionWorksheetReading {
  private readonly logger = new Logger(ProductionWorksheetReading.name);

  constructor(
    private readonly days: ProductionDayRepository,
    private readonly expected: ExpectedProductionReader,
    private readonly expectedResupplies: ExpectedResuppliesReader,
    private readonly orders: DayOrdersReader,
    private readonly containers: ProductionContainerReader,
    private readonly deadlines: WorksheetDeadlinesReading,
    private readonly quality: QualityLineStatusReader,
    private readonly waiting: OvenWaitingOrdersReader,
    private readonly display: ProductionDisplaySettingsReader,
    private readonly grouping: GroupingSourceReading,
    private readonly tracking: DayTrackingLevelsReading,
    private readonly lineLevels: WorksheetTrackingLevelsReading,
    private readonly problems: DayProblemsReader,
    private readonly steps: DayLineStepsReader,
  ) {}

  /** Le contenu de la fiche d'une journée, sans rien qui dépende de l'heure. */
  async contentOf(day: ServiceDay): Promise<WorksheetContent> {
    // La journée part avec les autres lectures ; les pastilles la suivent, car
    // un verdict se périme contre le compte ACTUEL de la journée.
    const loading = this.days.load(day);
    const [
      current,
      expected,
      resupplies,
      producible,
      containers,
      tranches,
      quality,
      waiting,
      display,
      levels,
      problems,
      steps,
    ] = await Promise.all([
      loading,
      this.expected.expectedBetween(ServiceRange.of(day.value, day.value)),
      this.expectedResupplies.expectedBetween(ServiceRange.of(day.value, day.value)),
      this.orders.producibleFor(day),
      this.containers.allBySku(),
      this.deadlines.read(day),
      loading.then((loaded) => this.quality.linesOf(loaded)),
      this.waitingOrNull(day),
      this.display.current(),
      loading.then((loaded) => this.tracking.levelsOf(day, loaded)),
      this.problems.allOf(day),
      this.steps.allOf(day),
    ]);

    // 🔴 Le filtre par `orderId` n'est pas un confort. La clôture publie un
    // événement en processus, ni persisté ni rejoué : un abonné en échec laisse
    // des commandes `placed` DÉJÀ inscrites au plan. Sans lui, la fiche
    // annoncerait un écart qui n'existe pas, et le bandeau promettrait
    // d'absorber des pièces déjà comptées.
    const known = new Set(current.orders.map((order) => order.orderId));
    const worksheet = worksheetOf({
      serviceDay: day.value,
      closedAt: current.closedAt,
      retakenAt: current.retaken?.at ?? null,
      counts: current.counts,
      batches: current.batches,
      demand: mergedDemand([...demandOf(expected, day), ...demandOf(resupplies, day)]),
      arrivals: producible.filter((order) => !known.has(order.orderId)),
      containers,
    });
    const settings = display ?? ProductionDisplaySettings.defaults();
    const grouping = await this.grouping.read(
      worksheet.lines.map((line) => line.sku),
      settings.grouping,
      `Fiche d'atelier du ${day.value}`,
    );
    const tracked = await this.lineLevels.read(
      day,
      levels,
      worksheet.lines.map((line) => line.sku),
      grouping.source,
    );
    const viewOf = lineViewOf({
      tranches,
      quality: new Map(quality.map((status) => [status.sku, status])),
      waiting,
      trackingLevelOf: tracked.outputLevelOf,
      problems: new Map(problems.map((problem) => [problem.sku, problem])),
      stepsPendingOf: stepsPendingOf(grouping.source, steps),
    });
    const sheet = {
      date: day.value,
      generatedAt: worksheet.generatedAt?.toISOString() ?? null,
      retakenAt: worksheet.retakenAt?.toISOString() ?? null,
      lines: worksheet.lines.map(viewOf),
      drift: worksheet.drift,
      groups: worksheetGroupsFrom(worksheet.lines, grouping.source, settings.showSubcategories).map(
        (group) => groupView(group, viewOf),
      ),
      shelvesKnown: grouping.shelvesKnown,
      grouping: settings.grouping,
      workstationsKnown: grouping.workstationsKnown,
    };
    const complete =
      grouping.shelvesKnown && grouping.workstationsKnown && tranches !== null && tracked.known;
    return { sheet, complete: complete && waiting !== null };
  }

  /**
   * Ce qui attend le four, ou `null` si le colisage n'a pas répondu — la panne
   * part au journal avec le jour et sa cause, jamais en silence.
   */
  private async waitingOrNull(
    day: ServiceDay,
  ): Promise<ReadonlyMap<string, OvenWaitingOrders> | null> {
    try {
      return await this.waiting.waitingOn(day.value);
    } catch (error) {
      this.logger.error(
        `Fiche d'atelier du ${day.value} : commandes en attente du four illisibles, servie sans.`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }
}

/** Ce que le commerce annonce pour CE jour — rien du tout s'il ne dit rien. */
function demandOf(
  expected: readonly { readonly day: string; readonly items: readonly DemandedItem[] }[],
  day: ServiceDay,
): readonly DemandedItem[] {
  return expected.find((entry) => entry.day === day.value)?.items ?? [];
}

/** Une ligne par article : les quantités des commandes et des réassorts s'additionnent. */
function mergedDemand(items: readonly DemandedItem[]): readonly DemandedItem[] {
  const bySku = new Map<string, DemandedItem>();
  for (const item of items) {
    const known = bySku.get(item.sku);
    bySku.set(
      item.sku,
      known === undefined ? item : { ...known, quantity: known.quantity + item.quantity },
    );
  }
  return [...bySku.values()];
}
