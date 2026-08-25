import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { VolumeCommitmentAggregate } from "./entities/volume-commitment.js";

/**
 * **Les faits d'un engagement de volume.**
 *
 * Un engagement est un **contrat** : le client promet un volume, la maison
 * consent un prix. C'est la seule pièce de la tarification qui engage l'autre
 * partie, et celle dont on relira les termes quand la promesse ne sera pas
 * tenue — « qui a signé ça, pour combien, jusqu'à quand ».
 *
 * Les règles, planchers et barèmes ont leur propre journal, transactionnel et
 * riche (`PricingAct` : motif, phrase figée). L'engagement, lui, n'en avait
 * aucun : ni acte, ni fait. C'est le trou que ces deux-là ferment.
 */
export const VOLUME_COMMITMENT_FACTS = {
  signed: "volume_commitment.signed",
  closed: "volume_commitment.closed",
} as const;

export class VolumeCommitmentSignedEvent implements JournaledEvent {
  constructor(readonly commitment: VolumeCommitmentAggregate) {}

  journalFact(): JournalFact {
    const { companyId, scope, promisedQuantity, validFrom, validTo } = this.commitment.asCommitment;
    return {
      type: VOLUME_COMMITMENT_FACTS.signed,
      subjectType: "volume_commitment",
      subjectId: this.commitment.id,
      // Les termes ENTIERS : ce sont eux qu'on vient relire, et ils tiennent en
      // cinq champs. Le client visé en fait partie — un engagement sans société
      // n'engage personne.
      payload: {
        companyId,
        scope: scope.type,
        scopeId: scope.id,
        promisedQuantity,
        validFrom: validFrom.toISOString(),
        validTo: validTo.toISOString(),
      },
    };
  }
}

/**
 * Clore est **terminal et sans effet rétroactif** : ce qui a été livré sous
 * l'engagement l'a été. Le motif écrit par l'agent part avec le fait — c'est
 * souvent la seule phrase qui explique pourquoi un prix a cessé de s'appliquer.
 */
export class VolumeCommitmentClosedEvent implements JournaledEvent {
  constructor(
    readonly commitmentId: string,
    readonly reason: string | null,
  ) {}

  journalFact(): JournalFact {
    return {
      type: VOLUME_COMMITMENT_FACTS.closed,
      subjectType: "volume_commitment",
      subjectId: this.commitmentId,
      payload: { reason: this.reason },
    };
  }
}
