import type { NotifyService } from '../notify.service';

/**
 * Pose une URL de paiement dans le presse-papiers. Quand le navigateur refuse
 * (contexte non sécurisé, permission), l'URL est affichée pour être copiée à la
 * main plutôt que perdue — le même repli que les liens d'accès.
 */
export async function copyLink(url: string, notify: NotifyService): Promise<void> {
  try {
    await navigator.clipboard.writeText(url);
    notify.success('Lien copié.');
  } catch {
    notify.success(`Lien à copier : ${url}`);
  }
}
