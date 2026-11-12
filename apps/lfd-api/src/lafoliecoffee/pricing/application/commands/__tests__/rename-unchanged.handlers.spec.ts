import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { InMemoryProductCatalog } from "../../../../catalog/infrastructure/in-memory-product-catalog.js";
import { CompanyMercuriale } from "../../../domain/entities/company-mercuriale.js";
import { PricingRule } from "../../../domain/entities/pricing-rule.js";
import type { PricingAct } from "../../../domain/pricing-act.js";
import { CompanyMercurialeReader } from "../../../domain/ports/company-mercuriale.reader.js";
import { PricedCompanyNamer } from "../../../domain/ports/priced-company-namer.js";
import { PricingRuleRepository } from "../../../domain/ports/pricing-rule.repository.js";
import { RenameCompanyMercurialeCommand } from "../rename-company-mercuriale.command.js";
import { RenameCompanyMercurialeHandler } from "../rename-company-mercuriale.handler.js";
import { RenamePriceRuleCommand } from "../rename-price-rule.command.js";
import { RenamePriceRuleHandler } from "../rename-price-rule.handler.js";
import { LockingMercuriales, TracingUnitOfWork } from "./mercuriale-amendment.doubles.js";

/** Les dates ne sont comparées qu'entre elles : aucune n'est lue contre l'horloge. */
const FROM = new Date("2026-01-01T00:00:00.000Z");
const TO = new Date("2026-12-31T00:00:00.000Z");
const CLOCK = new FixedClock(new Date(0));

/** Une règle de geste en mémoire ; `renamed` garde chaque renommage écrit. */
class OneRule extends PricingRuleRepository {
  readonly renamed: PricingAct[] = [];
  constructor(private readonly rule: PricingRule) {
    super();
  }
  archivedOverlapping(): Promise<readonly string[]> {
    return Promise.resolve([]);
  }
  save(): Promise<void> {
    return Promise.resolve();
  }
  update(): Promise<void> {
    return Promise.resolve();
  }
  rename(_rule: PricingRule, act: PricingAct): Promise<void> {
    this.renamed.push(act);
    return Promise.resolve();
  }
  load(): Promise<PricingRule | null> {
    return Promise.resolve(this.rule);
  }
}

class NoCompanies extends PricedCompanyNamer {
  nameOf(): Promise<string | null> {
    return Promise.resolve(null);
  }
}

const gesture = (): PricingRule =>
  PricingRule.create(
    "rule_1",
    {
      stage: "geste",
      stacksOverMercuriale: false,
      scope: { type: "global", id: null },
      audience: { type: "all", id: null },
      minQuantity: null,
      effect: { nature: "alter", alteration: { direction: "decrease", mode: "percent", bp: 500 } },
      label: "Geste de rentrée",
      validFrom: FROM,
      validTo: TO,
    },
    "staff_marie",
  );

describe("RenamePriceRuleHandler — un renommage rejoué", () => {
  function rename(rules: OneRule, label: string): Promise<void> {
    return new RenamePriceRuleHandler(
      rules,
      CLOCK,
      new InMemoryProductCatalog([]),
      new NoCompanies(),
    ).execute(new RenamePriceRuleCommand("rule_1", label, "staff_marie"));
  }

  /** Régression : redire le même nom écrivait un acte `renamed` de plus au journal des prix. */
  it("n'écrit aucun acte quand le nom est déjà celui-là", async () => {
    const rules = new OneRule(gesture());

    await rename(rules, "Geste de rentrée");

    expect(rules.renamed).toEqual([]);
  });

  it("écrit l'acte d'un vrai renommage", async () => {
    const rules = new OneRule(gesture());

    await rename(rules, "Geste d'automne");

    expect(rules.renamed.map((act) => act.kind)).toEqual(["renamed"]);
  });
});

/** Les mercuriales d'un client, relues : une seule ici. */
class OneMercuriale extends CompanyMercurialeReader {
  constructor(private readonly mercuriale: CompanyMercuriale) {
    super();
  }
  liveFor(): Promise<CompanyMercuriale | null> {
    return Promise.resolve(this.mercuriale);
  }
  liveAsOf(): Promise<CompanyMercuriale | null> {
    return Promise.resolve(this.mercuriale);
  }
  listFor(): Promise<readonly CompanyMercuriale[]> {
    return Promise.resolve([this.mercuriale]);
  }
  liveEverywhere(): Promise<readonly CompanyMercuriale[]> {
    return Promise.resolve([this.mercuriale]);
  }
}

/** Les mercuriales en écriture ; `renames` compte les renommages écrits. */
class CountingMercuriales extends LockingMercuriales {
  renames = 0;
  override rename(): Promise<void> {
    this.renames += 1;
    return Promise.resolve();
  }
}

describe("RenameCompanyMercurialeHandler — un renommage rejoué", () => {
  const posed = (): CompanyMercuriale =>
    CompanyMercuriale.pose(
      "merc_1",
      {
        companyId: "co_folie",
        label: "Mercuriale 2026",
        lines: [{ sku: "VIE-012", tiers: [{ minQuantity: 1, unitPriceMillicents: 173_270 }] }],
        validFrom: FROM,
        validTo: TO,
      },
      "staff_marie",
    );

  /** Régression : redire le même nom écrivait un acte `renamed` de plus au journal des prix. */
  it("n'écrit rien et rend le même nombre d'articles quand le nom est déjà celui-là", async () => {
    const mercuriale = posed();
    const trace: string[] = [];
    const repository = new CountingMercuriales(trace, new TracingUnitOfWork(trace), mercuriale);

    const lines = await new RenameCompanyMercurialeHandler(
      repository,
      new OneMercuriale(mercuriale),
      CLOCK,
    ).execute(
      new RenameCompanyMercurialeCommand(
        "co_folie",
        { id: "merc_1", newLabel: " Mercuriale 2026 " },
        "staff_marie",
      ),
    );

    expect(lines).toBe(1);
    expect(repository.renames).toBe(0);
  });
});
