/**
 * **Qui demande**, vu du planificateur : son adresse et le fait qu'elle soit
 * prouvée — les deux seuls champs dont une exemption a besoin. Recopiés du
 * `Principal` par le contrôleur, jamais devinés.
 */
export interface PlannerCaller {
  readonly email: string;
  readonly emailProven: boolean;
}

/**
 * **« Le planificateur est-il ouvert à cette personne ? »** — la clé
 * `orderPlanner` de l'accès aux fonctionnalités, après exemption. Déclaré par
 * le planificateur, implémenté par le commerce, qui tient le catalogue.
 *
 * Un booléen et rien d'autre (ISP) : le bloc n'a à connaître ni les niveaux,
 * ni les dérogations, ni la liste d'exemption. Seules les routes du client le
 * demandent ; le balayage ne le demande pas, une case déjà remplie se convertit
 * même fermé.
 */
export abstract class PlannerAccess {
  abstract isOpenFor(caller: PlannerCaller): Promise<boolean>;
}
