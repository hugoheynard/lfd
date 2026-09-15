import type { MandateToCreate, PaymentMandate } from "./entities/payment-mandate.js";

/** L'identité de la société, telle qu'un mandat la demande. */
export interface MandateHolder {
  readonly companyName: string;
  readonly email: string;
  /**
   * La référence lisible du client — `C-9P2X4B`.
   *
   * 🔴 **Elle entre dans la RUM**, donc dans le papier signé. Elle est stable
   * par construction : dérivée une fois d'un ULID neuf à la création de la
   * société, jamais réécrite ensuite. Une référence qui bougerait périmerait
   * des mandats imprimés.
   */
  readonly reference: string;
  /**
   * Le SIREN **stocké** de la société — chaîne vide quand il n'est pas connu.
   * Le mandat interentreprises l'imprime, et sa frappe l'exige.
   *
   * ⚠️ Il était tiré du SIRET jusqu'au 2026-09-15 (`sirenOfSiret`, supprimé) :
   * le préfixe d'un SIRET n'est pas toujours un SIREN valide, et le SIREN est
   * désormais une colonne saisie (plan `plan-mentions-obligatoires-du-mandat.md`).
   */
  readonly siren: string;
}

/**
 * Port de persistance du mandat.
 *
 * Deux lectures et deux écritures, pas plus : le mandat **courant** d'une
 * société (celui qu'on montre et sur lequel on prélèvera), un mandat par son id,
 * la création et la mise à jour. Pas de `findAll` — personne n'a besoin de la
 * liste des mandats, et une méthode qu'aucun appelant ne réclame est une surface
 * à maintenir pour rien.
 */
export abstract class PaymentMandateRepository {
  /**
   * Le mandat **courant** d'une société : l'actif s'il existe, sinon le dernier
   * enregistré. `null` si la société n'en a jamais eu.
   *
   * Rendre le dernier révoqué plutôt que `null` est délibéré : une fiche doit
   * pouvoir dire « mandat révoqué le 3 mars », pas « aucun mandat » — ce qui
   * ferait croire qu'on n'a jamais rien signé avec ce client.
   */
  abstract findCurrent(companyId: string): Promise<PaymentMandate | null>;

  /** Un mandat par son id, ou `null`. */
  abstract findById(mandateId: string): Promise<PaymentMandate | null>;

  /**
   * Le **brouillon** en cours de cette société, ou `null`.
   *
   * Distinct de `findCurrent`, et la distinction est le sujet : `findCurrent`
   * rend l'actif d'abord, donc ne saurait pas dire qu'un brouillon coexiste. Or
   * c'est exactement la question que la frappe pose — « y en a-t-il déjà un ? »
   * — en rotation bancaire, quand un mandat actif est toujours en vigueur.
   *
   * Sans elle, la seule garde serait l'index d'unicité, qui refuse par une
   * violation de contrainte remontée en 500 : un refus illisible pour quelqu'un
   * qui n'a pas le code sous les yeux.
   */
  abstract findDraft(companyId: string): Promise<PaymentMandate | null>;

  /**
   * Le mandat **auquel un scan qui revient appartient** : le brouillon s'il y en
   * a un, l'actif sinon.
   *
   * ⚠️ Le DÉPÔT du scan ne passe plus par ici depuis le 2026-09-14 : il vise
   * `findDraft` seul, parce qu'un actif ne reçoit plus de pièce. Seul appelant
   * restant, vérifié ce jour-là : le rendu du mandat client
   * (`customer-mandate-support.ts`), qui décide du filigrane.
   *
   * 🔴 Nommée plutôt que déduite de `findCurrent`, et c'est tout l'objet de sa
   * présence. `findCurrent` répond « que montrer », donc rend l'ACTIF d'abord :
   * en rotation bancaire — un actif en vigueur pendant qu'on fait signer son
   * remplaçant — elle aurait fait agrafer le scan du mandat NEUF sur l'ANCIEN.
   * La pièce produite en contestation n'aurait alors pas porté la RUM opposée.
   *
   * L'ordre est l'inverse de `findCurrent`, et il se lit dans le geste : un
   * papier qui revient signé est celui qu'on vient d'envoyer.
   */
  abstract findAwaitingProof(companyId: string): Promise<PaymentMandate | null>;

  /** Écrit un mandat neuf et rend son id. */
  abstract create(mandate: MandateToCreate): Promise<string>;

  /**
   * Réécrit un mandat existant — statut, dates, compte reconnu. **Jamais sa
   * pièce** : elle ne s'écrit que par {@link depositProof}.
   *
   * 🔴 Conditionnée à la pièce CHARGÉE (depuis le 2026-09-15) : si un dépôt est
   * passé entre la lecture et l'écriture, rien n'est écrit. Sans cette
   * condition, une signature concurrente d'un redépôt activait le mandat sur
   * un scan que personne n'avait relu (plan `plan-restes-du-mandat.md` §7 #3, #9).
   *
   * @throws {MandateProofChangedError} la pièce a changé depuis la lecture.
   */
  abstract save(mandate: PaymentMandate): Promise<void>;

  /**
   * Écrit la pièce que le brouillon vient de recevoir — **seulement si** le
   * mandat est encore un brouillon et porte toujours `previousProofKey`
   * (`null` = aucune pièce).
   *
   * Une écriture ciblée, et elle est justifiée : l'invariant « un scan ne se
   * dépose que sur un brouillon » est déjà vérifié par l'agrégat en mémoire ;
   * ce qui manque est de le tenir **au moment de l'écriture**. Un
   * `load`→`save` ne le peut pas : entre les deux, une signature peut passer,
   * et la purge de l'ancienne clé détruirait alors la preuve du mandat activé
   * (plan `plan-restes-du-mandat.md` §7 #3).
   *
   * @throws {MandateProofChangedError} zéro ligne écrite : la pièce a changé,
   *   ou le mandat n'est plus un brouillon.
   */
  abstract depositProof(mandate: PaymentMandate, previousProofKey: string | null): Promise<void>;

  /**
   * L'identité de la société pour le prestataire, ou `null` si l'id est inconnu.
   *
   * Ici plutôt que par un import du contexte `account` : le paiement n'a besoin
   * que de quelques chaînes, et dépendre de tout l'agrégat société pour les obtenir
   * couplerait deux contextes pour rien (ISP).
   */
  abstract findHolder(companyId: string): Promise<MandateHolder | null>;

  /**
   * L'id du client Stripe déjà utilisé pour cette société, tous mandats
   * confondus — un client par société, pas par autorisation. `null` si aucun.
   */
  abstract findStripeCustomerId(companyId: string): Promise<string | null>;
}
