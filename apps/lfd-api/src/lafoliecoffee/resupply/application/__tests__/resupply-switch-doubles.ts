import type { ResupplySwitch } from "../../domain/resupply-switch.js";
import { ResupplySwitchReader } from "../../domain/resupply-switch.reader.js";
import { ResupplySwitchWriter } from "../../domain/resupply-switch.writer.js";

/** L'interrupteur en mémoire : une ligne au plus, réécrite à chaque `put`. */
export class InMemoryResupplySwitch extends ResupplySwitchWriter {
  posed: ResupplySwitch | null = null;

  put(setting: ResupplySwitch): Promise<void> {
    this.posed = setting;
    return Promise.resolve();
  }
}

/** Le lecteur de l'interrupteur sur le même stockage ; jamais posé vaut éteint. */
export class InMemoryResupplySwitchReader extends ResupplySwitchReader {
  constructor(private readonly store: InMemoryResupplySwitch) {
    super();
  }

  read(): Promise<ResupplySwitch | null> {
    return Promise.resolve(this.store.posed);
  }

  isEnabled(): Promise<boolean> {
    return Promise.resolve(this.store.posed?.enabled ?? false);
  }
}
