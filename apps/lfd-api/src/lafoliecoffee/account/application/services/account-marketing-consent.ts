import { SHOP_MARKETING_SPACE, type SocietyConsentAnswer } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { MarketingConsent } from "../../../../mail/channels/marketing/marketing-consent.js";
import { AfterCommit } from "../../../../platform/database/after-commit.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";

/** L'étiquette du rappel, au journal s'il échoue. */
const LABEL = "account.marketing-consent";

/** La case de la société cochée à l'inscription, et ce qu'on sait de l'adresse. */
export interface SignupConsent {
  readonly answer: SocietyConsentAnswer;
  /** L'adresse du compte est-elle prouvée (`users.email_verified`) ? */
  readonly addressProven: boolean;
}

/** Ce que le geste du compte vient d'écrire, vu du registre marketing. */
export interface AccountConsentFacts {
  readonly userId: string;
  /** L'adresse du compte APRÈS le geste. */
  readonly address: string;
  /** L'adresse d'avant, si le geste l'a changée (règle 24) ; sinon `null`. */
  readonly previousAddress: string | null;
  /** La case cochée à l'inscription, ou `null` (pas de case, ou pas ce geste). */
  readonly signup: SignupConsent | null;
}

/**
 * **Le compte parle au registre marketing** (plan
 * `documentation/mail/la-desinscription-et-l-accord.md`, C2, règles 18 et
 * 24), par le canal du bloc `mail`, APRÈS la validation du geste : le
 * registre écrit dans SA transaction, et un registre en panne ne refuse ni
 * une inscription ni un changement d'adresse — l'échec est journalisé.
 *
 * À appeler DANS l'unité de travail du geste : rien ne part s'il échoue. Le
 * déménagement passe AVANT la demande, dans le même rappel : une adresse
 * désinscrite qu'on reprend ne doit pas recevoir la confirmation d'une
 * case cochée au même instant.
 */
@Injectable()
export class AccountMarketingConsent {
  constructor(
    private readonly marketing: MarketingConsent,
    private readonly afterCommit: AfterCommit,
    private readonly work: BackgroundWork,
  ) {}

  afterAccountWritten(facts: AccountConsentFacts): void {
    const moves = facts.previousAddress !== null && facts.previousAddress !== "";
    const asks = facts.signup?.answer.accepted === true && facts.address !== "";
    if (!moves && !asks) {
      return;
    }
    this.afterCommit.defer(() => this.work.track(this.apply(facts), LABEL), LABEL);
  }

  private async apply(facts: AccountConsentFacts): Promise<void> {
    if (facts.previousAddress !== null && facts.previousAddress !== "") {
      await this.marketing.moveAddress(null, facts.previousAddress, facts.address);
    }
    const signup = facts.signup;
    if (signup?.answer.accepted !== true || facts.address === "") {
      return;
    }
    await this.marketing.request(SHOP_MARKETING_SPACE, facts.address, {
      textVersion: signup.answer.textVersion,
      locale: signup.answer.locale,
      where: "signup",
      ref: facts.userId,
      // Une adresse qui vient de changer n'est plus prouvée (`UserProfile.revise`).
      verified: signup.addressProven && facts.previousAddress === null,
    });
  }
}
