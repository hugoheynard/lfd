import { FEATURE_CATALOGUE, isFeatureKey } from "@lfd/contracts";
import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";

/**
 * **Les faits de l'accès aux fonctionnalités.**
 *
 * Fermer la boutique, la rouvrir, exempter une adresse : chacun de ces gestes
 * décide qui peut commander, et la ligne qui le porte est SUPPRIMÉE quand on
 * revient en arrière. Le journal est donc la seule mémoire de « qui avait fermé,
 * et depuis quand » — d'où `publishTraced`, dans la transaction de l'écriture.
 *
 * Le sujet est la CLÉ (`shop`) : c'est ce qu'on vient relire, et c'est ce qui
 * survit à la suppression d'une ligne. Son nom (`subjectLabel`, lot B du plan
 * des phrases) est le libellé du catalogue fermé — « Boutique » —, figé au
 * moment du geste comme tout nom du journal.
 */
export const FEATURE_ACCESS_FACTS = {
  overrideSet: "feature_access.override_set",
  overrideCleared: "feature_access.override_cleared",
  exemptionAdded: "feature_access.exemption_added",
  exemptionRemoved: "feature_access.exemption_removed",
} as const satisfies Readonly<Record<string, JournalFactType>>;

const SUBJECT_TYPE = "feature_access";

/**
 * Le libellé de la fonctionnalité. Une clé hors catalogue ne peut pas arriver
 * ici — elle n'a pas de ligne à retirer —, mais si elle arrivait, c'est la clé
 * elle-même qui la nommerait plutôt qu'un libellé inventé.
 */
function labelOf(key: string): string {
  return isFeatureKey(key) ? FEATURE_CATALOGUE[key].label : key;
}

/** Une dérogation posée : la valeur, et celle qu'elle remplace. */
export class FeatureOverrideSetEvent implements JournaledEvent {
  constructor(
    readonly key: string,
    readonly value: string,
    readonly previousValue: string | null,
  ) {}

  journalFact(): JournalFact {
    return {
      type: FEATURE_ACCESS_FACTS.overrideSet,
      subjectType: SUBJECT_TYPE,
      subjectId: this.key,
      payload: {
        subjectLabel: labelOf(this.key),
        value: this.value,
        previousValue: this.previousValue,
      },
    };
  }
}

/**
 * Retour au défaut. La valeur retirée est dans la charge : la ligne n'existe
 * plus, et c'est la seule façon de relire ce qui s'appliquait juste avant.
 */
export class FeatureOverrideClearedEvent implements JournaledEvent {
  constructor(
    readonly key: string,
    readonly previousValue: string,
  ) {}

  journalFact(): JournalFact {
    return {
      type: FEATURE_ACCESS_FACTS.overrideCleared,
      subjectType: SUBJECT_TYPE,
      subjectId: this.key,
      payload: { subjectLabel: labelOf(this.key), previousValue: this.previousValue },
    };
  }
}

/**
 * L'adresse est dans la charge, et c'est voulu : « qui a exempté cette
 * adresse » est exactement la question qu'on posera, et le journal est réservé
 * au staff.
 *
 * 🔴 Contraire à la règle « jamais de coordonnées au journal », relevé au lot B
 * du plan des phrases (2026-09-19) et laissé en l'état en attente d'une
 * décision : l'exemption retirée est SUPPRIMÉE de sa table, et ce fait est
 * alors la seule mémoire de l'adresse qu'elle ouvrait.
 */
export class FeatureExemptionAddedEvent implements JournaledEvent {
  constructor(
    readonly key: string,
    readonly exemptionId: string,
    readonly email: string,
  ) {}

  journalFact(): JournalFact {
    return {
      type: FEATURE_ACCESS_FACTS.exemptionAdded,
      subjectType: SUBJECT_TYPE,
      subjectId: this.key,
      payload: {
        subjectLabel: labelOf(this.key),
        exemptionId: this.exemptionId,
        email: this.email,
      },
    };
  }
}

export class FeatureExemptionRemovedEvent implements JournaledEvent {
  constructor(
    readonly key: string,
    readonly exemptionId: string,
    readonly email: string,
  ) {}

  journalFact(): JournalFact {
    return {
      type: FEATURE_ACCESS_FACTS.exemptionRemoved,
      subjectType: SUBJECT_TYPE,
      subjectId: this.key,
      payload: {
        subjectLabel: labelOf(this.key),
        exemptionId: this.exemptionId,
        email: this.email,
      },
    };
  }
}
