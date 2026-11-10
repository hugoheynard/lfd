import { InvalidCollectionDayError } from "../../domain/errors/collection-errors.js";
import {
  CREDITOR,
  ENTITY_ID,
  SEPTEMBER,
  STAFF_AUTHOR,
} from "../../domain/services/__tests__/collection-fixtures.js";
import { InvoicingCalendar } from "../../domain/services/invoicing-calendar.js";
import { BillingRhythmSetting } from "../../domain/value-objects/billing-rhythm-setting.js";
import { buildBatches, type BuildInput } from "../collection-batch-building.js";
import type { ReadAssembly } from "../collection-constitution-support.js";

/**
 * Un préavis absurde (des millions de jours) pousse l'échéance au-delà de
 * l'an 9999 : le calendrier rend alors `+0…`, qui n'a pas la forme d'un jour.
 * C'est le seul chemin, par l'entrée publique, vers un jour invalide.
 */
const ABSURD_DAYS = 3_000_000;

function input(nextId: () => string): BuildInput {
  const read: ReadAssembly = {
    cycle: SEPTEMBER,
    previousClosure: null,
    calendar: InvoicingCalendar.following(BillingRhythmSetting.initial()),
    floor: SEPTEMBER.startsAt,
    assembly: { debits: new Map([["B2B", []]]), exclusions: [], unmandatedCompanies: [] },
    companyNames: new Map(),
  };
  return {
    read,
    legalEntityId: ENTITY_ID,
    creditor: {
      ...CREDITOR,
      preNotificationDays: ABSURD_DAYS,
      collectionDaysAfterClosure: ABSURD_DAYS + 1,
    },
    at: SEPTEMBER.closesAt,
    author: STAFF_AUTHOR,
    nextId,
  };
}

describe("buildBatches", () => {
  /**
   * Revue du 2026-10-24 : le jour brut était consommé par le rendu du XML
   * AVANT que `CollectionDay.of` le valide — un fichier pouvait être fabriqué
   * sur une échéance que le lot refuserait ensuite.
   */
  it("refuse un jour invalide avant tout rendu", () => {
    const ids: string[] = [];
    const nextId = (): string => {
      ids.push(`batch_${String(ids.length)}`);
      return ids[ids.length - 1] ?? "";
    };
    expect(() => buildBatches(input(nextId))).toThrow(InvalidCollectionDayError);
    expect(ids).toEqual([]);
  });
});
