import { TechnicalError } from "./app-error.js";

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
  constructor(reason: string, cause?: unknown) {
    super("identity_provider.unavailable", reason, cause);
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
  constructor(readonly subject: string) {
    super(
      "identity_provider.subject_unknown",
      `Le fournisseur d'identité ne connaît pas « ${subject} ».`,
    );
  }
}
