import { PublicPickupClosure, type PublicPickupClosureState } from "./public-pickup-closure.js";
import { PublicPickupSlotRulesOverlapError } from "./pickup-errors.js";
import { PublicPickupSlotRule, type PublicPickupSlotRuleState } from "./public-pickup-slot-rule.js";

/** L'état complet de l'horaire public d'un point, en primitives. */
export interface PickupScheduleState {
  readonly pickupAddressId: string;
  readonly rules: readonly PublicPickupSlotRuleState[];
  readonly closures: readonly PublicPickupClosureState[];
}

/**
 * **L'horaire public d'un point de retrait** — ses règles de créneaux et ses
 * fermetures datées.
 *
 * 🔴 Un agrégat pour **un seul** invariant, et il faut le dire : le
 * **chevauchement** entre deux règles du même point et du même jour (plan
 * `documentation/b2b/plan-creneaux-de-retrait.md`, D7). Les autres refus — plage
 * vide, découpe qui n'ouvre rien, badge vide, capacité qui ne sert personne —
 * portent sur UNE règle et vivent dans {@link PublicPickupSlotRule} : les
 * invoquer ici aurait justifié l'agrégat par des règles qui n'en demandent pas
 * (vitruve, S4).
 *
 * Deux plages qui se recouvrent offriraient la même heure deux fois, avec deux
 * badges et deux capacités, sans que rien ne dise laquelle gagne. C'est
 * exactement ce qu'une vérification de handler ne peut pas tenir : le prochain
 * handler qui touche le même point l'oublierait.
 *
 * ⚠️ La **course** entre deux administrateurs est assumée (D8) : l'écriture est
 * un geste d'administration, rare, à un opérateur. Deux écritures simultanées
 * passeraient toutes deux la vérification, et la seconde gagne. Le prix d'un
 * `EXCLUDE … USING gist` (extension `btree_gist` en prod ET dans la base jetable
 * des e2e) n'est pas payé pour cette fenêtre-là.
 *
 * `PickupSchedule` ne porte AUCUNE connaissance des heures **pro** (`opening`) :
 * les deux structures cohabitent, et la mutualisation est remise à plus tard (§3).
 */
export class PickupSchedule {
  private constructor(
    private readonly pickupAddressId: string,
    private rules: readonly PublicPickupSlotRule[],
    private closures: readonly PublicPickupClosure[],
  ) {}

  /** L'horaire d'un point qui n'en a pas encore : aucune règle, aucune fermeture. */
  static empty(pickupAddressId: string): PickupSchedule {
    return new PickupSchedule(pickupAddressId, [], []);
  }

  /**
   * Rehydrate depuis la base. Règles et fermetures repassent par leurs value
   * objects : une ligne écrite hors du domaine ne rentre pas en mémoire sans
   * être revalidée, et le chevauchement est revérifié — une base qui aurait
   * dérivé le dirait ici plutôt qu'à l'affichage.
   *
   * @throws {PublicPickupSlotRulesOverlapError} deux règles stockées se chevauchent.
   */
  static reconstitute(state: PickupScheduleState): PickupSchedule {
    const rules = state.rules.map((rule) => PublicPickupSlotRule.of(rule));
    const closures = state.closures.map((closure) => PublicPickupClosure.of(closure));
    assertNoOverlap(rules);
    return new PickupSchedule(state.pickupAddressId, rules, closures);
  }

  get id(): string {
    return this.pickupAddressId;
  }

  get ruleCount(): number {
    return this.rules.length;
  }

  get closureCount(): number {
    return this.closures.length;
  }

  /** L'horaire est-il **réglé** ? Sans règle, le point se comporte comme avant (D6). */
  get isConfigured(): boolean {
    return this.rules.length > 0;
  }

  /**
   * Remplace **en bloc** les règles et les fermetures du point.
   *
   * En bloc et non ligne à ligne, parce que le refus se juge sur l'ensemble :
   * une règle acceptée isolément peut chevaucher celle d'à côté. C'est aussi le
   * geste réel de l'opérateur — il édite sa grille et l'enregistre.
   *
   * @throws {PublicPickupSlotRulesOverlapError} deux des règles données se chevauchent.
   */
  replace(rules: readonly PublicPickupSlotRule[], closures: readonly PublicPickupClosure[]): void {
    assertNoOverlap(rules);
    this.rules = [...rules];
    this.closures = [...closures];
  }

  /** L'état à écrire, règles d'abord — l'adaptateur leur donne leurs identifiants. */
  toPersistence(): PickupScheduleState {
    return {
      pickupAddressId: this.pickupAddressId,
      rules: this.rules.map((rule) => rule.toPersistence()),
      closures: this.closures.map((closure) => closure.toPersistence()),
    };
  }
}

/**
 * Le seul invariant de l'agrégat : aucune paire de règles ne peut viser le même
 * jour à la même heure.
 *
 * Comparaison deux à deux, sans tri préalable : une grille de comptoir compte
 * quelques lignes, et un tri par jour n'aurait de toute façon rien simplifié —
 * une règle sans jour croise toutes les autres.
 */
function assertNoOverlap(rules: readonly PublicPickupSlotRule[]): void {
  for (let i = 0; i < rules.length; i += 1) {
    for (let j = i + 1; j < rules.length; j += 1) {
      const first = rules[i];
      const second = rules[j];
      if (first === undefined || second === undefined) {
        continue;
      }
      if (first.sharesDaysWith(second) && first.overlapsHours(second)) {
        throw new PublicPickupSlotRulesOverlapError(first.label(), second.label());
      }
    }
  }
}
