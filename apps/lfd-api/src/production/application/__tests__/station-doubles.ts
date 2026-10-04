import {
  PackingStation,
  PackingStationReader,
  type StationDay,
  type StationLineMark,
  type StationOrderRef,
  type StationSeal,
  type StationSealAck,
} from "../../channels/packing/packing-station.js";
import { ProductionDay } from "../../domain/entities/production-day.js";

/**
 * Les doublés du poste de colisage (K2) — chacun ÉTEND son port.
 *
 * `RecordingStation` note chaque geste remis au colisage, dans l'ordre ; la
 * fermeture rend l'accusé qu'on lui a donné. Les règles du bac ne sont pas
 * jouées ici : elles sont éprouvées dans `src/packing/`.
 */
export class RecordingStation extends PackingStation {
  readonly calls: string[] = [];
  sealAck: StationSealAck | null = null;

  markLine(order: StationOrderRef, sku: string, mark: StationLineMark): Promise<void> {
    this.calls.push(`mark:${order.orderId}:${sku}:${mark.by}:${mark.initials}`);
    return Promise.resolve();
  }

  unmarkLine(order: StationOrderRef, sku: string): Promise<void> {
    this.calls.push(`unmark:${order.orderId}:${sku}`);
    return Promise.resolve();
  }

  seal(order: StationOrderRef, mark: StationSeal): Promise<StationSealAck> {
    this.calls.push(`seal:${order.orderId}:${mark.by}`);
    return Promise.resolve(
      this.sealAck ?? { packedAt: mark.at, packedBy: mark.by, alreadyPacked: false },
    );
  }

  stepContainers(order: StationOrderRef, step: "add" | "remove"): Promise<void> {
    this.calls.push(`step:${order.orderId}:${step}`);
    return Promise.resolve();
  }

  declareContainers(order: StationOrderRef, containers: number): Promise<void> {
    this.calls.push(`declare:${order.orderId}:${String(containers)}`);
    return Promise.resolve();
  }
}

/** La lecture du poste : une journée fixée d'avance, vide par défaut. */
export class FixedStationReader extends PackingStationReader {
  constructor(private readonly day: StationDay = { orders: [], stocks: [] }) {
    super();
  }

  dayOf(): Promise<StationDay> {
    return Promise.resolve(this.day);
  }
}

/**
 * La même journée, colisée par l'ANCIEN poste : depuis K2, une clôture écrit
 * toujours `packing`, et une journée `legacy` ne se relit que de la base —
 * celles arrêtées avant le déploiement, que l'ancien chemin sert encore.
 */
export function legacyOf(day: ProductionDay): ProductionDay {
  return ProductionDay.fromSnapshot({ ...day.toSnapshot(), packingOwner: "legacy" });
}
