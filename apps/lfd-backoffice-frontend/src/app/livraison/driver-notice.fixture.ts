import type { DriverNoticeView, MyDriverNoticeView } from '@lfd/contracts';

/** Un texte d'information, réduit à ce que les specs lisent. */
export function driverNoticeOf(version = 1): DriverNoticeView {
  return {
    version,
    title: 'Vos données de livreur',
    intro: 'Avant de démarrer, voici ce que l’application enregistre.',
    sections: [
      { heading: 'Ce qui est enregistré sur vous', lines: ['L’heure de départ.', 'Les bacs.'] },
      { heading: 'Combien de temps', lines: ['Durée en cours de définition.'] },
    ],
  };
}

export function myNoticeOf(version = 1, acknowledgedAt: string | null = null): MyDriverNoticeView {
  return { notice: driverNoticeOf(version), acknowledgedAt };
}
