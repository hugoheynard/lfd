import { ProductionTrancheSettings } from "../../domain/entities/production-tranche-settings.js";
import { ProductionTrancheSettingsReader } from "../../domain/ports/production-tranche-settings.reader.js";
import {
  ProductionTrancheSettingsRepository,
  type TrancheSettingsAuthor,
} from "../../domain/ports/production-tranche-settings.repository.js";

/** Les tranches de production, en mémoire : `null` tant que personne ne les a posées. */
export class InMemoryTrancheSettings extends ProductionTrancheSettingsRepository {
  posed: ProductionTrancheSettings | null;
  readonly writes: {
    readonly mode: string;
    readonly fixedTranches: readonly string[];
    readonly at: Date;
    readonly author: TrancheSettingsAuthor;
  }[] = [];

  constructor(posed: ProductionTrancheSettings | null = null) {
    super();
    this.posed = posed;
  }

  save(
    settings: ProductionTrancheSettings,
    at: Date,
    author: TrancheSettingsAuthor,
  ): Promise<void> {
    this.posed = settings;
    this.writes.push({ mode: settings.mode, fixedTranches: settings.fixedTranches, at, author });
    return Promise.resolve();
  }

  /** Le port de lecture, sur la même mémoire. */
  reader(): ProductionTrancheSettingsReader {
    const store = (): ProductionTrancheSettings | null => this.posed;
    return new (class extends ProductionTrancheSettingsReader {
      current(): Promise<ProductionTrancheSettings | null> {
        return Promise.resolve(store());
      }
    })();
  }
}
