/**
 * Le vocabulaire de l'**ouverture d'une identité de connexion**, commun au
 * client et au membre de l'équipe.
 *
 * Il vit dans `shared/` et non dans un domaine parce qu'il en a **deux** — et
 * qu'aucun des deux ne doit dépendre de l'autre. Un contexte staff qui
 * importerait le port client hériterait de tout son domaine ; l'écrire deux fois
 * ferait deux formes qui se ressemblent jusqu'au jour où elles divergent.
 *
 * Ce n'est ni de l'infrastructure ni du domaine : c'est une **forme**. Aucune
 * mention d'Auth0, de ticket ou de connexion n'y figure — ces mots-là
 * appartiennent aux adaptateurs.
 */

/** Qui provisionner : le strict nécessaire pour ouvrir une identité. */
export interface IdentityToProvision {
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
}

/** Une identité de connexion, et par où son détenteur pose son mot de passe. */
export interface ProvisionedIdentity {
  /** Le `sub` du fournisseur — notre clé de jointure vers la personne. */
  readonly subject: string;
  /**
   * L'URL, à durée de vie limitée, où la personne **choisit** son mot de passe.
   *
   * Elle vaut prise de contrôle du compte. Sa seule destination légitime est un
   * e-mail adressé à la personne elle-même : ni journal, ni réponse HTTP, ni
   * écran du staff — qui lit ce lien devient cette personne.
   */
  readonly passwordSetupUrl: string;
}
