import { ProductionDisplaySettings } from "../../domain/entities/production-display-settings.js";
import { ProductionDisplaySettingsReader } from "../../domain/ports/production-display-settings.reader.js";
import { ProductionDisplaySettingsRepository } from "../../domain/ports/production-display-settings.repository.js";
import type { TrancheSettingsAuthor } from "../../domain/ports/production-tranche-settings.repository.js";

/** Le rangement du fournil, en mémoire : `null` tant que personne ne l'a posé. */
export class InMemoryDisplaySettings extends ProductionDisplaySettingsRepository {
  posed: ProductionDisplaySettings | null;
  readonly writes: {
    readonly showSubcategories: boolean;
    readonly at: Date;
    readonly author: TrancheSettingsAuthor;
  }[] = [];

  constructor(posed: ProductionDisplaySettings | null = null) {
    super();
    this.posed = posed;
  }

  /** Les sous-catégories affichées — le cas des suites qui éprouvent les intertitres. */
  static showing(): InMemoryDisplaySettings {
    return new InMemoryDisplaySettings(ProductionDisplaySettings.of({ showSubcategories: true }));
  }

  save(
    settings: ProductionDisplaySettings,
    at: Date,
    author: TrancheSettingsAuthor,
  ): Promise<void> {
    this.posed = settings;
    this.writes.push({ showSubcategories: settings.showSubcategories, at, author });
    return Promise.resolve();
  }

  /** Le port de lecture, sur la même mémoire. */
  reader(): ProductionDisplaySettingsReader {
    const store = (): ProductionDisplaySettings | null => this.posed;
    return new (class extends ProductionDisplaySettingsReader {
      current(): Promise<ProductionDisplaySettings | null> {
        return Promise.resolve(store());
      }
    })();
  }
}
