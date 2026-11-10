import { addDays, instantToLocal } from "@lfd/contracts";

import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import {
  OpenOrderCutoffWaiverReader,
  type OpenCutoffWaiverEntry,
} from "../../domain/open-order-cutoff-waiver.reader.js";
import { ListOpenOrderCutoffWaiversHandler } from "../list-open-order-cutoff-waivers.handler.js";

/** Un instant fixe : le handler en tire le jour de PARIS, qu'on recalcule pareil. */
const NOW = new Date("2026-03-01T23:30:00.000Z");
const PARIS_DAY = instantToLocal(NOW).day;

/** Le lecteur en mémoire : il note le premier jour demandé et filtre comme la base. */
class InMemoryOpenWaivers extends OpenOrderCutoffWaiverReader {
  readonly asked: string[] = [];

  constructor(private readonly entries: readonly OpenCutoffWaiverEntry[]) {
    super();
  }

  listFrom(firstDay: string): Promise<readonly OpenCutoffWaiverEntry[]> {
    this.asked.push(firstDay);
    return Promise.resolve(this.entries.filter((entry) => entry.fulfillmentDate >= firstDay));
  }
}

function entry(
  id: string,
  fulfillmentDate: string,
  grantedByStaffId: string,
): OpenCutoffWaiverEntry {
  return {
    id,
    companyId: "cmp_1",
    companyName: "Boulangerie Martin",
    fulfillmentDate,
    reason: "Client bloqué en tournée",
    grantedByStaffId,
    grantedAt: NOW,
    usedByOrderId: null,
  };
}

describe("ListOpenOrderCutoffWaiversHandler", () => {
  it("demande à partir du jour de Paris, pas du jour UTC", async () => {
    // 23:30 UTC le 1er mars est déjà le 2 mars à Paris.
    const reader = new InMemoryOpenWaivers([]);

    await new ListOpenOrderCutoffWaiversHandler(
      reader,
      new FixedStaffAuthorDirectory(),
      new FixedClock(NOW),
    ).execute();

    expect(reader.asked).toEqual([PARIS_DAY]);
    expect(PARIS_DAY).toBe(addDays(NOW.toISOString().slice(0, 10), 1));
  });

  it("nomme les auteurs en une lecture, et rend null pour une fiche inconnue", async () => {
    const authors = new FixedStaffAuthorDirectory(
      authorsKnownAs({ firstName: "Inès", lastName: "Martin" }, "staff_1"),
    );
    const reader = new InMemoryOpenWaivers([
      entry("wvr_1", PARIS_DAY, "staff_1"),
      entry("wvr_2", addDays(PARIS_DAY, 2), "staff_gone"),
    ]);

    const views = await new ListOpenOrderCutoffWaiversHandler(
      reader,
      authors,
      new FixedClock(NOW),
    ).execute();

    expect(authors.asked).toEqual([["staff_1", "staff_gone"]]);
    expect(views.map((view) => [view.id, view.grantedByName])).toEqual([
      ["wvr_1", "Inès Martin"],
      ["wvr_2", null],
    ]);
    expect(views[0]).toMatchObject({
      companyName: "Boulangerie Martin",
      grantedAt: NOW.toISOString(),
      usedByOrderId: null,
    });
  });
});
