import { DeliveryZoneLock } from "../../domain/ports/delivery-zone-lock.js";
import {
  PromotionsTargetingZoneReader,
  type ZoneTargetingPromotion,
} from "../../domain/ports/promotions-targeting-zone.reader.js";

/** Le verrou en mémoire : il note l'ordre des gestes, pour qu'on voie qu'il passe d'abord. */
export class RecordingZoneLock extends DeliveryZoneLock {
  constructor(readonly calls: string[] = []) {
    super();
  }

  lock(zoneId: string): Promise<void> {
    this.calls.push(`lock:${zoneId}`);
    return Promise.resolve();
  }
}

/** Les promotions qui nomment une zone — par défaut, aucune. */
export class FixedPromotionsTargetingZone extends PromotionsTargetingZoneReader {
  constructor(
    private readonly view: readonly ZoneTargetingPromotion[] = [],
    readonly calls: string[] = [],
  ) {
    super();
  }

  targeting(zoneId: string): Promise<readonly ZoneTargetingPromotion[]> {
    this.calls.push(`targeting:${zoneId}`);
    return Promise.resolve(this.view);
  }
}
