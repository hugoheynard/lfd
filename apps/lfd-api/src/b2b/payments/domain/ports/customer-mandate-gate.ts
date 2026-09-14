/**
 * Port de **lecture** du drapeau `customerMandate` : le mandat en ligne est-il
 * ouvert aux clients ?
 *
 * Un booléen et rien d'autre (ISP) : les handlers du mandat n'ont à connaître ni
 * le catalogue des fonctionnalités, ni ses niveaux, ni ses exemptions. C'est
 * l'adaptateur qui sait que « ouvert » s'écrit `open` et qu'aucune adresse ne
 * l'ouvre à elle seule.
 *
 * Contrôlé DANS les handlers, après le mur tenant, plutôt que par une garde
 * HTTP (plan `documentation/b2b/plan-mandat-client.md` §8) : un non-membre
 * reçoit son 404 avant d'apprendre quoi que ce soit de l'état du drapeau.
 */
export abstract class CustomerMandateGate {
  abstract isOpen(): Promise<boolean>;
}
