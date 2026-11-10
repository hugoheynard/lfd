import { FanOutShelfPurge } from "../fan-out-shelf-purge.js";
import { RecordingShelfPurge } from "./shelf-window-doubles.js";

/** Une purge regroupée part vers chaque magasin, même si l'un tombe (§ 5). */
describe("FanOutShelfPurge", () => {
  const request = {
    order: { kind: "companies", companyIds: ["co_a"] },
    windowOpenedAt: new Date(0),
  } as const;

  it("passe la même purge à chaque magasin", async () => {
    const journal = new RecordingShelfPurge();
    const pro = new RecordingShelfPurge();

    await new FanOutShelfPurge([journal, pro]).purge(request);

    expect(journal.requests).toEqual([request]);
    expect(pro.requests).toEqual([request]);
  });

  it("un magasin qui échoue n'empêche pas les autres, et rien ne lève", async () => {
    const broken = new RecordingShelfPurge();
    broken.failing = true;
    const pro = new RecordingShelfPurge();

    await expect(new FanOutShelfPurge([broken, pro]).purge(request)).resolves.toBeUndefined();

    expect(pro.requests).toEqual([request]);
  });
});
