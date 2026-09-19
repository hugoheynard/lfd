import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import { ACCOUNT_FACTS } from "./account-facts.js";

/**
 * Les faits qui touchent une **personne** plutôt qu'une société : son profil,
 * son accès (plan `documentation/journalisation/plan-journal-d-activite.md`,
 * lot 1, tranche (c), 2026-09-19).
 *
 * Aucun ne porte de coordonnée — ni l'e-mail, ni le téléphone, ni le lien de
 * mot de passe. Le journal se relit largement et se garde longtemps : il dit
 * **qui a agi, sur qui, quand**, et la fiche dit le reste.
 */

/**
 * La personne a modifié son profil. La charge nomme **les champs** changés
 * (`email`, `phone`…), jamais leurs valeurs.
 *
 * Écrit APRÈS la propagation de l'adresse chez le fournisseur d'identité, dans
 * la transaction de l'écriture du profil : c'est le seul ordre qui ne ment pas
 * — un fait « adresse changée » dont le fournisseur aurait refusé le changement
 * affirmerait l'inverse de ce qui s'est passé.
 */
export class UserProfileUpdatedEvent implements JournaledEvent {
  constructor(
    readonly userId: string,
    readonly fields: readonly string[],
  ) {}

  journalFact(): JournalFact {
    return {
      type: ACCOUNT_FACTS.profileUpdated,
      subjectType: "user",
      subjectId: this.userId,
      payload: { fields: [...this.fields] },
    };
  }
}

/**
 * Un agent a fabriqué un lien de mot de passe pour le remettre de la main à la
 * main. **Le lien n'entre pas au journal** — c'est un porteur de droits — mais
 * le geste, oui : « qui a donné de quoi ouvrir ce compte » doit avoir une
 * réponse.
 */
export class PasswordLinkIssuedEvent implements JournaledEvent {
  constructor(readonly userId: string) {}

  journalFact(): JournalFact {
    return {
      type: ACCOUNT_FACTS.passwordLinkIssued,
      subjectType: "user",
      subjectId: this.userId,
      payload: {},
    };
  }
}

/**
 * Un accès à l'espace d'une société est ouvert à une personne — invitation d'un
 * membre, ou rattachement du détenteur d'un compte ouvert sans lui. La personne
 * est désignée par son id `users` et son rôle, jamais par son adresse.
 */
export class CompanyAccessOpenedEvent implements JournaledEvent {
  constructor(
    readonly companyId: string,
    readonly userId: string,
    readonly role: string,
  ) {}

  journalFact(): JournalFact {
    return {
      type: ACCOUNT_FACTS.accessOpened,
      subjectType: "company",
      subjectId: this.companyId,
      payload: { userId: this.userId, role: this.role },
    };
  }
}
