/**
 * Ce qui s'est **réellement** passé quand on a ouvert un accès.
 *
 * Trois issues, et non un booléen « connu / inconnu » : le cas du milieu est
 * celui qu'un booléen faisait disparaître. Quelqu'un que nous connaissons déjà
 * peut n'avoir **jamais posé de mot de passe** — l'état de tout compte
 * provisionné dont l'e-mail n'est pas parti. Le confondre avec un client
 * installé, c'est lui écrire « utilisez vos identifiants habituels » alors
 * qu'il n'en a aucun.
 *
 * Cette issue **ne sort pas du serveur**. Elle choisit quel e-mail part, et
 * c'est tout : la dire à l'écran révélerait au commercial que l'adresse qu'il
 * vient de saisir est déjà connue de la plateforme — donc que cette personne
 * travaille déjà avec un autre de nos clients.
 */
export type AccessOutcome = "identity_created" | "link_reissued" | "attached";
