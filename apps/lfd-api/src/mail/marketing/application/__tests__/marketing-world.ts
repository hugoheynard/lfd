import {
  OpenableUnitOfWork,
  RecordingMail,
} from "../../../channels/requests/__tests__/recording-mail.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { BlockMarketingConsent } from "../block-marketing-consent.js";
import { ConfirmConsentByTokenHandler } from "../commands/confirm-consent-by-token.handler.js";
import { EraseMarketingPreferencesHandler } from "../commands/erase-marketing-preferences.handler.js";
import { UnsubscribeByTokenHandler } from "../commands/unsubscribe-by-token.handler.js";
import { ConsentConfirmationMailer } from "../services/consent-confirmation-mailer.js";
import { ConsentConfirmLinks } from "../services/consent-confirm-links.js";
import { MarketingGroup } from "../../domain/services/marketing-group.js";
import { MarketingAddressMover } from "../services/marketing-address-mover.js";
import { MarketingAddresses } from "../services/marketing-addresses.js";
import { MarketingConsentRequester } from "../services/marketing-consent-requester.js";
import { MarketingUnsubscriber } from "../services/marketing-unsubscriber.js";
import {
  FixedOrigins,
  InMemoryPreferenceReader,
  InMemoryPreferences,
  PlainConfirmTokens,
  PlainTokens,
  ReadablePrint,
} from "./marketing-doubles.js";

/** L'origine publique de la boutique, seule à savoir confirmer un accord. */
export const SHOP_ORIGIN = "https://shop.lfc.test";

export const NOW = new Date(Date.UTC(2026, 0, 1, 12));

/** Le bloc du registre, monté à la main sur ses doubles. */
export function marketingWorld(group: MarketingGroup = new MarketingGroup()) {
  const preferences = new InMemoryPreferences();
  const addresses = new MarketingAddresses(new ReadablePrint());
  const clock = new FixedClock(NOW);
  const uow = new OpenableUnitOfWork();
  const ids = new FixedIdGenerator("pref");
  const unsubscriber = new MarketingUnsubscriber(preferences, ids);
  const mail = new RecordingMail(uow);
  const confirmTokens = new PlainConfirmTokens();
  const confirmations = new ConsentConfirmationMailer(
    mail,
    new ConsentConfirmLinks(new FixedOrigins({ lfc: SHOP_ORIGIN }), confirmTokens),
  );
  const requester = new MarketingConsentRequester(preferences, confirmations, ids);
  return {
    preferences,
    addresses,
    clock,
    mail,
    confirmTokens,
    tokens: new PlainTokens(),
    confirm: new ConfirmConsentByTokenHandler(confirmTokens, addresses, preferences, clock, uow),
    byToken: new UnsubscribeByTokenHandler(new PlainTokens(), addresses, unsubscriber, clock, uow),
    erase: new EraseMarketingPreferencesHandler(preferences, addresses, uow),
    consent: new BlockMarketingConsent(
      addresses,
      unsubscriber,
      requester,
      new InMemoryPreferenceReader(preferences),
      clock,
      uow,
      new MarketingAddressMover(preferences, ids),
      group,
    ),
  };
}
