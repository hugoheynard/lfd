import type { FoldCalendarEvent, FoldCalendarSource, FoldCalendarTone } from 'fold-ng';
import type { AppointmentStatus, AppointmentView } from '@lfd/contracts';

/**
 * Projection **pure** des rendez-vous sur le calendrier d'acquisition.
 *
 * Différence de nature avec les bandes d'inscription/attente : un rendez-vous est
 * **daté et horodaté**. Il porte donc `startTime`/`endTime`, ce qui le place sur
 * la grille horaire des vues semaine et jour — là où une bande d'attente reste
 * une plage de journées.
 *
 * Les heures locales viennent **du serveur** (`day`, `time`, `endTime` de
 * `AppointmentView`) : le front ne refait aucune conversion de fuseau, sinon le
 * SSR et le navigateur pourraient afficher deux heures différentes.
 */

/** La donnée métier promenée sur chaque événement de rendez-vous. */
export type AppointmentEvent = FoldCalendarEvent<AppointmentView>;

/** Le flux « rendez-vous », à ajouter aux chips de filtrage. */
export const APPOINTMENT_SOURCE: FoldCalendarSource = {
  key: 'rdv',
  label: 'Rendez-vous',
  tone: 'neutral',
};

/** Ton et libellé de chaque état — la file se lit à la couleur. */
const PRESENTATION: Record<AppointmentStatus, { tone: FoldCalendarTone; label: string }> = {
  requested: { tone: 'warning', label: 'À confirmer' },
  confirmed: { tone: 'neutral', label: 'Confirmé' },
  honored: { tone: 'success', label: 'Honoré' },
  no_show: { tone: 'alert', label: 'Absent' },
  cancelled: { tone: 'muted', label: 'Annulé' },
};

/** Libellé du canal, pour la seconde ligne de la puce. */
const CHANNEL_LABEL: Record<string, string> = {
  phone: 'Téléphone',
  visio: 'Visio',
  onsite: 'Sur place',
};

/**
 * Le nom affiché : celui qu'a donné le contact, sinon son e-mail, sinon
 * l'identifiant du sujet — on préfère un identifiant brut à une puce anonyme.
 */
function labelOf(appointment: AppointmentView): string {
  const name = appointment.contactName.trim();
  if (name !== '') {
    return name;
  }
  return appointment.contactEmail.trim() === '' ? appointment.subjectId : appointment.contactEmail;
}

/** Un rendez-vous, posé à son heure réelle. */
function toEvent(appointment: AppointmentView): AppointmentEvent {
  const presentation = PRESENTATION[appointment.status];
  const channel = CHANNEL_LABEL[appointment.channel] ?? appointment.channel;
  return {
    id: `appt:${appointment.id}`,
    start: appointment.day,
    end: appointment.day,
    startTime: appointment.time,
    endTime: appointment.endTime,
    label: labelOf(appointment),
    subline: `${presentation.label} · ${channel}`,
    tone: presentation.tone,
    sourceKey: APPOINTMENT_SOURCE.key,
    data: appointment,
  };
}

/**
 * Les événements de rendez-vous. Les **annulés sont exclus par défaut** : la file
 * du commercial montre ce qu'il a à faire, pas ce qui a été décommandé. Ils
 * restent affichables à la demande, parce qu'un créneau qui s'est libéré est une
 * information — mais ce n'est pas celle qu'on met en avant.
 */
export function buildAppointmentEvents(
  appointments: readonly AppointmentView[],
  options: { readonly includeCancelled?: boolean } = {},
): readonly AppointmentEvent[] {
  const includeCancelled = options.includeCancelled ?? false;
  return appointments
    .filter((appointment) => includeCancelled || appointment.status !== 'cancelled')
    .map(toEvent);
}
