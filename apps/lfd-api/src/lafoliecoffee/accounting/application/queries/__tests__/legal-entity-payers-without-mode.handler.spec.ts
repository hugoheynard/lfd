import { FixedStaffAuthorDirectory } from "../../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  LastAutopilotRunReader,
  type AutopilotRunRecord,
} from "../../../domain/ports/last-autopilot-run.reader.js";
import {
  LegalEntityReader,
  type LegalEntityRecord,
} from "../../../domain/ports/legal-entity.reader.js";
import { RecordedClosureReader } from "../../../domain/ports/recorded-closure.reader.js";
import { toView } from "../../../infrastructure/legal-entity.mapper.js";
import {
  ModeDatesStore,
  PayerModesStore,
  StoreModeDatesReader,
  StorePayerModesReader,
} from "../../commands/__tests__/billing-mode-doubles.js";
import { declaredEntity } from "../../commands/__tests__/mandate-setting-doubles.js";
import type { CountedPayersReaders } from "../../counted-payers-support.js";
import { activePayer, clientsOf, countingOf, signedMandate } from "./counted-payers-doubles.js";
import { GetLegalEntityHandler } from "../get-legal-entity.handler.js";
import { ListLegalEntitiesHandler } from "../list-legal-entities.handler.js";
import { GetLegalEntityQuery } from "../legal-entity-queries.js";

/** Horloge fixe : les segments ne sont comparés qu'à elle, jamais au mur. */
const NOW = new Date("2026-10-08T09:00:00.000Z");

class OneEntity extends LegalEntityReader {
  private readonly record = toView(declaredEntity(), true);
  list(): Promise<readonly LegalEntityRecord[]> {
    return Promise.resolve([this.record]);
  }
  byId(): Promise<LegalEntityRecord | null> {
    return Promise.resolve(this.record);
  }
}

class NoRun extends LastAutopilotRunReader {
  lastOf(): Promise<AutopilotRunRecord | null> {
    return Promise.resolve(null);
  }
}

class NoClosure extends RecordedClosureReader {
  lastClosure(): Promise<Date | null> {
    return Promise.resolve(null);
  }
}

function chose(
  payers: PayerModesStore,
  payerCompanyId: string,
  effectiveFrom: Date,
  cancelledAt: Date | null = null,
): void {
  payers.rows.push({
    id: `p_${payerCompanyId}_${payers.rows.length}`,
    legalEntityId: "le1",
    payerCompanyId,
    effectiveFrom,
    mode: "weekly",
    createdAt: new Date("2026-10-01T08:00:00.000Z"),
    createdByStaffId: "staff_1",
    cancelledAt,
    cancelledByStaffId: cancelledAt === null ? null : "staff_1",
  });
}

function readers(payers: PayerModesStore) {
  return [
    new OneEntity(),
    new NoClosure(),
    new NoRun(),
    new StoreModeDatesReader(new ModeDatesStore()),
    new StorePayerModesReader(payers),
  ] as const;
}

function handler(payers: PayerModesStore, counting: CountedPayersReaders): GetLegalEntityHandler {
  return new GetLegalEntityHandler(
    ...readers(payers),
    counting.standings,
    counting.mandates,
    counting.lot,
    new FixedStaffAuthorDirectory(),
    new FixedClock(NOW),
  );
}

async function withoutMode(
  payers: PayerModesStore,
  counting: CountedPayersReaders,
): Promise<number> {
  const view = await handler(payers, counting).execute(new GetLegalEntityQuery("le1"));
  return view.payersWithoutModeCount;
}

describe("la fiche de l'entité compte les clients sans mode choisi (I3)", () => {
  it("personne n'a choisi : tous les clients comptés le sont", async () => {
    expect(await withoutMode(new PayerModesStore(), clientsOf("le1", ["a", "b"]))).toBe(2);
  });

  it("un choix en vigueur ou seulement programmé est un choix", async () => {
    const payers = new PayerModesStore();
    chose(payers, "a", new Date("2026-09-30T22:00:00.000Z"));
    chose(payers, "b", new Date("2026-10-31T23:00:00.000Z"));

    expect(await withoutMode(payers, clientsOf("le1", ["a", "b", "c"]))).toBe(1);
  });

  it("un segment annulé ne vaut pas un choix", async () => {
    const payers = new PayerModesStore();
    chose(payers, "a", new Date("2026-10-31T23:00:00.000Z"), new Date("2026-10-02T08:00:00.000Z"));

    expect(await withoutMode(payers, clientsOf("le1", ["a"]))).toBe(1);
  });

  it("ne compte ni un compte inactif, ni un site qui suit un payeur, ni un client d'une autre entité", async () => {
    const site = activePayer("site", {
      follows: [
        {
          companyId: "site",
          payerId: "a",
          payerName: "a",
          validFrom: new Date("2026-01-01T00:00:00.000Z"),
          validTo: null,
        },
      ],
    });
    const counting = countingOf(
      [activePayer("a"), activePayer("off", { active: false }), site, activePayer("elsewhere")],
      [
        signedMandate("le1", "a"),
        signedMandate("le1", "off"),
        signedMandate("le1", "site"),
        signedMandate("le2", "elsewhere"),
      ],
    );

    expect(await withoutMode(new PayerModesStore(), counting)).toBe(1);
  });

  it("un choix chez une AUTRE entité ne compte pas ici", async () => {
    const payers = new PayerModesStore();
    chose(payers, "a", new Date("2026-09-30T22:00:00.000Z"));
    const row = payers.rows[0];
    if (row !== undefined) payers.rows[0] = { ...row, legalEntityId: "le2" };

    expect(await withoutMode(payers, clientsOf("le1", ["a"]))).toBe(1);
  });

  it("la liste porte le même compte que la fiche", async () => {
    const counting = clientsOf("le1", ["a"]);
    const [listed] = await new ListLegalEntitiesHandler(
      ...readers(new PayerModesStore()),
      counting.standings,
      counting.mandates,
      counting.lot,
      new FixedStaffAuthorDirectory(),
      new FixedClock(NOW),
    ).execute();

    expect(listed?.payersWithoutModeCount).toBe(1);
  });
});
