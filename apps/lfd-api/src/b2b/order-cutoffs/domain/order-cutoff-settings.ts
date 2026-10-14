import type { StaffTrace } from "../../account/domain/value-objects/staff-trace.js";

/**
 * **L'interrupteur de l'heure limite générale, et le jour même**, tel qu'on l'écrit (plan
 * `documentation/commandes/plan-reglages-commandes.md`, §8.1, lot O3).
 *
 * Pas un agrégat : un réglage sans transition ni règle de refus (CLAUDE.md
 * §3.1) — activer ce qui l'est déjà, ou l'inverse, n'est pas une faute, et le
 * handler n'écrit alors rien. Copié sur `OrderOpening` : ce que cette classe
 * garantit est la TRACE, un geste porte son instant et son auteur.
 */
export class OrderCutoffSettings {
  private constructor(
    readonly enabled: boolean,
    readonly sameDayAllowed: boolean,
    readonly at: Date,
    readonly author: StaffTrace,
  ) {}

  /** L'état courant, modifié par les seules clés présentes du patch. */
  static pose(input: {
    readonly current: OrderCutoffSettingsState;
    readonly patch: {
      readonly enabled?: boolean | undefined;
      readonly sameDayAllowed?: boolean | undefined;
    };
    readonly at: Date;
    readonly author: StaffTrace;
  }): OrderCutoffSettings {
    return new OrderCutoffSettings(
      input.patch.enabled ?? input.current.enabled,
      input.patch.sameDayAllowed ?? input.current.sameDayAllowed,
      input.at,
      input.author,
    );
  }

  /** Le patch ne change rien à l'état courant. */
  sameAs(current: OrderCutoffSettingsState): boolean {
    return this.enabled === current.enabled && this.sameDayAllowed === current.sameDayAllowed;
  }
}

/** Le réglage sans sa trace. */
export interface OrderCutoffSettingsState {
  readonly enabled: boolean;
  readonly sameDayAllowed: boolean;
}
