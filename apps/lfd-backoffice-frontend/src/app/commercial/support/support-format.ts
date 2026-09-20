import type { SupportRequestView } from '@lfd/contracts';

/**
 * Mise en forme d'une **demande de contact** pour la file du commercial.
 *
 * Pur et testé : ce sont trois règles qu'on croit évidentes et qu'on écrit de
 * travers — l'urgence d'un « au plus vite », la disponibilité d'un créneau daté,
 * et l'âge d'une demande qui attend depuis avant-hier.
 */

/** Les demi-journées, telles qu'on les dit. */
const SLOT_LABEL: Record<string, string> = { morning: 'matin', afternoon: 'après-midi' };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Au-delà, la demande n'est plus « en attente » : elle est en retard. */
export const LATE_AFTER_HOURS = 24;

/**
 * Comment le client veut être joint, en une ligne : « Rappel au plus vite »,
 * « Rappel mardi matin », « Réponse par e-mail ».
 */
export function availabilityLabel(request: SupportRequestView): string {
  if (request.channel === 'email') {
    return 'Réponse par e-mail';
  }
  if (request.asap) {
    return 'Rappel au plus vite';
  }
  const day = request.scheduledDate === null ? '' : formatDay(request.scheduledDate);
  const slot = request.slot === null ? '' : (SLOT_LABEL[request.slot] ?? request.slot);
  const when = [day, slot].filter((part) => part !== '').join(' ');
  return when === '' ? 'Rappel à programmer' : `Rappel ${when}`;
}

/** `2026-08-12` → `mardi 12 août`. Jour ancré à midi UTC : aucun glissement. */
export function formatDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/** Depuis combien de temps ça attend : « à l'instant », « 3 h », « 2 j ». */
export function waitingLabel(createdAt: string, now: Date = new Date()): string {
  const elapsed = now.getTime() - new Date(createdAt).getTime();
  if (elapsed < 60 * 60 * 1000) {
    const minutes = Math.max(0, Math.floor(elapsed / 60_000));
    return minutes < 5 ? "à l'instant" : `${minutes} min`;
  }
  const hours = Math.floor(elapsed / (60 * 60 * 1000));
  return hours < 24 ? `${hours} h` : `${Math.floor(elapsed / DAY_MS)} j`;
}

/**
 * La demande a-t-elle **trop attendu** ? Un « au plus vite » posé hier n'est plus
 * une demande en attente, c'est une promesse en train d'être rompue — et c'est
 * la seule chose que la file doit crier.
 */
export function isLate(request: SupportRequestView, now: Date = new Date()): boolean {
  const elapsedHours = (now.getTime() - new Date(request.createdAt).getTime()) / (60 * 60 * 1000);
  return elapsedHours >= LATE_AFTER_HOURS;
}
