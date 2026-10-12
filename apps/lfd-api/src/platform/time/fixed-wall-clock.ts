import { WallClock } from "./wall-clock.js";

/**
 * {@link WallClock} **déterministe**, qu'on avance à la main — pour éprouver
 * un bail qui expire pendant un appel simulé.
 */
export class FixedWallClock extends WallClock {
  private current: Date;

  constructor(initial: Date) {
    super();
    this.current = initial;
  }

  elapsedNow(): Date {
    return this.current;
  }

  set(instant: Date): void {
    this.current = instant;
  }

  advanceMs(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
