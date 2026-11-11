import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { PriceTemplate } from "../../../domain/entities/price-template.js";
import { PriceTemplateRepository } from "../../../domain/ports/price-template.repository.js";
import {
  ArchivedPriceTemplateIsSealedError,
  PriceTemplateNotFoundError,
} from "../../../domain/pricing-errors.js";
import { ArchivePriceTemplateCommand } from "../archive-price-template.command.js";
import { ArchivePriceTemplateHandler } from "../archive-price-template.handler.js";

const NOW = new Date(Date.UTC(2030, 0, 1));

class StoredTemplates extends PriceTemplateRepository {
  readonly saved: PriceTemplate[] = [];
  constructor(private readonly stored: PriceTemplate | null) {
    super();
  }
  save(template: PriceTemplate): Promise<void> {
    this.saved.push(template);
    return Promise.resolve();
  }
  load(): Promise<PriceTemplate | null> {
    return Promise.resolve(this.stored);
  }
}

const composed = (): PriceTemplate =>
  PriceTemplate.compose(
    "tpl_1",
    {
      kind: "mercuriale",
      label: "Mercuriale Club Med",
      lines: [
        {
          sku: "VIE-001",
          tiers: [{ minQuantity: 1, unitPriceMillicents: 150_000 }],
          plannedVolume: null,
        },
      ],
    },
    "auth0|staff",
  );

describe("ArchivePriceTemplateHandler", () => {
  it("archive le gabarit à l'instant de l'horloge, grille intacte", async () => {
    const templates = new StoredTemplates(composed());
    await new ArchivePriceTemplateHandler(templates, new FixedClock(NOW)).execute(
      new ArchivePriceTemplateCommand("tpl_1"),
    );
    expect(templates.saved).toHaveLength(1);
    expect(templates.saved[0]?.toPersistence().archivedAt).toEqual(NOW);
    expect(templates.saved[0]?.lines).toEqual(composed().lines);
  });

  it("refuse un gabarit inconnu (404) sans rien écrire", async () => {
    const templates = new StoredTemplates(null);
    await expect(
      new ArchivePriceTemplateHandler(templates, new FixedClock(NOW)).execute(
        new ArchivePriceTemplateCommand("tpl_x"),
      ),
    ).rejects.toThrow(PriceTemplateNotFoundError);
    expect(templates.saved).toHaveLength(0);
  });

  it("refuse d'archiver deux fois (409) sans rien écrire", async () => {
    const templates = new StoredTemplates(composed().archive(NOW));
    await expect(
      new ArchivePriceTemplateHandler(templates, new FixedClock(NOW)).execute(
        new ArchivePriceTemplateCommand("tpl_1"),
      ),
    ).rejects.toThrow(ArchivedPriceTemplateIsSealedError);
    expect(templates.saved).toHaveLength(0);
  });
});
