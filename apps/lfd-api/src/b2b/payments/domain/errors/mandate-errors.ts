import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Aucun mandat n'est enregistré pour cette société — **404**.
 *
 * Levée quand on tente de révoquer ou de justifier un mandat qui n'existe pas.
 * La lecture, elle, ne lève pas : « pas de mandat » est un état normal de fiche,
 * pas une erreur.
 */
export class MandateNotFoundError extends ResourceNotFoundError {
  constructor(companyId: string) {
    super(
      "payments.mandate.not_found",
      `Aucun mandat de prélèvement pour la société ${companyId}.`,
    );
  }
}

/**
 * La société a déjà un mandat actif — **409**.
 *
 * Un mandat en remplace un autre par un geste explicite (révoquer, puis
 * enregistrer), jamais par surprise : deux autorisations actives, et plus rien
 * ne dit sur laquelle on a prélevé.
 */
export class MandateAlreadyActiveError extends BusinessError {
  constructor(companyId: string) {
    super(
      "payments.mandate.already_active",
      `La société ${companyId} a déjà un mandat actif. Révoquez-le avant d'en enregistrer un nouveau.`,
    );
  }
}

/**
 * Le mandat visé n'est pas dans un état où le geste demandé a un sens — **409** :
 * révoquer un mandat déjà révoqué, ou justifier un mandat rejeté.
 */
export class MandateNotRevocableError extends BusinessError {
  constructor(status: string) {
    super("payments.mandate.not_revocable", `Un mandat « ${status} » ne peut pas être révoqué.`);
  }
}

/**
 * Aucune pièce n'est déposée pour ce mandat — **404**.
 *
 * Un mandat sans scan est un état **normal et fréquent** : le papier met des
 * jours à revenir. Ce n'est donc pas une anomalie qu'on signale, c'est une
 * ressource qui n'existe pas encore — et la fiche le dit déjà en toutes lettres
 * (« mandat sans filet »). Le 404 est ici la réponse juste, pas un aveu.
 */
export class MandateProofNotFoundError extends ResourceNotFoundError {
  constructor(companyId: string) {
    super(
      "payments.mandate.proof_missing",
      `Aucun mandat signé n'est déposé pour la société « ${companyId} ».`,
    );
  }
}

/**
 * Un brouillon de mandat existe déjà pour cette société — **409**.
 *
 * La règle est tenue en base par un index partiel ; cette erreur n'existe que
 * pour la **dire**. Sans elle, deux clics rapides rendent une violation de
 * contrainte, c'est-à-dire « erreur inattendue » à quelqu'un qui a simplement
 * cliqué deux fois.
 *
 * Le message porte la référence existante : le geste de sortie est d'ouvrir ce
 * brouillon-là — ou de l'abandonner — pas de recommencer.
 *
 * `reference` est `null` quand c'est l'INDEX qui a refusé (deux frappes
 * simultanées) : l'adaptateur ne peut pas relire dans une transaction que
 * Postgres vient d'avorter. L'appelant relit après, hors transaction, et
 * relève l'erreur nommée — ou rend le brouillon, côté client (2026-09-14).
 */
export class MandateDraftAlreadyExistsError extends BusinessError {
  constructor(readonly reference: string | null) {
    super(
      "payments.mandate.draft_already_exists",
      `Un mandat est déjà frappé et attend sa signature${reference === null ? "" : ` (${reference})`}. ` +
        "L'imprimer à nouveau, ou l'abandonner avant d'en frapper un autre.",
    );
  }
}

/**
 * On a voulu envoyer un mandat qui n'est pas un brouillon — **409**.
 *
 * Deux cas, et le message doit les distinguer parce que le geste de sortie
 * diffère. Un mandat **non frappé** n'a pas de RUM : l'envoyer ferait parvenir
 * au client un exemplaire filigrané « EXEMPLE », c'est-à-dire un document qui
 * dit lui-même qu'il ne se signe pas. Un mandat **déjà signé** ferait circuler
 * un second exemplaire de la même référence, et c'est celui qui revient en
 * dernier qui gagnerait — sur une autorisation qu'on oppose en contestation.
 */
export class MandateNotSendableError extends BusinessError {
  constructor(status: string) {
    super(
      "payments.mandate.not_sendable",
      status === "active"
        ? "Ce mandat est déjà signé : le renvoyer ferait circuler un second exemplaire de la même référence."
        : `Un mandat « ${status} » ne s'envoie pas — seul un mandat frappé et non signé attend une signature.`,
    );
  }
}

/**
 * On a voulu signer un mandat qui n'est pas un brouillon — **409**.
 *
 * Signer, c'est faire passer une autorisation de « imprimée » à « opposable ».
 * Rejouer le geste sur un mandat déjà actif écraserait la date qui fait foi ;
 * le jouer sur un mandat révoqué ressusciterait une autorisation retirée. Le
 * message nomme l'état réel parce qu'il est lu par du personnel qui n'a pas le
 * code sous les yeux, et que le geste de sortie diffère selon le cas.
 */
export class MandateNotSignableError extends BusinessError {
  constructor(status: string) {
    super(
      "payments.mandate.not_signable",
      `Un mandat « ${status} » ne peut pas être signé : seul un brouillon attend une signature.`,
    );
  }
}

/**
 * On a voulu déposer un scan sur un mandat qui n'est pas un brouillon — **409**.
 *
 * Le scan prouve la signature du papier qu'on a fait signer : il n'a de sens
 * que sur le brouillon qui attend cette signature. Déposé sur un mandat actif,
 * il remplacerait la pièce qu'on oppose en contestation ; sur un mandat
 * révoqué, il justifierait une autorisation retirée.
 */
export class MandateNotProvableError extends BusinessError {
  constructor(status: string) {
    super(
      "payments.mandate.not_provable",
      status === "active"
        ? "Ce mandat est déjà actif : son scan signé fait foi et ne se remplace pas. Pour changer de papier, frappez un nouveau mandat."
        : `Un mandat « ${status} » ne reçoit pas de scan : seul un mandat frappé et non signé attend le sien.`,
    );
  }
}

/**
 * On a voulu activer un mandat dont le scan signé n'est pas déposé — **409**.
 *
 * Activer autorise un débit. En contestation, c'est le scan qui répond : un
 * mandat actif sans pièce est une somme remboursable sur simple demande.
 */
export class MandateUnprovenError extends BusinessError {
  constructor() {
    super(
      "payments.mandate.unproven",
      "Déposez le scan du mandat signé avant de l'activer : c'est la pièce qu'on opposera en contestation.",
    );
  }
}

/**
 * La **date de consentement** déclarée est dans le futur — **400**.
 *
 * Un mandat papier se signe avant d'être saisi. Une date à venir est une faute
 * de frappe, et c'est précisément la date qu'on opposera en contestation : mieux
 * vaut la refuser tout de suite que la découvrir devant la banque.
 */
export class MandateAcceptanceInFutureError extends DomainError {
  constructor() {
    super(
      "payments.mandate.acceptance_in_future",
      "La date de signature du mandat ne peut pas être dans le futur.",
    );
  }
}

/**
 * La société visée n'existe pas — **404**.
 *
 * Le contexte paiement ne charge pas l'agrégat société pour le savoir : il
 * demande juste de quoi identifier le débiteur chez le prestataire, et son
 * absence signifie que l'id est faux.
 */
export class CompanyNotFoundForMandateError extends ResourceNotFoundError {
  constructor(companyId: string) {
    super("payments.mandate.company_not_found", `Société ${companyId} introuvable.`);
  }
}

/**
 * La RUM est mal formée — **400**.
 *
 * Levée à la relecture d'une référence venue de la base ou d'un import : la RUM
 * que nous frappons est correcte par construction, donc une RUM invalide signale
 * une donnée abîmée, pas une saisie.
 */
export class InvalidRumError extends DomainError {
  constructor(
    readonly raw: string,
    readonly reason: string,
  ) {
    super("payments.rum.invalid", `Référence de mandat « ${raw} » : ${reason}`);
  }
}

/**
 * Le RIB d'un client refusé pour sa **forme**, pas pour sa valeur.
 *
 * 🔴 Comme `InvalidIbanError`, elle ne porte **jamais** la donnée refusée : le
 * message d'une `DomainError` repart tel quel au client via `AppErrorFilter`.
 * Elle nomme le CHAMP et la règle, ce qui suffit à corriger une saisie.
 */
export class InvalidDebtorAccountError extends DomainError {
  constructor(
    readonly field: string,
    readonly reason: string,
  ) {
    super("payments.debtor_account.invalid", `${field} : ${reason}`);
  }
}

/**
 * Le RIB vise une société qui n'existe pas.
 *
 * Levée par l'adaptateur à partir de la violation de clé étrangère, et pas par
 * une lecture préalable : une lecture « la société existe-t-elle ? » suivie
 * d'une écriture laisse une fenêtre entre les deux, et fait une requête de plus
 * sur le chemin normal pour attraper un cas qui n'arrive qu'en se trompant
 * d'URL. La base tranche déjà ; on se contente de traduire son refus en une
 * phrase que le personnel peut lire.
 */
export class CompanyNotFoundForBankAccountError extends ResourceNotFoundError {
  constructor(readonly companyId: string) {
    super(
      "payments.bank_account.company_unknown",
      `Aucune société ne porte l'identifiant « ${companyId} » : le RIB n'a pas été enregistré.`,
    );
  }
}

/**
 * Ce client n'a pas de RIB, et le **mandat à imprimer** en exige un — aperçu
 * staff, envoi par courriel, téléchargement client.
 *
 * Le message sert les trois : il nomme la société sans supposer qui lit, et le
 * geste de sortie est le même pour tous. L'écriture des zones 14/19 a sa propre
 * erreur (`MandateOptionsWithoutBankAccountError`) : son geste n'est pas
 * d'imprimer. Message réécrit le 2026-09-14 — il parlait de « prévisualiser »
 * à des appelants qui ne prévisualisaient rien.
 *
 * ⚠️ Refuser plutôt que rendre un formulaire aux zones 5 et 6 vides : ce
 * document-là existe déjà, c'est le mandat d'EXEMPLE d'une entité émettrice. En
 * rendre un second, identique mais nommé d'après un client, ferait croire qu'il
 * lui est propre — et le premier client à le signer donnerait une autorisation
 * sur un compte que personne n'a écrit.
 */
export class CompanyBankAccountNotFoundError extends ResourceNotFoundError {
  constructor(readonly companyId: string) {
    super(
      "payments.bank_account.missing",
      "Aucun RIB n'est enregistré pour cette société : enregistrez ses coordonnées bancaires avant d'afficher ou d'envoyer le mandat, qui doit nommer le compte à débiter.",
    );
  }
}

/**
 * ⚠️ `MandateWithoutBankAccountError` a vécu ici jusqu'au 2026-09-15. La frappe
 * refuse toujours sans RIB, mais par `MandateMentionsMissingError`
 * (`mint-blocker-errors.ts`), code `bank_account_missing` : le RIB y est une
 * mention parmi les autres (plan `plan-mentions-obligatoires-du-mandat.md` §9).
 */

/**
 * Le client demande un mandat alors que le sien est **déjà actif** — **409**.
 *
 * Le remplacement d'un mandat actif reste un geste du staff (plan mandat client
 * §6 #6) : il engage un changement de compte ou de papier que le client ne
 * mène pas seul. Message écrit pour le client, pas pour le back-office.
 */
export class MandateAlreadyInForceError extends BusinessError {
  constructor(readonly companyId: string) {
    super(
      "payments.mandate.already_in_force",
      "Votre mandat de prélèvement est déjà actif. Pour changer de compte ou de mandat, contactez-nous : un nouveau mandat devra être signé.",
    );
  }
}

/**
 * Aucun mandat n'attend de signature : il n'y a pas de document à rendre — **404**.
 *
 * Le PDF nominatif ne se compose QUE pour un brouillon (plan §6 #4) : la RUM
 * ne s'imprime qu'en `draft`, et recomposer le papier d'un actif produirait un
 * second exemplaire que personne n'a signé.
 */
export class MandateDocumentNotFoundError extends ResourceNotFoundError {
  constructor(readonly companyId: string) {
    super(
      "payments.mandate.document_not_found",
      "Aucun mandat n'attend de signature : générez d'abord votre mandat pour pouvoir le télécharger.",
    );
  }
}

/**
 * Le client remplace son RIB alors qu'un mandat **actif** désigne ce compte — **409**.
 *
 * Le papier signé nomme l'ancien compte : le prélèvement partirait sur une
 * autorisation qui ne le couvre pas. Le changement de banque passe par le
 * staff, qui fait signer un nouveau mandat (plan §8).
 */
export class BankAccountBoundToActiveMandateError extends BusinessError {
  constructor(readonly companyId: string) {
    super(
      "payments.bank_account.bound_to_active_mandate",
      "Votre mandat de prélèvement actif désigne ce compte : pour changer de banque, contactez-nous, un nouveau mandat devra être signé.",
    );
  }
}

/**
 * Le client réécrit les zones 14 ou 19 alors qu'un mandat **actif** les
 * imprime — **409**.
 *
 * Elles figurent sur un papier déjà signé : les changer côté serveur ferait
 * diverger ce que le débiteur a en main de ce qui part sur ses relevés. Le
 * changement de papier passe par le staff, comme le changement de banque
 * (plan §8, décidé le 2026-09-14 au §10).
 */
export class MandateOptionsBoundToActiveMandateError extends BusinessError {
  constructor(readonly companyId: string) {
    super(
      "payments.mandate_options.bound_to_active_mandate",
      "Votre mandat de prélèvement actif est signé avec ces références : pour les modifier, contactez-nous, un nouveau mandat devra être signé.",
    );
  }
}

/**
 * Le mandat en ligne n'est pas ouvert aux clients — **409**.
 *
 * Refus d'état et non d'autorisation, comme `ShopClosedError` : il ne dit rien
 * de la personne. Il tombe APRÈS le mur tenant, pour ne pas révéler à un
 * non-membre qu'une société existe (plan §7 MINEUR, ordre testé).
 */
export class CustomerMandateClosedError extends BusinessError {
  constructor() {
    super(
      "payments.mandate.customer_closed",
      "Le mandat de prélèvement en ligne n'est pas encore ouvert. Contactez-nous pour le mettre en place.",
    );
  }
}
