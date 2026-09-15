import { SirenSiretMismatchError } from "../errors/account-errors.js";
import { Siren } from "./siren.js";
import { Siret } from "./siret.js";

/**
 * Le couple SIRET / SIREN d'une société — et la règle qui les lie.
 *
 * Le SIRET identifie un établissement, le SIREN l'entreprise ; les neuf premiers
 * chiffres du premier SONT le second, **quand ils forment un SIREN valide**. Ce
 * « quand » n'est pas une précaution : la clé de Luhn d'un SIRET ne garantit
 * pas celle de son préfixe (`81245678900021`). Trois cas, donc :
 *
 * - SIRET connu, préfixe valide ⇒ le SIREN **est** ce préfixe ; un SIREN saisi
 *   qui le contredit est refusé ;
 * - SIRET connu, préfixe invalide ⇒ le SIREN est libre (saisi ou vide) ;
 * - pas de SIRET ⇒ le SIREN est libre.
 *
 * Tenue ici plutôt que dans `Company` pour que la règle soit une propriété du
 * couple et non un geste à répéter dans chaque écriture : les trois chemins
 * (déclaration, complétion, correction) passent par `consistent`.
 *
 * Plan : `documentation/comptabilite/plan-mentions-obligatoires-du-mandat.md` §9.1.
 */
export class LegalRegistration {
  private constructor(
    readonly siret: Siret | null,
    readonly siren: Siren | null,
  ) {}

  /** À l'ouverture : un SIREN vide est pris du SIRET, un SIREN contraire refusé. */
  static declare(rawSiret: string, rawSiren: string): LegalRegistration {
    return LegalRegistration.consistent(
      Siret.createOptional(rawSiret),
      Siren.createOptional(rawSiren),
    );
  }

  /**
   * Depuis la base — et **ne lève jamais pour la paire**.
   *
   * Une ligne peut porter un SIREN vide à côté d'un SIRET : écrite avant la
   * colonne, par une fabrique de test, ou par l'ancien binaire pendant la
   * fenêtre de déploiement. Le SIREN y est complété depuis un préfixe valide.
   * Une paire contradictoire est gardée telle quelle : refuser de la LIRE
   * rendrait la fiche illisible, donc impossible à corriger. Seule une écriture
   * refuse une contradiction.
   */
  static reconstitute(rawSiret: string, rawSiren: string): LegalRegistration {
    const siret = Siret.createOptional(rawSiret);
    const stored = Siren.createOptional(rawSiren);
    return new LegalRegistration(siret, stored ?? prefixOrNull(siret));
  }

  /**
   * Complète ce qui manque — la complétion **client**. Un numéro déjà posé
   * n'est pas réécrit, et ce qui est saisi à sa place est ignoré sans être lu.
   *
   * Rien de neuf ⇒ la paire rendue est la même : compléter la raison sociale
   * d'une fiche ancienne à la paire contradictoire ne doit pas échouer sur deux
   * numéros qu'on n'a pas touchés.
   */
  complete(rawSiret: string, rawSiren: string): LegalRegistration {
    const siret = this.siret ?? Siret.createOptional(rawSiret);
    const siren = this.siren ?? Siren.createOptional(rawSiren);
    if (siret === this.siret && siren === this.siren) {
      return this;
    }
    return LegalRegistration.consistent(siret, siren);
  }

  /**
   * Corrige — la correction **staff**. Un champ vide ne réécrit rien.
   *
   * Un SIRET envoyé **sans** SIREN recalcule le SIREN : l'écran du back-office
   * n'envoyait que le SIRET (vitruve §8.4), et une correction d'établissement
   * se serait heurtée à l'ancien SIREN. Voir {@link recomputedFor}.
   */
  correct(rawSiret: string, rawSiren: string): LegalRegistration {
    const siretIn = Siret.createOptional(rawSiret);
    const sirenIn = Siren.createOptional(rawSiren);
    if (siretIn === null && sirenIn === null) {
      return this;
    }
    const siret = siretIn ?? this.siret;
    const siren = sirenIn ?? (siretIn === null ? this.siren : this.recomputedFor(siretIn));
    return LegalRegistration.consistent(siret, siren);
  }

  /** Les 14 chiffres, ou la chaîne vide. */
  get siretDigits(): string {
    return this.siret?.value ?? "";
  }

  /** Les 9 chiffres, ou la chaîne vide. */
  get sirenDigits(): string {
    return this.siren?.value ?? "";
  }

  /**
   * Le SIREN qui accompagne un SIRET corrigé sans SIREN.
   *
   * Préfixe valide ⇒ c'est lui. Préfixe invalide ⇒ le SIREN actuel ne reste que
   * s'il avait été **saisi** : s'il était le préfixe de l'ancien SIRET, il
   * désignait l'ancienne entreprise, et le garder imprimerait sur un mandat un
   * SIREN que plus rien ne justifie.
   */
  private recomputedFor(siret: Siret): Siren | null {
    const prefix = Siren.prefixOf(siret);
    if (prefix !== null) {
      return prefix;
    }
    const previous = prefixOrNull(this.siret);
    const wasDerived = previous !== null && this.siren !== null && previous.equals(this.siren);
    return wasDerived ? null : this.siren;
  }
  /**
   * La paire telle qu'une ÉCRITURE la pose : SIREN pris du préfixe valide,
   * contradiction refusée.
   *
   * @throws {SirenSiretMismatchError} le SIREN saisi n'est pas le préfixe du SIRET.
   */
  private static consistent(siret: Siret | null, siren: Siren | null): LegalRegistration {
    const prefix = prefixOrNull(siret);
    if (siret === null || prefix === null) {
      return new LegalRegistration(siret, siren);
    }
    if (siren !== null && !siren.equals(prefix)) {
      throw new SirenSiretMismatchError(siren.value, siret.value);
    }
    return new LegalRegistration(siret, prefix);
  }
}

function prefixOrNull(siret: Siret | null): Siren | null {
  return siret === null ? null : Siren.prefixOf(siret);
}
