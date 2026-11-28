import {
  StaffAuthorDirectory,
  StaffAuthors,
} from "../../../../../staff/directory/domain/staff-author-directory.js";
import {
  CounterAccountCeilingSettingReader,
  type CounterAccountCeilingRecord,
} from "../../../domain/ports/counter-account-ceiling-setting.reader.js";
import { GetCounterAccountCeilingHandler } from "../get-counter-account-ceiling.handler.js";

// Comparée à rien d'autre qu'elle-même : la vue la recopie.
const AT = new Date("2026-08-07T09:00:00.000Z");

class FixedSetting extends CounterAccountCeilingSettingReader {
  constructor(private readonly record: CounterAccountCeilingRecord) {
    super();
  }
  current(): Promise<CounterAccountCeilingRecord> {
    return Promise.resolve(this.record);
  }
}

class OneAuthor extends StaffAuthorDirectory {
  identify(): Promise<StaffAuthors> {
    return Promise.resolve(
      new StaffAuthors(
        new Map([
          [
            "staff_lea",
            {
              staffUserId: "staff_lea",
              firstName: "Léa",
              lastName: "Martin",
              role: "commerce",
              roleLabel: "Commerce",
              jobTitle: "",
            },
          ],
        ]),
      ),
    );
  }
}

describe("lire le plafond des comptes du comptoir (K5)", () => {
  it("rend le montant, l'instant et l'auteur nommé", async () => {
    const handler = new GetCounterAccountCeilingHandler(
      new FixedSetting({ ceilingCents: 30_000, updatedAt: AT, updatedByStaffId: "staff_lea" }),
      new OneAuthor(),
    );

    expect(await handler.execute()).toEqual({
      ceilingCents: 30_000,
      updatedAt: AT.toISOString(),
      updatedByStaffId: "staff_lea",
      updatedByName: "Léa Martin",
    });
  });

  it("jamais réglé : aucun plafond, aucun auteur", async () => {
    const handler = new GetCounterAccountCeilingHandler(
      new FixedSetting({ ceilingCents: null, updatedAt: null, updatedByStaffId: null }),
      new OneAuthor(),
    );

    expect(await handler.execute()).toEqual({
      ceilingCents: null,
      updatedAt: null,
      updatedByStaffId: null,
      updatedByName: null,
    });
  });
});
