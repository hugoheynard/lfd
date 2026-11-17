import { Injectable } from "@nestjs/common";

import { TrackingLevelsCommissioning } from "../domain/ports/tracking-levels-commissioning.js";
import { TRACKING_LEVELS_SINCE } from "../domain/services/tracking-levels-since.js";

/** La mise en service des niveaux de suivi, telle que le code la pose (`TRACKING_LEVELS_SINCE`). */
@Injectable()
export class ConstantTrackingLevelsCommissioning extends TrackingLevelsCommissioning {
  since(): Date {
    return TRACKING_LEVELS_SINCE;
  }
}
