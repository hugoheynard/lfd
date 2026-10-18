import type { StaffSuggestionOrder, StaffSuggestionOrderView } from "@lfd/contracts";

import {
  StaffSuggestionRule,
  type StaffSuggestionRuleInput,
  type StaffSuggestionRuleSnapshot,
  type WriteStamp,
} from "../../../domain/entities/staff-suggestion-rule.js";
import { AudienceSkuReader } from "../../../domain/ports/audience-sku.reader.js";
import { StaffSuggestionRuleReader } from "../../../domain/ports/staff-suggestion-rule.reader.js";
import { StaffSuggestionRuleRepository } from "../../../domain/ports/staff-suggestion-rule.repository.js";
import { SuggestionFamilyReader } from "../../../domain/ports/suggestion-family.reader.js";
import { SuggestionOrderReader } from "../../../domain/ports/suggestion-order.reader.js";
import { SuggestionOrderWriter } from "../../../domain/ports/suggestion-order.writer.js";
import { SuggestionSiteReader } from "../../../domain/ports/suggestion-site.reader.js";
import { NO_SUGGESTION_CONDITIONS } from "../../../domain/value-objects/suggestion-conditions.js";

/**
 * Le dépôt ET le lecteur en mémoire — deux classes sur le même stockage, comme
 * en base. Il garde des INSTANTANÉS et rend des agrégats neufs : un handler
 * qui muterait l'agrégat sans le rendre au port ne passerait pas pour avoir
 * écrit.
 */
export class RuleStore {
  readonly rows = new Map<string, StaffSuggestionRuleSnapshot>();
  adds = 0;
  saves = 0;

  /** L'état écrit — ou une erreur de test si rien ne l'a été. */
  stored(id: string): StaffSuggestionRuleSnapshot {
    const found = this.rows.get(id);
    if (found === undefined) {
      throw new RangeError(`aucune règle « ${id} » écrite`);
    }
    return found;
  }
}

export class InMemoryRules extends StaffSuggestionRuleRepository {
  constructor(readonly store: RuleStore = new RuleStore()) {
    super();
  }

  load(id: string): Promise<StaffSuggestionRule | null> {
    const found = this.store.rows.get(id);
    return Promise.resolve(
      found === undefined ? null : StaffSuggestionRule.reconstitute(recordOf(found)),
    );
  }

  add(rule: StaffSuggestionRule): Promise<void> {
    this.store.adds += 1;
    this.store.rows.set(rule.id, rule.snapshot());
    return Promise.resolve();
  }

  save(rule: StaffSuggestionRule): Promise<void> {
    this.store.saves += 1;
    this.store.rows.set(rule.id, rule.snapshot());
    return Promise.resolve();
  }
}

export class InMemoryRuleReader extends StaffSuggestionRuleReader {
  constructor(private readonly store: RuleStore) {
    super();
  }

  list(): Promise<readonly StaffSuggestionRuleSnapshot[]> {
    return Promise.resolve([...this.store.rows.values()]);
  }

  listLive(): Promise<readonly StaffSuggestionRuleSnapshot[]> {
    return Promise.resolve(
      [...this.store.rows.values()].filter((rule) => rule.archivedAt === null),
    );
  }
}

/** Le catalogue servi réduit aux SKU qu'il sert. */
export class ServedSkus extends AudienceSkuReader {
  constructor(private readonly served: readonly string[]) {
    super();
  }

  servedAmong(skus: readonly string[]): Promise<ReadonlySet<string>> {
    return Promise.resolve(new Set(skus.filter((sku) => this.served.includes(sku))));
  }
}

/** Les familles connues du catalogue servi. */
export class KnownFamilies extends SuggestionFamilyReader {
  constructor(private readonly known: readonly string[]) {
    super();
  }

  knownAmong(familyIds: readonly string[]): Promise<ReadonlySet<string>> {
    return Promise.resolve(new Set(familyIds.filter((id) => this.known.includes(id))));
  }
}

/** Les points de retrait ouverts. */
export class OpenSites extends SuggestionSiteReader {
  constructor(private readonly open: readonly string[] = []) {
    super();
  }

  openAmong(ids: readonly string[]): Promise<ReadonlySet<string>> {
    return Promise.resolve(new Set(ids.filter((id) => this.open.includes(id))));
  }
}

/** Le réglage de l'ordre en mémoire, lecteur et écrivain sur la même case. */
export class OrderSetting {
  view: StaffSuggestionOrderView = { order: "recent", updatedAt: null };
  readonly puts: { readonly order: StaffSuggestionOrder; readonly stamp: WriteStamp }[] = [];
}

export class OrderReader extends SuggestionOrderReader {
  constructor(private readonly setting: OrderSetting) {
    super();
  }

  current(): Promise<StaffSuggestionOrderView> {
    return Promise.resolve(this.setting.view);
  }
}

export class OrderWriter extends SuggestionOrderWriter {
  constructor(private readonly setting: OrderSetting) {
    super();
  }

  put(order: StaffSuggestionOrder, stamp: WriteStamp): Promise<void> {
    this.setting.puts.push({ order, stamp });
    this.setting.view = { order, updatedAt: stamp.at.toISOString() };
    return Promise.resolve();
  }
}

/** La règle telle que la base la rendrait. */
export function recordOf(rule: StaffSuggestionRuleSnapshot) {
  return {
    id: rule.id,
    trigger: rule.trigger,
    suggestedSkus: rule.suggestedSkus,
    placement: rule.placement,
    audience: rule.audience,
    startsOn: rule.period.startsOn,
    endsOn: rule.period.endsOn,
    phrase: rule.phrase,
    priority: rule.priority,
    conditions: rule.conditions,
    active: rule.active,
    created: rule.created,
    lastWrite: rule.lastWrite,
    archivedAt: rule.archivedAt,
  };
}

/** Une règle « croissant au panier → café », relative au jour passé. */
export function croissantInput(
  today: string,
  over: Partial<StaffSuggestionRuleInput> = {},
): StaffSuggestionRuleInput {
  return {
    trigger: { kind: "product_in_cart", ref: "VIE-001" },
    suggestedSkus: ["BOI-001"],
    placement: "cart",
    audience: "both",
    startsOn: today,
    endsOn: today,
    phrase: { fr: "Avec un croissant, le café" },
    priority: 0,
    conditions: NO_SUGGESTION_CONDITIONS,
    ...over,
  };
}
