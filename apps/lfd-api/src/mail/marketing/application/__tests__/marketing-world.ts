import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { BlockMarketingConsent } from "../block-marketing-consent.js";
import { EraseMarketingPreferencesHandler } from "../commands/erase-marketing-preferences.handler.js";
import { UnsubscribeByTokenHandler } from "../commands/unsubscribe-by-token.handler.js";
import { MarketingAddresses } from "../services/marketing-addresses.js";
import { MarketingUnsubscriber } from "../services/marketing-unsubscriber.js";
import {
  InMemoryPreferenceReader,
  InMemoryPreferences,
  PlainTokens,
  ReadablePrint,
} from "./marketing-doubles.js";

export const NOW = new Date(Date.UTC(2026, 0, 1, 12));

/** Le bloc du registre, monté à la main sur ses doubles. */
export function marketingWorld() {
  const preferences = new InMemoryPreferences();
  const addresses = new MarketingAddresses(new ReadablePrint());
  const clock = new FixedClock(NOW);
  const uow = new DirectUnitOfWork();
  const unsubscriber = new MarketingUnsubscriber(preferences, new FixedIdGenerator("pref"));
  return {
    preferences,
    addresses,
    clock,
    tokens: new PlainTokens(),
    byToken: new UnsubscribeByTokenHandler(new PlainTokens(), addresses, unsubscriber, clock, uow),
    erase: new EraseMarketingPreferencesHandler(preferences, addresses, uow),
    consent: new BlockMarketingConsent(
      addresses,
      unsubscriber,
      new InMemoryPreferenceReader(preferences),
      clock,
      uow,
    ),
  };
}
