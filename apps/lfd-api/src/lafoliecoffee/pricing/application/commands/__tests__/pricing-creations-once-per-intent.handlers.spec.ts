import { randomUUID } from "node:crypto";

import type { SavePriceTemplatePayload } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { inMemoryIntents } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { InMemoryProductCatalog } from "../../../../catalog/infrastructure/in-memory-product-catalog.js";
import type { PriceTemplate } from "../../../domain/entities/price-template.js";
import type { PricingRule } from "../../../domain/entities/pricing-rule.js";
import type { VolumeLadderAggregate } from "../../../domain/entities/volume-ladder.js";
import type { PricingAct } from "../../../domain/pricing-act.js";
import { PriceTemplateRepository } from "../../../domain/ports/price-template.repository.js";
import { PricedCompanyNamer } from "../../../domain/ports/priced-company-namer.js";
import { PricedDecisionsReader } from "../../../domain/ports/priced-decisions.reader.js";
import { PricingRuleRepository } from "../../../domain/ports/pricing-rule.repository.js";
import { VolumeLadderRepository } from "../../../domain/ports/volume-ladder.repository.js";
import { InMemorySaleReferences } from "../../../infrastructure/in-memory-sale-references.js";
import { ComposePriceTemplateCommand } from "../compose-price-template.command.js";
import { ComposePriceTemplateHandler } from "../compose-price-template.handler.js";
import { CreatePriceRuleCommand } from "../create-price-rule.command.js";
import { CreatePriceRuleHandler } from "../create-price-rule.handler.js";
import { SetVolumeLadderCommand } from "../set-volume-ladder.command.js";
import { SetVolumeLadderHandler } from "../set-volume-ladder.handler.js";

/*
 * Les créations du tarif — une règle, un barème, un gabarit — ne se rejouent
 * pas : un double clic rend ce qui a été posé, sans poser une seconde décision
 * ni écrire un second acte. Les dates ne sont comparées qu'entre elles.
 */

const FROM = new Date("2026-01-01T00:00:00.000Z");
const TO = new Date("2026-12-31T00:00:00.000Z");
const CLOCK = new FixedClock(new Date(0));
const REFERENCES = new InMemorySaleReferences(["VIE-001"]);

class NothingPriced extends PricedDecisionsReader {
  hasPriced(): Promise<boolean> {
    return Promise.resolve(false);
  }
}

class NoCompanies extends PricedCompanyNamer {
  nameOf(): Promise<string | null> {
    return Promise.resolve(null);
  }
}

class RecordingRules extends PricingRuleRepository {
  readonly saved: PricingAct[] = [];
  archivedOverlapping(): Promise<readonly string[]> {
    return Promise.resolve([]);
  }
  save(_rule: PricingRule, act: PricingAct): Promise<void> {
    this.saved.push(act);
    return Promise.resolve();
  }
  update(): Promise<void> {
    return Promise.resolve();
  }
  rename(): Promise<void> {
    return Promise.resolve();
  }
  load(): Promise<PricingRule | null> {
    return Promise.resolve(null);
  }
}

class RecordingLadders extends VolumeLadderRepository {
  readonly posed: PricingAct[] = [];
  archivedOverlapping(): Promise<readonly string[]> {
    return Promise.resolve([]);
  }
  pose(_ladder: VolumeLadderAggregate, act: PricingAct): Promise<void> {
    this.posed.push(act);
    return Promise.resolve();
  }
  load(): Promise<VolumeLadderAggregate | null> {
    return Promise.resolve(null);
  }
  update(): Promise<void> {
    return Promise.resolve();
  }
}

class RecordingTemplates extends PriceTemplateRepository {
  readonly saved: PriceTemplate[] = [];
  save(template: PriceTemplate): Promise<void> {
    this.saved.push(template);
    return Promise.resolve();
  }
  load(): Promise<PriceTemplate | null> {
    return Promise.resolve(null);
  }
}

describe("CreatePriceRuleHandler — une fois par intention", () => {
  /** Régression : un double clic posait deux règles de prix et deux actes `posed`. */
  it("rejouée sous la même clé, rend la même règle sans en poser une seconde", async () => {
    const rules = new RecordingRules();
    const handler = new CreatePriceRuleHandler(
      rules,
      new FixedIdGenerator("rule"),
      CLOCK,
      new NothingPriced(),
      new InMemoryProductCatalog([]),
      new NoCompanies(),
      REFERENCES,
      new DirectUnitOfWork(),
      inMemoryIntents(),
    );
    const key = randomUUID();
    const command = (): CreatePriceRuleCommand =>
      new CreatePriceRuleCommand(
        {
          stage: "geste",
          stacksOverMercuriale: false,
          scope: { type: "global", id: null },
          audience: { type: "all", id: null },
          minQuantity: null,
          effect: {
            nature: "alter",
            alteration: { direction: "decrease", mode: "percent", bp: 500 },
          },
          label: "Geste de rentrée",
          validFrom: FROM,
          validTo: TO,
        },
        "staff_1",
        key,
      );

    const first = await handler.execute(command());
    const replayed = await handler.execute(command());

    expect(replayed).toBe(first);
    expect(rules.saved.map((act) => act.kind)).toEqual(["posed"]);
  });
});

describe("SetVolumeLadderHandler — une fois par intention", () => {
  /** Régression : un double clic posait deux barèmes de volume. */
  it("rejouée sous la même clé, rend le même barème sans en poser un second", async () => {
    const ladders = new RecordingLadders();
    const handler = new SetVolumeLadderHandler(
      ladders,
      new FixedIdGenerator("ladder"),
      CLOCK,
      new NothingPriced(),
      REFERENCES,
      new DirectUnitOfWork(),
      inMemoryIntents(),
    );
    const key = randomUUID();
    const command = (): SetVolumeLadderCommand =>
      new SetVolumeLadderCommand(
        {
          scope: { type: "product", id: "VIE-001" },
          audience: { type: "all", id: null },
          unit: "percent",
          tiers: [{ minQuantity: 10, value: 500 }],
          label: "Barème des viennoiseries",
          validFrom: FROM,
          validTo: TO,
        },
        "staff_1",
        key,
      );

    const first = await handler.execute(command());
    const replayed = await handler.execute(command());

    expect(replayed).toBe(first);
    expect(ladders.posed).toHaveLength(1);
  });
});

describe("ComposePriceTemplateHandler — une fois par intention", () => {
  const PAYLOAD: SavePriceTemplatePayload = {
    kind: "mercuriale",
    label: "Gabarit hôtels",
    lines: [
      {
        sku: "VIE-001",
        tiers: [{ minQuantity: 1, unitPriceMillicents: 90_000 }],
        plannedVolume: null,
      },
    ],
  };

  function compose(templates: RecordingTemplates): ComposePriceTemplateHandler {
    return new ComposePriceTemplateHandler(
      templates,
      new FixedIdGenerator("tpl"),
      REFERENCES,
      new DirectUnitOfWork(),
      inMemoryIntents(),
    );
  }

  /** Régression : un double clic composait deux gabarits identiques. */
  it("rejouée sous la même clé, rend le même gabarit sans en composer un second", async () => {
    const templates = new RecordingTemplates();
    const handler = compose(templates);
    const key = randomUUID();

    const first = await handler.execute(new ComposePriceTemplateCommand(PAYLOAD, "staff_1", key));
    const replayed = await handler.execute(
      new ComposePriceTemplateCommand(PAYLOAD, "staff_1", key),
    );

    expect(replayed).toBe(first);
    expect(templates.saved).toHaveLength(1);
  });

  it("refuse un article qui ne se vend pas, sans rien écrire", async () => {
    const templates = new RecordingTemplates();

    await expect(
      compose(templates).execute(
        new ComposePriceTemplateCommand(
          {
            ...PAYLOAD,
            lines: [
              {
                sku: "INCONNU",
                tiers: [{ minQuantity: 1, unitPriceMillicents: 90_000 }],
                plannedVolume: null,
              },
            ],
          },
          "staff_1",
          randomUUID(),
        ),
      ),
    ).rejects.toThrow();
    expect(templates.saved).toEqual([]);
  });
});
