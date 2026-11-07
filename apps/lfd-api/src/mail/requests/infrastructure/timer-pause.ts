import { Injectable } from "@nestjs/common";

import { Pause } from "../domain/ports/pause.js";

/** L'attente réelle, par la minuterie du runtime. */
@Injectable()
export class TimerPause extends Pause {
  wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
