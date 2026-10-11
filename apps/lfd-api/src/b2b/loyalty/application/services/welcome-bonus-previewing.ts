import { Injectable } from "@nestjs/common";

import { WelcomeBonusPreview } from "../../../orders/domain/ports/welcome-bonus-preview.js";
import { Clock } from "../../../../platform/time/clock.js";
import { LoyaltySettingsReader } from "../../domain/ports/loyalty-settings.store.js";
import { welcomeBonusFor } from "../../domain/services/welcome-bonus.js";

/** La personne n'a pas encore de compte : l'identité n'entre pas dans la règle. */
const PROSPECT_USER_ID = "prospect";

/**
 * La fidélité répond à la confirmation invité : **combien de points lui
 * seraient offerts en créant son compte ?** (plan bienvenue, lot D).
 *
 * 🔴 Par la règle même du crédit ({@link welcomeBonusFor}), sur une personne
 * qui deviendrait un compte **maintenant**, à adresse prouvée — les deux
 * conditions qu'elle remplit en créant son compte par code e-mail ou Google
 * avec cette adresse. La règle d'ouverture et d'allumage n'existe qu'une fois.
 */
@Injectable()
export class WelcomeBonusPreviewing extends WelcomeBonusPreview {
  constructor(
    private readonly settings: LoyaltySettingsReader,
    private readonly clock: Clock,
  ) {
    super();
  }

  async pointsOnJoining(): Promise<number | null> {
    const bonus = welcomeBonusFor(
      {
        userId: PROSPECT_USER_ID,
        becameAccountAt: this.clock.now(),
        addressProven: true,
        alreadyWelcomed: false,
      },
      await this.settings.read(),
    );
    return bonus.kind === "welcome" ? bonus.points : null;
  }
}
