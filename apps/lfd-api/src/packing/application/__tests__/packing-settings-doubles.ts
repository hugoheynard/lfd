import { PackingSettings } from "../../domain/entities/packing-settings.js";
import { PackingSettingsReader } from "../../domain/ports/packing-settings.reader.js";
import { PackingSettingsRepository } from "../../domain/ports/packing-settings.repository.js";

/** Les réglages du colisage, en mémoire : `null` tant que personne ne les a posés. */
export class InMemoryPackingSettings extends PackingSettingsRepository {
  posed: PackingSettings | null;
  readonly writes: { readonly halfSharing: boolean; readonly at: Date; readonly by: string }[] = [];

  constructor(posed: PackingSettings | null = null) {
    super();
    this.posed = posed;
  }

  /** Le partage d'une moitié ouvert — le cas des suites qui éprouvent le geste lui-même. */
  static sharingOpen(): InMemoryPackingSettings {
    return new InMemoryPackingSettings(PackingSettings.of({ halfSharing: true }));
  }

  save(settings: PackingSettings, at: Date, by: string): Promise<void> {
    this.posed = settings;
    this.writes.push({ halfSharing: settings.halfSharing, at, by });
    return Promise.resolve();
  }

  /** Le port de lecture, sur la même mémoire. */
  reader(): PackingSettingsReader {
    const store = (): PackingSettings | null => this.posed;
    return new (class extends PackingSettingsReader {
      current(): Promise<PackingSettings | null> {
        return Promise.resolve(store());
      }
    })();
  }
}
