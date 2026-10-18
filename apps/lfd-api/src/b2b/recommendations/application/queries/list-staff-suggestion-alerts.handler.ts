import {
  instantToLocal,
  type StaffSuggestionAlertsView,
  type StaffSuggestionReader,
  type StaffSuggestionRuleAlert,
} from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import type { StaffSuggestionRuleSnapshot } from "../../domain/entities/staff-suggestion-rule.js";
import { NotServedCauseReader } from "../../domain/ports/not-served-cause.reader.js";
import { StaffSuggestionRuleReader } from "../../domain/ports/staff-suggestion-rule.reader.js";
import { SuggestionFamilyReader } from "../../domain/ports/suggestion-family.reader.js";
import {
  alertWindow,
  readersOf,
  ruleAlert,
  watchedRules,
  type AlertWindow,
  type AudienceFacts,
} from "../../domain/services/suggestion-alerts.js";
import { triggerSku } from "../../domain/value-objects/suggestion-trigger.js";
import { RecommendationFilter } from "../services/recommendation-filter.js";
import { ListStaffSuggestionAlertsQuery } from "./list-staff-suggestion-alerts.query.js";

/**
 * **Les alertes des suggestions décidées** (RS10), calculées à la demande.
 *
 * Rien n'est rejugé ici : le service et l'heure limite sont ceux du filtre de
 * la boutique (`RecommendationFilter.judgeOver`, qui déroule
 * `judgeOrderable` jour par jour), la cause d'un refus est lue au
 * paramétrage du catalogue, la famille d'un déclencheur au catalogue servi
 * comme à l'écriture de la règle. Le domaine (`ruleAlert`) ne fait que
 * réunir et graduer.
 */
@QueryHandler(ListStaffSuggestionAlertsQuery)
export class ListStaffSuggestionAlertsHandler implements IQueryHandler<
  ListStaffSuggestionAlertsQuery,
  StaffSuggestionAlertsView
> {
  constructor(
    private readonly rules: StaffSuggestionRuleReader,
    private readonly filter: RecommendationFilter,
    private readonly causes: NotServedCauseReader,
    private readonly families: SuggestionFamilyReader,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<StaffSuggestionAlertsView> {
    const today = instantToLocal(this.clock.now()).day;
    const watched = watchedRules(await this.rules.listLive(), today);
    const alerts = await Promise.all(watched.map((rule) => this.alertOf(rule, today)));
    return {
      today,
      rules: alerts.filter((alert): alert is StaffSuggestionRuleAlert => alert !== null),
    };
  }

  private async alertOf(
    rule: StaffSuggestionRuleSnapshot,
    today: string,
  ): Promise<StaffSuggestionRuleAlert | null> {
    const window = alertWindow(rule, today);
    const [facts, triggerWithdrawn] = await Promise.all([
      Promise.all(readersOf(rule).map((audience) => this.factsFor(rule, audience, window))),
      this.triggerWithdrawn(rule),
    ]);
    return ruleAlert(rule, triggerWithdrawn, facts, window);
  }

  private async factsFor(
    rule: StaffSuggestionRuleSnapshot,
    audience: StaffSuggestionReader,
    window: AlertWindow | null,
  ): Promise<AudienceFacts> {
    const judged = await this.filter.judgeOver({
      candidates: rule.suggestedSkus,
      audience,
      days: window?.days ?? [],
    });
    const notServed = await this.causes.causesOf([...judged.notServed], audience);
    return { audience, notServed, neverOrderable: judged.neverOrderable };
  }

  /**
   * Un article qui déclenche et qu'aucune clientèle de la règle ne reçoit ne
   * peut plus être au panier ni en fiche ; une famille que le catalogue servi
   * ne connaît plus non plus.
   */
  private async triggerWithdrawn(rule: StaffSuggestionRuleSnapshot): Promise<boolean> {
    const { kind, ref } = rule.trigger;
    if (kind === "category_in_cart" && ref !== null) {
      return !(await this.families.knownAmong([ref])).has(ref);
    }
    const sku = triggerSku(rule.trigger);
    if (sku === null) {
      return false;
    }
    const judged = await Promise.all(
      readersOf(rule).map((audience) =>
        this.filter.judgeOver({ candidates: [sku], audience, days: [] }),
      ),
    );
    return judged.every(({ notServed }) => notServed.has(sku));
  }
}
