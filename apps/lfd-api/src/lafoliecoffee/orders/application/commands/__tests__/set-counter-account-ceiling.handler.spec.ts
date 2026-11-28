import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { InvalidCounterAccountCeilingError } from "../../../domain/errors/counter-account-ceiling-setting.error.js";
import { CounterAccountCeilingSettingRepository } from "../../../domain/ports/counter-account-ceiling-setting.repository.js";
import type { CounterAccountCeilingSetting } from "../../../domain/value-objects/counter-account-ceiling-setting.js";
import { SetCounterAccountCeilingCommand } from "../set-counter-account-ceiling.command.js";
import { SetCounterAccountCeilingHandler } from "../set-counter-account-ceiling.handler.js";

// Comparée à rien d'autre qu'elle-même : le réglage la recopie.
const NOW = new Date("2026-08-07T09:00:00.000Z");

class RecordingSettings extends CounterAccountCeilingSettingRepository {
  readonly posed: CounterAccountCeilingSetting[] = [];
  put(setting: CounterAccountCeilingSetting): Promise<void> {
    this.posed.push(setting);
    return Promise.resolve();
  }
}

function world() {
  const settings = new RecordingSettings();
  return { settings, handler: new SetCounterAccountCeilingHandler(settings, new FixedClock(NOW)) };
}

describe("régler le plafond des comptes du comptoir (K5)", () => {
  it("pose le montant au nom de l'agent, à l'instant du geste", async () => {
    const w = world();

    await w.handler.execute(new SetCounterAccountCeilingCommand(30_000, "staff_lea"));

    expect(w.settings.posed).toEqual([
      expect.objectContaining({
        ceilingCents: 30_000,
        updatedAt: NOW,
        updatedByStaffId: "staff_lea",
      }),
    ]);
  });

  it("`null` retire le plafond, et l'auteur reste tracé", async () => {
    const w = world();

    await w.handler.execute(new SetCounterAccountCeilingCommand(null, "staff_lea"));

    expect(w.settings.posed[0]).toMatchObject({
      ceilingCents: null,
      updatedByStaffId: "staff_lea",
    });
  });

  it("refuse un montant négatif sans rien écrire", async () => {
    const w = world();

    await expect(
      w.handler.execute(new SetCounterAccountCeilingCommand(-1, "staff_lea")),
    ).rejects.toBeInstanceOf(InvalidCounterAccountCeilingError);
    expect(w.settings.posed).toEqual([]);
  });
});
