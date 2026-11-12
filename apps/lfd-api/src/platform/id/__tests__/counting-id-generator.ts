import { FixedIdGenerator } from "../fixed-id-generator.js";

/**
 * `FixedIdGenerator` qui compte ses tirages : un test prouve ainsi qu'un geste
 * refusé (un rejeu, une garde) n'a tiré aucun identifiant avant de refuser.
 */
export class CountingIdGenerator extends FixedIdGenerator {
  drawn = 0;

  override next(): string {
    this.drawn += 1;
    return super.next();
  }
}
