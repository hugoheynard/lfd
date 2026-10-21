import type { StaffTrace } from "../../account/domain/value-objects/staff-trace.js";

/**
 * **Le jour même**, tel qu'on l'écrit (plan
 * `documentation/commandes/plan-reglages-commandes.md`, §8.3 ; sa page depuis
 * le 2026-10-21).
 *
 * Il portait aussi l'interrupteur de l'heure limite générale (lot O3) : retiré
 * le 2026-10-21, l'heure limite déclenche l'arrêt du plan et reste donc
 * toujours en vigueur (`limites-de-commande/plan-une-seule-heure.md` §5). La
 * colonne `enabled` reste en base, ni lue ni écrite.
 *
 * Pas un agrégat : un réglage sans transition ni règle de refus (CLAUDE.md
 * §3.1) — autoriser ce qui l'est déjà n'est pas une faute, et le handler
 * n'écrit alors rien. Copié sur `OrderOpening` : ce que cette classe garantit
 * est la TRACE, un geste porte son instant et son auteur.
 */
export class OrderCutoffSettings {
  private constructor(
    readonly sameDayAllowed: boolean,
    readonly resupplySubjectToCutoff: boolean,
    readonly at: Date,
    readonly author: StaffTrace,
  ) {}

  /**
   * Le réglage posé, avec son instant et son auteur. Une clé absente du geste
   * garde sa valeur courante : chaque page n'envoie que la sienne (le jour
   * même, la limite du réapprovisionnement — 2026-10-21).
   */
  static pose(input: {
    readonly current: OrderCutoffSettingsState;
    readonly sameDayAllowed?: boolean | undefined;
    readonly resupplySubjectToCutoff?: boolean | undefined;
    readonly at: Date;
    readonly author: StaffTrace;
  }): OrderCutoffSettings {
    return new OrderCutoffSettings(
      input.sameDayAllowed ?? input.current.sameDayAllowed,
      input.resupplySubjectToCutoff ?? input.current.resupplySubjectToCutoff,
      input.at,
      input.author,
    );
  }

  /** Le geste ne change rien à l'état courant. */
  sameAs(current: OrderCutoffSettingsState): boolean {
    return (
      this.sameDayAllowed === current.sameDayAllowed &&
      this.resupplySubjectToCutoff === current.resupplySubjectToCutoff
    );
  }
}

/** Le réglage sans sa trace. */
export interface OrderCutoffSettingsState {
  readonly sameDayAllowed: boolean;
  /**
   * Le réapprovisionnement d'un site suit-il l'heure limite générale ? Stocké
   * SANS effet tant qu'il n'est pas commandé au fournil (2026-10-21).
   */
  readonly resupplySubjectToCutoff: boolean;
}
