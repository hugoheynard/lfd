/**
 * Le droit d'**oublier ce qu'on croyait savoir** d'un accès staff.
 *
 * La résolution d'accès garde un cache court par `sub` : il évite que chaque
 * clic relise l'annuaire. Le prix, c'est une fenêtre pendant laquelle une
 * décision prise dans le back-office n'a pas encore d'effet — jusqu'à trente
 * secondes entre « je suspends quelqu'un » et « il ne peut plus rien ».
 *
 * Trente secondes de trop, le jour où on suspend dans l'urgence. Ce port permet
 * donc à l'annuaire de dire « c'est périmé » au moment exact où il change,
 * plutôt que d'attendre l'expiration.
 *
 * **Un port, et pas un appel direct au resolver** : l'annuaire n'a aucune raison
 * de connaître le cache d'un service d'authentification, ni sa durée de vie, ni
 * sa clé. Il sait seulement qu'un accès qu'il vient de modifier ne doit plus
 * être servi de mémoire.
 */
export abstract class StaffAccessCache {
  /**
   * Oublie **tout**, pas seulement la personne modifiée.
   *
   * Vider entièrement paraît grossier ; c'est délibéré. Un changement de rôle
   * ou de dérogation ne concerne qu'une personne, mais rien ne garantit que ce
   * sera toujours vrai — une future notion d'équipe ou de délégation ferait
   * qu'une mutation en affecte plusieurs, et l'oubli ciblé deviendrait faux en
   * silence.
   *
   * Le coût est nul à cette échelle : l'annuaire tient dans une poignée de
   * lignes, et une mutation y est rare. On échange une micro-optimisation contre
   * une classe entière de bugs d'invalidation.
   */
  abstract forgetAll(): void;
}
