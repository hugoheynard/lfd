import { QualityControlSettings } from "../../domain/entities/quality-control-settings.js";
import { QualityControlSettingsReader } from "../../domain/ports/quality-control-settings.reader.js";
import { QualityControlSettingsRepository } from "../../domain/ports/quality-control-settings.repository.js";

/** Les réglages du contrôle qualité, en mémoire : `null` tant que personne ne les a posés. */
export class InMemoryQualityControlSettings extends QualityControlSettingsRepository {
  posed: QualityControlSettings | null;
  readonly writes: {
    readonly lineChecks: boolean;
    readonly orderChecks: boolean;
    readonly at: Date;
    readonly by: string;
  }[] = [];

  constructor(posed: QualityControlSettings | null = null) {
    super();
    this.posed = posed;
  }

  /** Les deux niveaux ouverts — le cas des suites qui éprouvent le verdict lui-même. */
  static allOpen(): InMemoryQualityControlSettings {
    return new InMemoryQualityControlSettings(
      QualityControlSettings.of({ lineChecks: true, orderChecks: true }),
    );
  }

  save(settings: QualityControlSettings, at: Date, by: string): Promise<void> {
    this.posed = settings;
    this.writes.push({
      lineChecks: settings.lineChecks,
      orderChecks: settings.orderChecks,
      at,
      by,
    });
    return Promise.resolve();
  }

  /** Le port de lecture, sur la même mémoire. */
  reader(): QualityControlSettingsReader {
    const store = (): QualityControlSettings | null => this.posed;
    return new (class extends QualityControlSettingsReader {
      current(): Promise<QualityControlSettings | null> {
        return Promise.resolve(store());
      }
    })();
  }
}
