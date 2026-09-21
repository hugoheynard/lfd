import type { LocaleCode } from '../../client-locale.service';

/**
 * 🔴 **DES FAITS INVENTÉS. Aucune de ces quatre lignes n'est vraie.**
 *
 * ## Pourquoi elles existent
 *
 * La maquette du 2026-09-20 dessine un panneau de notifications dans la barre
 * du client, et Hugo a tranché qu'on le construise (SPEC §7). Mais **il n'y a
 * pas de fil client côté serveur** : ni route, ni modèle, ni table — et le seul
 * écran qui pose une cloche met d'ailleurs son compteur à zéro
 * (`commande-page.ts`). Le contrat générique que le back-office utilise
 * (`packages/contracts/src/staff-notification.ts`) s'adresse au STAFF ; le
 * réemployer tel quel côté client aurait inventé une frontière au lieu d'une
 * maquette.
 *
 * Un panneau vide n'aurait rien montré de la grammaire qu'on est en train de
 * poser — le liséré de la non-lue, le compte de la bande de tête, le geste
 * « tout marquer comme lu ». Ces lignes sont donc là pour que la FORME se voie
 * et se relise, pas pour informer qui que ce soit.
 *
 * ## Le seul point à rebrancher
 *
 * `NotificationsMenu` lit ce fichier en **une ligne** — la seule occurrence de
 * `NOTIFICATIONS_DEMO` dans le composant. Le jour où le fil existe, cette ligne
 * devient une lecture de service, ce fichier disparaît, et rien d'autre ne
 * bouge : l'état « lu » est déjà porté par un signal du composant, prêt à
 * devenir un appel.
 *
 * Ce qui reste à spécifier côté serveur avant ça, et que cette maquette ne
 * tranche pas : la source des événements client, la persistance du « lu », et
 * la profondeur du fil.
 *
 * ## Pourquoi les trois langues sont ICI
 *
 * Ce ne sont pas des libellés d'interface — ce sont des DONNÉES. Les mettre au
 * dictionnaire mêlerait ce que dit l'app à ce qu'elle affiche, et laisserait
 * derrière, à la suppression, quatre entrées de copie que personne n'oserait
 * retirer. Le vrai fil rendra du texte du serveur, pas de la copie ; la
 * maquette imite donc le vrai fil, pas le dictionnaire.
 */

/** Une ligne de démonstration, dans une langue. */
export interface DemoNotificationText {
  readonly subject: string;
  /** Une seule ligne, comme le contrat du back-office. */
  readonly body: string;
  /**
   * L'ancienneté telle qu'elle se LIT.
   *
   * Un mot et jamais une date : une fixture qui écrirait un jour du calendrier
   * serait vraie deux semaines puis fausse, sans qu'une ligne de code ait bougé.
   */
  readonly when: string;
}

/** Une ligne de démonstration, dans les trois langues. */
export interface DemoNotification {
  readonly id: string;
  readonly read: boolean;
  readonly text: Readonly<Record<LocaleCode, DemoNotificationText>>;
}

export const NOTIFICATIONS_DEMO: readonly DemoNotification[] = [
  {
    id: 'demo-order-ready',
    read: false,
    text: {
      fr: {
        subject: 'Commande #4821 prête',
        body: 'Le mardi du Chalet vous attend au Labo, comptoir de gauche.',
        when: 'il y a 12 min',
      },
      en: {
        subject: 'Order #4821 is ready',
        body: 'Your Tuesday order is waiting at Le Labo, left counter.',
        when: '12 min ago',
      },
      it: {
        subject: 'Ordine #4821 pronto',
        body: 'Il suo ordine del martedì la aspetta al Labo, bancone di sinistra.',
        when: '12 min fa',
      },
    },
  },
  {
    id: 'demo-slot-confirmed',
    read: false,
    text: {
      fr: {
        subject: 'Créneau de 7 h 15 confirmé',
        body: 'Votre retrait de demain est calé sur la première fournée.',
        when: 'il y a 2 h',
      },
      en: {
        subject: '7:15 slot confirmed',
        body: 'Tomorrow’s collection is set for the first bake.',
        when: '2 h ago',
      },
      it: {
        subject: 'Fascia delle 7:15 confermata',
        body: 'Il ritiro di domani è fissato sulla prima infornata.',
        when: '2 h fa',
      },
    },
  },
  {
    id: 'demo-invoice',
    read: true,
    text: {
      fr: {
        subject: 'Facture de mars disponible',
        body: '486,20 € · échéance le 15 avril.',
        when: 'hier',
      },
      en: {
        subject: 'March invoice available',
        body: '€486.20 · due on 15 April.',
        when: 'yesterday',
      },
      it: {
        subject: 'Fattura di marzo disponibile',
        body: '486,20 € · scadenza il 15 aprile.',
        when: 'ieri',
      },
    },
  },
  {
    id: 'demo-christmas',
    read: true,
    text: {
      fr: {
        subject: 'Noël au fournil, les réservations sont ouvertes',
        body: 'Bûches et pains de fête à réserver jusqu’au 18 décembre.',
        when: 'lundi',
      },
      en: {
        subject: 'Christmas at the bakery — booking is open',
        body: 'Yule logs and festive breads to reserve until 18 December.',
        when: 'Monday',
      },
      it: {
        subject: 'Natale al laboratorio, prenotazioni aperte',
        body: 'Tronchetti e pani delle feste da prenotare entro il 18 dicembre.',
        when: 'lunedì',
      },
    },
  },
];
