import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { FixedLoyaltySettings, OPEN_TO_PUBLIC } from "../../commands/__tests__/loyalty-doubles.js";
import { WelcomeBonusPreviewing } from "../welcome-bonus-previewing.js";

const NOW = new Date(10_000);
const clock = () => new FixedClock(NOW);
const BONUS_ON = { ...OPEN_TO_PUBLIC, welcomeBonusPoints: 500 };
const SINCE_NOW = { publicOpenedAt: NOW, welcomeBonusSince: NOW };

describe("WelcomeBonusPreviewing — « N points vous sont offerts »", () => {
  it("annonce le bonus du réglage quand il est allumé et le public ouvert", async () => {
    const preview = new WelcomeBonusPreviewing(
      new FixedLoyaltySettings(BONUS_ON, SINCE_NOW),
      clock(),
    );
    await expect(preview.pointsOnJoining()).resolves.toBe(500);
  });

  it("n'annonce rien quand le bonus est éteint", async () => {
    const preview = new WelcomeBonusPreviewing(
      new FixedLoyaltySettings(OPEN_TO_PUBLIC, SINCE_NOW),
      clock(),
    );
    await expect(preview.pointsOnJoining()).resolves.toBeNull();
  });

  it("n'annonce rien sans réglage, ni quand le public est fermé", async () => {
    await expect(
      new WelcomeBonusPreviewing(new FixedLoyaltySettings(null), clock()).pointsOnJoining(),
    ).resolves.toBeNull();
    await expect(
      new WelcomeBonusPreviewing(
        new FixedLoyaltySettings({ ...BONUS_ON, openToPublic: false }, SINCE_NOW),
        clock(),
      ).pointsOnJoining(),
    ).resolves.toBeNull();
  });
});
