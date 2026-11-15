import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { PackingHandoffs } from "../services/packing-handoffs.service.js";
import {
  InMemoryHandoffReader,
  InMemoryHandoffs,
  InMemoryReturnRequests,
  RecordingDurable,
} from "../../../day/application/__tests__/handoff-doubles.js";

/** Le service réel, branché sur les doublés. */
export function handoffsOnDoubles(trace: string[] = []): {
  readonly service: PackingHandoffs;
  readonly ledger: InMemoryHandoffs;
  readonly durable: RecordingDurable;
  readonly requests: InMemoryReturnRequests;
} {
  const ledger = new InMemoryHandoffs();
  const durable = new RecordingDurable(trace);
  const requests = new InMemoryReturnRequests();
  return {
    service: new PackingHandoffs(
      ledger,
      new InMemoryHandoffReader(ledger),
      durable,
      requests,
      new FixedIdGenerator("ask"),
    ),
    ledger,
    durable,
    requests,
  };
}
