/**
 * **Pour qui l'on demande**, vu du planificateur : la société de l'espace,
 * vérifiée par le serveur (`@ActingCompany`) et dont la personne est membre
 * actuel. Jamais une adresse : le planificateur s'ouvre à un client, pas à
 * une personne (`documentation/b2b/plan-exemption-par-societe.md`, § 2).
 */
export interface PlannerCaller {
  readonly companyId: string;
}

/**
 * **« Le planificateur est-il ouvert à cette société ? »** — la clé
 * `orderPlanner` de l'accès aux fonctionnalités, après exemption de la
 * société à l'identique (exempter un principal n'ouvre pas ses sites).
 * Déclaré par le planificateur, implémenté par le commerce, qui tient le
 * catalogue.
 *
 * Un booléen et rien d'autre (ISP) : le bloc n'a à connaître ni les niveaux,
 * ni les dérogations, ni la liste d'exemption. Seules les routes du client le
 * demandent ; le balayage ne le demande pas, une case déjà remplie se convertit
 * même fermé.
 */
export abstract class PlannerAccess {
  abstract isOpenFor(caller: PlannerCaller): Promise<boolean>;
}
