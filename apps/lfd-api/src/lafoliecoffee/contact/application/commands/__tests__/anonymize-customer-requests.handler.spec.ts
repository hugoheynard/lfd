import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { customerRequestKeptSince } from "../../../domain/contact-retention.js";
import {
  AT,
  LATER,
  contactRequest,
  orderProblem,
  photo,
} from "../../../domain/__tests__/request-fixtures.js";
import {
  AnonymizeCustomerRequestsHandler,
  CUSTOMER_REQUEST_ANONYMIZE_BATCH_SIZE,
} from "../anonymize-customer-requests.handler.js";
import { MemoryPhotoStore, MemoryRequests, ScriptedRetention } from "./contact-doubles.js";

function setup(batches: (readonly string[])[]): {
  run: () => Promise<number>;
  retention: ScriptedRetention;
  requests: MemoryRequests;
  store: MemoryPhotoStore;
  log: string[];
} {
  const log: string[] = [];
  const problem = orderProblem({ id: "q1" });
  const ref = problem.attachPhoto("p1", photo(), AT);
  const store = new MemoryPhotoStore(log);
  store.objects.set(ref.storageKey, { bytes: photo().bytes, contentType: "image/png" });
  const requests = new MemoryRequests([problem, contactRequest({ id: "q2" })], log);
  const retention = new ScriptedRetention(batches);
  const handler = new AnonymizeCustomerRequestsHandler(
    retention,
    requests,
    store,
    new FixedClock(LATER),
  );
  return { run: () => handler.execute(), retention, requests, store, log };
}

describe("AnonymizeCustomerRequestsHandler — la purge à douze mois", () => {
  it("anonymise chaque demande due par l'agrégat, à la frontière des douze mois", async () => {
    const { run, retention, requests } = setup([["q1", "q2"]]);
    expect(await run()).toBe(2);
    expect(retention.calls).toEqual([
      { before: customerRequestKeptSince(LATER), limit: CUSTOMER_REQUEST_ANONYMIZE_BATCH_SIZE },
    ]);
    expect(requests.saved.map((r) => r.toPersistence().anonymizedAt)).toEqual([LATER, LATER]);
  });

  it("SUPPRIME les photos du stockage, AVANT d'enregistrer la demande", async () => {
    const { run, store, log } = setup([["q1"]]);
    await run();
    expect(store.objects.size).toBe(0);
    expect(log).toEqual(["delete requests/q1/p1", "save q1"]);
  });

  it("enchaîne les lots pleins jusqu'au lot incomplet", async () => {
    const full = Array.from({ length: CUSTOMER_REQUEST_ANONYMIZE_BATCH_SIZE }, () => "q_absent");
    const { run, retention } = setup([full, ["q2"]]);
    expect(await run()).toBe(1);
    expect(retention.calls).toHaveLength(2);
  });

  it("rend zéro quand rien n'est dû", async () => {
    const { run } = setup([]);
    expect(await run()).toBe(0);
  });
});
