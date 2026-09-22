import { BusinessError, DomainError, TechnicalError, type PublicErrorFacts } from "./app-error.js";

/**
 * Le **fournisseur d'identité** a refusé, ou son canal n'est pas configuré.
 *
 * C'est **volontairement** une erreur technique et non un refus métier :
 * personne n'a rien fait de mal. Et c'est ce qui autorise l'appelant à renoncer
 * à son écriture locale — propager un e-mail chez nous mais pas chez le
 * fournisseur connecterait quelqu'un avec une adresse en lui en affichant une
 * autre.
 *
 * Elle vit dans `shared/` parce que le canal d'identité sert désormais deux
 * contextes — les clients et l'équipe — et qu'une panne du fournisseur n'est
 * pas un incident du contexte `account`.
 */
export class IdentityProviderUnavailableError extends TechnicalError {
  /**
   * Le **statut** rendu par le fournisseur, quand il a répondu.
   *
   * Publié dans la réponse HTTP (cf. `PublicErrorFacts`), parce qu'un `429` ne
   * se traite pas comme un `403` : sans ce nombre, l'exploitant reste devant
   * « une erreur technique est survenue », qui n'oriente vers rien. Le CORPS de
   * la réponse, lui, reste au journal — il peut porter des détails du tenant.
   */
  override readonly facts: PublicErrorFacts;

  constructor(reason: string, providerStatus?: number, cause?: unknown) {
    super("identity_provider.unavailable", reason, cause);
    this.facts = providerStatus === undefined ? {} : { providerStatus };
  }
}

/**
 * Le `sub` que **nous** avons stocké n'existe pas chez le fournisseur.
 *
 * Distincte d'une panne, et c'est tout l'intérêt : le canal répond très bien, il
 * dit simplement que cette identité-là n'est pas la sienne. Nos deux bases ont
 * divergé — un compte ouvert pendant que l'adaptateur de développement
 * fabriquait des sujets `dev|…`, une identité supprimée depuis chez Auth0, un
 * changement de tenant.
 *
 * Elle est **rattrapable**, contrairement à une panne : l'adresse e-mail n'a pas
 * bougé, et `provision` sait retrouver une identité à partir d'elle. Levée pour
 * que l'appelant puisse le faire, plutôt que de rendre un 500 à quelqu'un qui
 * n'obtiendrait jamais son lien autrement — un sujet périmé ne se répare pas
 * tout seul, et chaque tentative échoue exactement pareil.
 */
export class IdentitySubjectUnknownError extends TechnicalError {
  /**
   * `subject` reste porté par l'objet, pour l'appelant qui répare ; il n'entre
   * plus dans le MESSAGE, que `AppErrorFilter` écrit au journal de production
   * (`architecture-journalisation.md` §12, §8 — un identifiant chez un tiers
   * n'a rien à faire dans nos logs).
   */
  constructor(readonly subject: string) {
    super(
      "identity_provider.subject_unknown",
      "Le fournisseur d'identité ne connaît plus l'identité de connexion enregistrée pour ce compte : " +
        "elle a divergé de la nôtre (compte supprimé chez lui, ou ouvert en développement).",
    );
  }
}

/**
 * La **preuve de possession** d'un compte tiers ne tient pas : signature,
 * émetteur, audience ou sujet du jeton d'identité ne sont pas les nôtres.
 *
 * `DomainError` (400) et non `IdentityProviderUnavailableError` (500) : rien
 * n'est en panne, c'est le jeton présenté qui ne prouve pas ce qu'il prétend.
 * Le détail du refus reste **au journal** — le dire à l'appelant lui
 * apprendrait quelle de nos vérifications contourner.
 */
export class IdentityProofInvalidError extends DomainError {
  constructor(cause?: unknown) {
    super(
      "identity.proof_invalid",
      "La vérification de ce compte n'a pas abouti. Recommencez depuis votre profil.",
      cause,
    );
  }
}

/**
 * La preuve a **plus de cinq minutes**.
 *
 * Distincte de {@link IdentityProofInvalidError} parce que le geste de sortie
 * n'est pas le même : ici rien n'est suspect, il suffit de refaire la
 * manipulation. Un message unique ferait chercher un problème là où il n'y a
 * qu'un délai.
 */
export class IdentityProofExpiredError extends DomainError {
  constructor() {
    super(
      "identity.proof_expired",
      "La vérification a expiré. Recommencez pour rattacher ce compte.",
    );
  }
}

/**
 * On ne **peut pas** vérifier une preuve : l'application cliente n'est pas
 * déclarée dans l'environnement (`AUTH0_CUSTOMER_CLIENT_ID`).
 *
 * `TechnicalError` parce que personne n'a rien fait de mal — c'est notre
 * configuration qui manque. Elle existe pour que l'absence de variable
 * **refuse** au lieu de comparer `aud` à `undefined`, ce qui reviendrait à
 * accepter n'importe quel jeton du tenant, y compris celui d'une autre
 * application.
 */
export class IdentityProofUnverifiableError extends TechnicalError {
  constructor() {
    super(
      "identity.proof_unverifiable",
      "La vérification des comptes tiers n'est pas configurée sur ce serveur " +
        "(AUTH0_CUSTOMER_CLIENT_ID) : aucun rattachement n'est accepté.",
    );
  }
}

/**
 * Le fournisseur d'identité **refuse** le rattachement — il répond `400`.
 *
 * Un refus, pas un incident : `IdentityProviderUnavailableError` est un
 * `TechnicalError`, donc un `500` anonyme, et il ne convient pas ici. Le corps
 * de la réponse d'Auth0 reste au journal ; c'est **nous** qui nommons le refus.
 *
 * `BusinessError` (409) plutôt que 400 : un jeton malformé ou périmé est déjà
 * refusé en amont par `IdTokenVerifier` (signature, `aud`, `iat` < 5 min,
 * vérifié le 2026-09-22), si bien qu'un `400` qui survit à ce contrôle désigne
 * presque toujours une identité **déjà rattachée** ailleurs.
 */
export class IdentityLinkRefusedError extends BusinessError {
  constructor() {
    super(
      "identity.link_refused",
      "Le fournisseur d'identité a refusé de rattacher ce compte : il est " +
        "probablement déjà lié à un autre compte. Connectez-vous avec lui pour le retrouver.",
    );
  }
}

/**
 * Le fournisseur **refuse le détachement** — il répond `400`.
 *
 * Le cas réel derrière ce refus est presque toujours le même : l'identité
 * visée n'est pas une identité **secondaire** de ce compte (elle a déjà été
 * détachée, ou c'est la principale, que la Management API ne délie jamais).
 * L'écran a donc une vue périmée, et le geste de sortie est de la rafraîchir.
 */
export class IdentityUnlinkRefusedError extends BusinessError {
  constructor() {
    super(
      "identity.unlink_refused",
      "Cette méthode de connexion n'est plus rattachée à ce compte, ou en est la méthode principale. " +
        "Rechargez la page pour voir l'état réel.",
    );
  }
}
