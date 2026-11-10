import { RecordingMarketingConsent } from "../../../../../mail/channels/marketing/__tests__/recording-marketing-consent.js";
import { HeldAfterCommit } from "../../../../../platform/database/__tests__/held-after-commit.js";
import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import { OrderMarketingConsent } from "../order-marketing-consent.js";

/**
 * La case des offres à la passation, hors de ce qu'un test de passation
 * éprouve : rien ne part, la validation n'est jamais jouée. Elle s'éprouve
 * dans `order-marketing-consent.spec.ts` et en e2e.
 */
export function noOrderMarketing(): OrderMarketingConsent {
  return new OrderMarketingConsent(
    new RecordingMarketingConsent(),
    new HeldAfterCommit(),
    new BackgroundWork(),
  );
}
