import type { ServiceRange } from "../../../day/index.js";
import {
  type ExpectedDayResupplies,
  ExpectedResuppliesReader,
} from "../expected-resupplies.reader.js";

/** Les réassorts « pour demain » envoyés, posés par le test ; aucun par défaut. */
export class ExpectedResupplies extends ExpectedResuppliesReader {
  constructor(private readonly days: readonly ExpectedDayResupplies[] = []) {
    super();
  }

  expectedBetween(_range: ServiceRange): Promise<readonly ExpectedDayResupplies[]> {
    return Promise.resolve(this.days);
  }
}
