import { Injectable } from "@nestjs/common";
import { monotonicFactory } from "ulid";

import { Clock } from "../time/clock.js";
import { IdGenerator } from "./id-generator.js";

/**
 * Adaptateur de production : génère des **ULID** horodatés par le `Clock`.
 *
 * - La composante temps du ULID vient du `Clock` (donc du `now` de la requête) →
 *   les identifiants sont triables par le temps métier, et **déterministes** en
 *   test sous `FixedClock`.
 * - La `monotonicFactory` garantit un ordre **strictement croissant** même pour
 *   plusieurs ULID générés dans la même milliseconde (elle incrémente la
 *   composante aléatoire) — pas de collision dans une même requête.
 */
@Injectable()
export class UlidGenerator extends IdGenerator {
  private readonly ulid = monotonicFactory();

  constructor(private readonly clock: Clock) {
    super();
  }

  next(): string {
    return this.ulid(this.clock.now().getTime());
  }
}
