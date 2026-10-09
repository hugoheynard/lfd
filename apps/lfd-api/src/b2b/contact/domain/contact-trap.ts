/**
 * **Le formulaire a-t-il été rempli par un robot ?** (`demandes-clients.md`,
 * §2.2 et §5.2.) Le champ piège `lfd_trap` est invisible à l'écran : un
 * humain le laisse vide.
 *
 * Plus de délai minimal depuis la revue du 2026-10-09 : déclaré par le client,
 * il n'arrêtait aucun robot et perdait le message d'un humain rapide (un
 * client connecté, pré-rempli). C'est le débit par IP qui borne le reste.
 */
export function trapIsFilled(trap: string): boolean {
  return trap.trim() !== "";
}
