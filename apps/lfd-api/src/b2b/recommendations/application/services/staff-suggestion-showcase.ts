import {
  instantToLocal,
  type StaffSuggestionPlacement,
  type StaffSuggestionView,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { Clock } from "../../../../platform/time/clock.js";
import type { ShopAudience } from "../../../catalog/domain/ports/catalog.reader.js";
import type { StaffSuggestionRuleSnapshot } from "../../domain/entities/staff-suggestion-rule.js";
import type { FulfillmentTarget } from "../../domain/orderable-today.js";
import { StaffSuggestionRuleReader } from "../../domain/ports/staff-suggestion-rule.reader.js";
import { SuggestedArticleReader } from "../../domain/ports/suggested-article.reader.js";
import { SuggestionOrderReader } from "../../domain/ports/suggestion-order.reader.js";
import { applicableSuggestions, ruleGate } from "../../domain/services/applicable-suggestions.js";
import {
  traceCandidates,
  type SuggestionCandidate,
  type SuggestionTriggering,
} from "../../domain/services/suggestion-candidates.js";
import {
  shopSiteOf,
  type ConditionContext,
  type ShopSite,
} from "../../domain/services/suggestion-conditions-gate.js";
import {
  diagnoseRules,
  type ItemRefusal,
  type RuleDiagnosis,
  type ShowcaseTrace,
} from "../../domain/services/suggestion-diagnosis.js";
import { RecommendationFilter } from "./recommendation-filter.js";

/** Ce qu'un emplacement demande : son lecteur, son panier, son jour, sa place. */
export interface ShowcaseAsk {
  readonly placement: StaffSuggestionPlacement;
  /** `null` = visiteur ou espace perso : lecteur particulier, tarif public. */
  readonly companyId: string | null;
  /** Les SKU au panier : jamais suggérés. */
  readonly inCart: readonly string[];
  readonly target: FulfillmentTarget | null;
  /**
   * Le total que le client lit au panier, en centimes, s'il est connu (RS8,
   * seuil) ; `null` hors du panier ou pas encore chiffré.
   */
  readonly cartTotalCents: number | null;
  /** Combien d'articles décidés l'emplacement montre (Q1). */
  readonly places: number;
  /**
   * Ce que l'emplacement déclenche et ce qu'il exclut. Demandé seulement s'il
   * reste une règle applicable — le panier y lit les familles.
   */
  readonly triggeringOf: (audience: ShopAudience) => Promise<SuggestionTriggering>;
}

/**
 * L'aperçu du staff (RS5) : la même demande, sans société, avec la clientèle
 * et le jour choisis plutôt que déduits.
 */
export interface ShowcasePreviewAsk extends Omit<ShowcaseAsk, "companyId"> {
  readonly audience: ShopAudience;
  /** Le jour métier jugé, `AAAA-MM-JJ`. */
  readonly day: string;
  /** L'heure jugée, `HH:MM` (Paris) — celle des créneaux (RS8). */
  readonly time: string;
  /** Le point de retrait jugé par les conditions (RS8) — l'aperçu peut dire « pas encore choisi ». */
  readonly site: ShopSite;
}

/** Ce que l'aperçu rend : l'affichage exact, et chaque règle diagnostiquée. */
export interface ShowcaseDiagnosis {
  readonly shown: readonly StaffSuggestionView[];
  readonly rules: readonly RuleDiagnosis[];
}

/** La demande que la chaîne déroule, d'où qu'elle vienne. */
interface ShowcaseRun extends Omit<ShowcaseAsk, "companyId"> {
  readonly reader: ShelfReader;
  readonly day: string;
  readonly time: string;
  readonly site: ShopSite;
}

/**
 * **La vitrine des suggestions du staff**, commune au panier et à la fiche
 * (RS2) : les règles applicables à l'emplacement (période au jour métier,
 * audience, interrupteur, conditions de RS8 à l'heure de l'affichage, ordre
 * réglé), puis celles que l'emplacement
 * déclenche, puis le filtre commun (servi, commandable au jour visé, absent
 * du panier), et la place bornée. L'article sort à son prix de vitrine.
 *
 * Un emplacement de plus est une query de plus qui l'appelle avec son
 * déclencheur, pas une branche ici. La vue rendue est `StaffSuggestionView` :
 * la fiche et l'accueil la servent telle quelle, le panier y ajoute le
 * calculé (`BoughtWithShowcase`).
 *
 * Le lecteur se déduit de la société agissante comme partout dans le commerce
 * (`ShopCataloguePricing`) : sans société, particulier.
 */
@Injectable()
export class StaffSuggestionShowcase {
  constructor(
    private readonly rules: StaffSuggestionRuleReader,
    private readonly order: SuggestionOrderReader,
    private readonly filter: RecommendationFilter,
    private readonly articles: SuggestedArticleReader,
    private readonly clock: Clock,
  ) {}

  /** Ce que la boutique affiche : le lecteur se déduit de la société, le jour du `Clock`. */
  async show(ask: ShowcaseAsk): Promise<readonly StaffSuggestionView[]> {
    const audience = ask.companyId === null ? "public" : "pro";
    const reader: ShelfReader = { companyId: ask.companyId, audience };
    const { day, time } = instantToLocal(this.clock.now());
    const site = shopSiteOf(ask.target);
    return (await this.run({ ...ask, reader, day, time, site })).shown;
  }

  /**
   * **L'aperçu** : la même chaîne, pas à pas, pour une clientèle et un jour
   * choisis. Sans société : à un pro, la vitrine pro sans tarif de société.
   */
  async diagnose(ask: ShowcasePreviewAsk): Promise<ShowcaseDiagnosis> {
    const reader: ShelfReader = { companyId: null, audience: ask.audience };
    const { shown, trace } = await this.run({ ...ask, reader });
    return { shown, rules: diagnoseRules(trace) };
  }

  private async run(
    ask: ShowcaseRun,
  ): Promise<{ readonly shown: readonly StaffSuggestionView[]; readonly trace: ShowcaseTrace }> {
    const { audience } = ask.reader;
    const [live, order] = await Promise.all([this.rules.listLive(), this.order.current()]);
    const gate = {
      placement: ask.placement,
      today: ask.day,
      reader: audience,
      context: contextOf(ask),
    };
    const gateOf = (rule: StaffSuggestionRuleSnapshot) => ruleGate(rule, gate);
    const ordered = applicableSuggestions(live, { ...gate, order: order.order });
    const empty: ShowcaseTrace = { live, gateOf, traced: [], refused: new Map(), shown: [] };
    if (ordered.length === 0) {
      return { shown: [], trace: empty };
    }
    const { candidates, rules: traced } = traceCandidates(
      ordered,
      await ask.triggeringOf(audience),
    );
    const judged = await this.filter.judge({
      candidates: candidates.map((candidate) => candidate.sku),
      audience,
      inCart: ask.inCart,
      target: ask.target,
    });
    const refused = new Map<string, ItemRefusal>(judged.refused);
    const placed = await this.placed(candidates, judged.kept, ask.reader, refused);
    const shown = placed.slice(0, ask.places);
    const shownTrace = shown.map(({ sku, reason }) => ({ sku, ruleId: ruleIdOf(reason, ordered) }));
    return { shown, trace: { live, gateOf, traced, refused, shown: shownTrace } };
  }

  /**
   * Le rayon d'abord, la place ensuite : un article que la vitrine ne montre
   * pas (réservé à une opération, p. ex.) cède sa place au suivant — et il est
   * noté non servi.
   */
  private async placed(
    candidates: readonly SuggestionCandidate[],
    keptItems: readonly { readonly sku: string }[],
    reader: ShelfReader,
    refused: Map<string, ItemRefusal>,
  ): Promise<readonly StaffSuggestionView[]> {
    const kept = keptItems.map((item) => item.sku);
    if (kept.length === 0) {
      return [];
    }
    const items = await this.articles.articles(kept, reader.companyId, reader.audience);
    const ruleOf = new Map(candidates.map((candidate) => [candidate.sku, candidate.rule]));
    return kept.flatMap((sku): StaffSuggestionView[] => {
      const item = items.get(sku);
      const rule = ruleOf.get(sku);
      if (item === undefined || rule === undefined) {
        refused.set(sku, "item_not_served");
        return [];
      }
      const reason = {
        source: "staff",
        ruleId: rule.id.toLowerCase(),
        phrase: rule.phrase,
      } as const;
      return [{ sku, item, reason }];
    });
  }
}

/** Qui regarde la vitrine : une société, ou une clientèle sans société. */
interface ShelfReader {
  readonly companyId: string | null;
  readonly audience: ShopAudience;
}

/** Ce que l'affichage sait pour juger les conditions (RS8). */
function contextOf(ask: ShowcaseRun): ConditionContext {
  return {
    day: ask.day,
    time: ask.time,
    site: ask.site,
    cartTotalCents: ask.cartTotalCents,
  };
}

/** L'id réel de la règle d'un article affiché — la raison le porte en minuscules. */
function ruleIdOf(
  reason: StaffSuggestionView["reason"],
  ordered: readonly StaffSuggestionRuleSnapshot[],
): string {
  return ordered.find((rule) => rule.id.toLowerCase() === reason.ruleId)?.id ?? reason.ruleId;
}
