import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  AccountingSettingsWriter,
  type AccountingSettingsWrite,
} from "../../../domain/ports/accounting-settings.store.js";
import { SetAccountingSettingsCommand } from "../set-accounting-settings.command.js";
import { SetAccountingSettingsHandler } from "../set-accounting-settings.handler.js";
import { FixedSettings } from "./payment-link-doubles.js";

const NOW = new Date("2026-01-10T09:00:00.000Z");

class RecordingWriter extends AccountingSettingsWriter {
  readonly written: AccountingSettingsWrite[] = [];

  write(settings: AccountingSettingsWrite): Promise<void> {
    this.written.push(settings);
    return Promise.resolve();
  }
}

function run(current: number | null, next: number | null) {
  const writer = new RecordingWriter();
  const events = new RecordingPublisher();
  const handler = new SetAccountingSettingsHandler(
    new FixedSettings(current),
    writer,
    new FixedClock(NOW),
    events,
    new DirectUnitOfWork(),
  );
  return {
    writer,
    events,
    done: handler.execute(new SetAccountingSettingsCommand(next, "staff_1")),
  };
}

describe("SetAccountingSettingsHandler — le plafond des liens libres", () => {
  it("écrit le plafond, daté et signé, et trace l'avant et l'après", async () => {
    const { writer, events, done } = run(null, 50_000);
    await done;
    expect(writer.written).toEqual([
      { paymentLinkMaxCents: 50_000, updatedAt: NOW, updatedByStaffId: "staff_1" },
    ]);
    expect(events.traced[0]?.journalFact()).toMatchObject({
      type: "accounting_settings.payment_link_cap_set",
      payload: { from: null, to: 50_000 },
    });
  });

  it("écrit « aucun plafond » comme null, pas comme zéro", async () => {
    const { writer, done } = run(50_000, null);
    await done;
    expect(writer.written[0]?.paymentLinkMaxCents).toBeNull();
  });

  it("un plafond inchangé n'écrit ni ne trace rien", async () => {
    const { writer, events, done } = run(50_000, 50_000);
    await done;
    expect(writer.written).toEqual([]);
    expect(events.traced).toEqual([]);
  });
});
