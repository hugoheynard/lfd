import {
  DirectDebitBlockReader,
  type CreditedCompanyEntry,
} from "../../../domain/ports/direct-debit-block.reader.js";
import { StaffDirectory, type StaffIdentity } from "../../../domain/ports/staff-directory.js";
import { ListDirectDebitBlocksHandler } from "../list-direct-debit-blocks.handler.js";

// Relu tel quel : jamais comparé à l'horloge.
const BLOCKED_AT = new Date("2026-09-25T09:00:00.000Z");

class FixedReader extends DirectDebitBlockReader {
  constructor(private readonly entries: readonly CreditedCompanyEntry[]) {
    super();
  }
  listCredited(): Promise<readonly CreditedCompanyEntry[]> {
    return Promise.resolve(this.entries);
  }
}

/** Annuaire doublé : ne connaît que les fiches qu'on lui donne, et compte les appels. */
class KnownStaff extends StaffDirectory {
  asked: string[] = [];
  constructor(private readonly known: Readonly<Record<string, StaffIdentity>>) {
    super();
  }
  identify(reference: string): Promise<StaffIdentity | null> {
    this.asked.push(reference);
    return Promise.resolve(this.known[reference] ?? null);
  }
}

function entry(companyId: string, block: CreditedCompanyEntry["block"]): CreditedCompanyEntry {
  return {
    companyId,
    reference: `C-${companyId}`,
    raisonSociale: "SAS",
    enseigne: companyId,
    block,
  };
}

describe("ListDirectDebitBlocksHandler", () => {
  it("nomme l'auteur d'un blocage par l'annuaire, et ne le cherche pas pour une ligne libre", async () => {
    const staff = new KnownStaff({ staff_1: { name: "Léa Martin", role: "comptabilité" } });
    const handler = new ListDirectDebitBlocksHandler(
      new FixedReader([
        entry("libre", null),
        entry("bloque", { blockedAt: BLOCKED_AT, blockedByStaffId: "staff_1", reason: "Rejet" }),
      ]),
      staff,
    );

    const views = await handler.execute();

    expect(views).toEqual([
      {
        companyId: "libre",
        reference: "C-libre",
        raisonSociale: "SAS",
        enseigne: "libre",
        block: null,
      },
      {
        companyId: "bloque",
        reference: "C-bloque",
        raisonSociale: "SAS",
        enseigne: "bloque",
        block: {
          blockedAt: BLOCKED_AT.toISOString(),
          blockedBy: { name: "Léa Martin", role: "comptabilité" },
          reason: "Rejet",
        },
      },
    ]);
    expect(staff.asked).toEqual(["staff_1"]);
  });

  it("un auteur inconnu de l'annuaire reste `null` — on n'invente pas de nom", async () => {
    const handler = new ListDirectDebitBlocksHandler(
      new FixedReader([
        entry("bloque", {
          blockedAt: BLOCKED_AT,
          blockedByStaffId: "staff_parti",
          reason: "Rejet",
        }),
      ]),
      new KnownStaff({}),
    );

    const [view] = await handler.execute();

    expect(view?.block?.blockedBy).toBeNull();
  });
});
