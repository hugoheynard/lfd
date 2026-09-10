/**
 * **Les attestations, en LECTURE et par lot.**
 *
 * Un port séparé de `OrderHandoverRepository`, qui écrit. C'est l'ISP du §2 du
 * `CLAUDE.md`, et ici ce n'est pas théorique : le dépôt d'écriture porte
 * `attest`, dont le contrat entier tient dans « la base tranche la course ».
 * Y ajouter une lecture de liste ferait qu'un écran de consultation dépendrait
 * du port qui grave des preuves.
 *
 * ⚠️ **Par LOT, et c'est le point.** La file affiche des dizaines de lignes ;
 * demander l'attestation de chacune une par une ferait autant de requêtes que
 * de commandes, pour peindre un écran qu'on ouvre toutes les dix minutes. Le
 * problème classique du front qui multiplie ce que le serveur pourrait
 * additionner — sauf qu'ici, c'est le serveur qui se le ferait à lui-même.
 */
export abstract class HandoverAttestationsReader {
  /**
   * Ce qui a été remis, parmi ces commandes.
   *
   * Rend une **table** plutôt qu'une liste : l'appelant croise avec sa file, et
   * une recherche linéaire par ligne redonnerait le coût qu'on vient d'éviter.
   * Les commandes sans attestation en sont simplement absentes — `undefined`
   * dit « pas encore remise » sans qu'on ait à porter un drapeau.
   */
  abstract forOrders(orderIds: readonly string[]): Promise<ReadonlyMap<string, AttestedHandover>>;
}

/** Ce qu'on sait d'une remise déjà faite, pour l'afficher — pas pour la rejouer. */
export interface AttestedHandover {
  readonly handedOverAt: Date;
  /** L'identité staff figée (claim `sub`). Une preuve sans auteur n'en est pas. */
  readonly handedOverBy: string;
  /** `scan` ou `manual` — l'écran les distingue, cf. `HandoverVia`. */
  readonly via: string;
}
