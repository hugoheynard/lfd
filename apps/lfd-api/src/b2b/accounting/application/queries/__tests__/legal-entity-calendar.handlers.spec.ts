import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  LegalEntityReader,
  type LegalEntityRecord,
} from "../../../domain/ports/legal-entity.reader.js";
import { RecordedClosureReader } from "../../../domain/ports/recorded-closure.reader.js";
import { toView } from "../../../infrastructure/legal-entity.mapper.js";
import { declaredEntity } from "../../commands/__tests__/mandate-setting-doubles.js";
import { GetLegalEntityHandler } from "../get-legal-entity.handler.js";
import { ListLegalEntitiesHandler } from "../list-legal-entities.handler.js";
import { GetLegalEntityQuery } from "../legal-entity-queries.js";

/**
 * Le 8 octobre 2026 : le cycle en cours se clôt le 1er novembre à 00h00 de
 * Paris. Les dates ne sont comparées qu'au calendrier calculé — l'horloge est
 * FIXE, jamais le mur.
 */
const NOW = new Date("2026-10-08T09:00:00.000Z");

/** La vue vient du VRAI mapper : un doublé écrit à la main dériverait de la vue servie. */
class OneEntity extends LegalEntityReader {
  constructor(private readonly record: LegalEntityRecord) {
    super();
  }
  list(): Promise<readonly LegalEntityRecord[]> {
    return Promise.resolve([this.record]);
  }
  byId(): Promise<LegalEntityRecord | null> {
    return Promise.resolve(this.record);
  }
}

class NoClosure extends RecordedClosureReader {
  lastClosure(): Promise<Date | null> {
    return Promise.resolve(null);
  }
}

function record(): LegalEntityRecord {
  const entity = declaredEntity();
  entity.setCollectionSchedule({
    delayHours: 2,
    daysAfterClosure: null,
    depositCutoff: { businessDaysBefore: 2, time: "16:00" },
  });
  return toView(entity, true);
}

describe("la fiche d'une entité porte le calendrier de son cycle en cours", () => {
  it("échéance reportée au jour ouvré, constitution prévue, date limite de dépôt", async () => {
    const handler = new GetLegalEntityHandler(
      new OneEntity(record()),
      new NoClosure(),
      new FixedClock(NOW),
    );

    const view = await handler.execute(new GetLegalEntityQuery("le1"));

    expect(view.nextCollection).toEqual({
      closesAt: "2026-10-31T23:00:00.000Z",
      plannedConstitutionAt: "2026-11-01T01:00:00.000Z",
      // 1er novembre + 14 = dimanche 15 → lundi 16 ; deux jours ouvrés avant : jeudi 12.
      collectionDay: "2026-11-16",
      depositDeadline: { day: "2026-11-12", time: "16:00" },
    });
    expect(view.depositCutoff).toEqual({ businessDaysBefore: 2, time: "16:00" });
  });

  it("la liste porte le même calendrier que la fiche", async () => {
    const reader = new OneEntity(record());
    const clock = new FixedClock(NOW);
    const [listed] = await new ListLegalEntitiesHandler(reader, new NoClosure(), clock).execute();
    const one = await new GetLegalEntityHandler(reader, new NoClosure(), clock).execute(
      new GetLegalEntityQuery("le1"),
    );

    expect(listed?.nextCollection).toEqual(one.nextCollection);
  });
});
