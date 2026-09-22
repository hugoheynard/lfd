import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import { ACCOUNT_FACTS } from "./account-facts.js";
import type { NamedRef, PersonRef } from "./journal-names.js";

/**
 * Les faits qui touchent une **personne** plutôt qu'une société : son profil,
 * son accès (plan `documentation/journalisation/plan-journal-d-activite.md`,
 * lot 1, tranche (c), 2026-09-19).
 *
 * Aucun ne porte de coordonnée — ni l'e-mail, ni le téléphone, ni le lien de
 * mot de passe. Le journal se relit largement et se garde longtemps : il dit
 * **qui a agi, sur qui, quand**, et la fiche dit le reste.
 *
 * La personne y est nommée (`subjectLabel`, lot B du plan des phrases) quand
 * son profil porte un nom ; sinon la charge n'en porte pas — son adresse n'en
 * tient jamais lieu.
 */

/**
 * La seule voie de rattachement ouverte : le profil. La porte d'entrée, elle,
 * refuse toujours (`SocialSignInAccountExistsError`) et n'écrit donc aucun fait.
 */
const LINKED_VIA_PROFILE = "profile";

/** Le libellé du sujet, omis plutôt qu'inventé quand la personne n'a pas de nom. */
function labelOf(name: string | null): Record<string, unknown> {
  return name === null ? {} : { subjectLabel: name };
}

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
    /** Le nom APRÈS le geste, ou `null` si le profil n'en porte pas. */
    readonly name: string | null,
    readonly fields: readonly string[],
  ) {}

  journalFact(): JournalFact {
    return {
      type: ACCOUNT_FACTS.profileUpdated,
      subjectType: "user",
      subjectId: this.userId,
      payload: { ...labelOf(this.name), fields: [...this.fields] },
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
  constructor(
    readonly userId: string,
    /** Le nom de la personne, ou `null` si son profil n'en porte pas. */
    readonly name: string | null,
  ) {}

  journalFact(): JournalFact {
    return {
      type: ACCOUNT_FACTS.passwordLinkIssued,
      subjectType: "user",
      subjectId: this.userId,
      payload: labelOf(this.name),
    };
  }
}

/**
 * **La personne a demandé à changer son mot de passe**, depuis son profil, et un
 * lien est parti à l'adresse de son compte.
 *
 * Comme pour {@link PasswordLinkIssuedEvent}, **le lien n'entre pas au
 * journal** : c'est un porteur de droits. Le geste, lui, oui — c'est la seule
 * trace qu'un lien a été demandé pour ce compte, et la seule façon de voir une
 * rafale de demandes après coup.
 *
 * Il n'atteste pas qu'un e-mail est arrivé : il dit qu'on l'a demandé
 * (CLAUDE.md §0, « un e-mail parti est parti » — et un e-mail accepté n'est pas
 * un e-mail lu).
 */
export class PasswordResetRequestedEvent implements JournaledEvent {
  constructor(
    readonly userId: string,
    /** Le nom de la personne, ou `null` si son profil n'en porte pas. */
    readonly name: string | null,
  ) {}

  journalFact(): JournalFact {
    return {
      type: ACCOUNT_FACTS.passwordResetRequested,
      subjectType: "user",
      subjectId: this.userId,
      payload: labelOf(this.name),
    };
  }
}

/**
 * Un accès à l'espace d'une société est ouvert à une personne — invitation d'un
 * membre, ou rattachement du détenteur d'un compte ouvert sans lui. La personne
 * est désignée par son id `users`, son nom saisi s'il y en a un, et son rôle —
 * jamais par son adresse.
 */
export class CompanyAccessOpenedEvent implements JournaledEvent {
  constructor(
    readonly company: NamedRef,
    readonly person: PersonRef,
    readonly role: string,
  ) {}

  journalFact(): JournalFact {
    return {
      type: ACCOUNT_FACTS.accessOpened,
      subjectType: "company",
      subjectId: this.company.id,
      payload: { subjectLabel: this.company.name, person: { ...this.person }, role: this.role },
    };
  }
}

/**
 * **Une méthode de connexion de plus ouvre le compte** — la personne l'a
 * ajoutée depuis son profil, en prouvant qu'elle tient les deux sessions.
 *
 * 🔴 La charge porte le **fournisseur** et la **connexion**, jamais le `sub`
 * secondaire : un identifiant chez un tiers n'entre pas au journal
 * (`documentation/journalisation/architecture-journalisation.md` §12). Il n'en
 * faut pas — un compte n'a qu'une identité par fournisseur chez nous, donc
 * `provider` la désigne sans ambiguïté.
 *
 * `linkedVia` dit par où le geste est passé. Une seule voie aujourd'hui, le
 * profil ; l'écrire maintenant évite d'avoir à deviner plus tard ce qu'une
 * ligne sans champ voulait dire.
 */
export class LoginMethodLinkedEvent implements JournaledEvent {
  constructor(
    readonly userId: string,
    /** Le nom de la personne, ou `null` si son profil n'en porte pas. */
    readonly name: string | null,
    readonly provider: string,
    readonly connection: string | null,
  ) {}

  journalFact(): JournalFact {
    return {
      type: ACCOUNT_FACTS.identityLinked,
      subjectType: "user",
      subjectId: this.userId,
      payload: {
        ...labelOf(this.name),
        provider: this.provider,
        connection: this.connection,
        linkedVia: LINKED_VIA_PROFILE,
      },
    };
  }
}

/**
 * **Une méthode de connexion secondaire a été détachée.** Même charge que le
 * rattachement, sans la voie : on retire d'où l'on voit, il n'y a rien à
 * distinguer.
 */
export class LoginMethodRevokedEvent implements JournaledEvent {
  constructor(
    readonly userId: string,
    readonly name: string | null,
    readonly provider: string,
    readonly connection: string | null,
  ) {}

  journalFact(): JournalFact {
    return {
      type: ACCOUNT_FACTS.identityRevoked,
      subjectType: "user",
      subjectId: this.userId,
      payload: {
        ...labelOf(this.name),
        provider: this.provider,
        connection: this.connection,
      },
    };
  }
}
