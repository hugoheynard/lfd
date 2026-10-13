import type { Site } from "../domain/site.js";
import type { SiteRepository } from "../domain/site.repository.js";

/**
 * **Désigne `target` comme site par défaut**, en démettant l'ancien.
 *
 * « Un seul défaut » regarde l'ensemble des sites : aucun agrégat ne le voit
 * seul. Le geste se fait donc à deux — l'ancien cède son rang, le nouveau le
 * prend, chacun par sa méthode — dans l'unité de travail de l'appelant.
 * L'ancien est écrit d'abord : à aucun moment deux lignes ne sont à `true`.
 *
 * @throws {ArchivedSiteError} `target` est archivé.
 * @throws {DefaultSiteMustHandOverError} `target` ne remet pas.
 */
export async function designateDefault(sites: SiteRepository, target: Site): Promise<void> {
  target.makeDefault();
  const current = await sites.loadDefault();
  if (current !== null && current.id !== target.id) {
    current.relinquishDefault();
    await sites.save(current);
  }
  await sites.save(target);
}
