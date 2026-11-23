import type { ExportReaderKeyView } from '@lfd/contracts';

/** Ce que l'écran dit d'une clé : elle ouvre l'export, ou plus. */
export interface ExportKeyState {
  readonly label: string;
  readonly tone: 'success' | 'neutral' | 'alert';
  /** Révoquer a encore un sens : ni révoquée, ni expirée. */
  readonly revocable: boolean;
}

const DATE = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** Une date ISO lue à Paris, en toutes lettres. */
export function exportKeyDate(iso: string): string {
  return DATE.format(new Date(iso));
}

/** Les adresses admises, ou « toute adresse » quand la liste est vide. */
export function exportKeyIps(key: ExportReaderKeyView): string {
  return key.allowedIps.length === 0 ? 'Toute adresse' : key.allowedIps.join(', ');
}

/** La révocation l'emporte sur l'échéance : c'est un geste, l'autre est un terme. */
export function exportKeyState(key: ExportReaderKeyView, now: Date): ExportKeyState {
  if (key.revokedAt !== null) {
    return {
      label: `Révoquée le ${exportKeyDate(key.revokedAt)}`,
      tone: 'alert',
      revocable: false,
    };
  }
  if (new Date(key.expiresAt).getTime() <= now.getTime()) {
    return { label: 'Expirée', tone: 'neutral', revocable: false };
  }
  return { label: 'Active', tone: 'success', revocable: true };
}
