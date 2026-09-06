import type { PickupSlot } from '@lfd/contracts';

/**
 * ⚠️ **Les heures de livraison n'ont AUCUNE source.** Celles-ci sont déclarées
 * ici, en dur, et elles n'affirment rien de vrai.
 *
 * C'est une dette **assumée et bornée**, pas un oubli. Le retrait, lui, n'en a
 * plus : un point de retrait déclare ses heures (`opening`), la grille s'en
 * déduit (`pickupSlots`) et la maquette a disparu. La livraison ne peut pas
 * suivre le même chemin aujourd'hui — la fenêtre où le coursier passe appartient
 * à la **tournée**, et la tournée de livraison n'est pas construite ; la zone de
 * livraison ne porte qu'un secteur de codes postaux et un frais.
 *
 * 🔴 **Ce qui a été RETIRÉ ici, malgré l'absence de source** : les états.
 * « complet » affirmait une capacité que rien ne mesure, « sortie du four » une
 * heure d'enfournement que rien ne déclare. Un horaire approximatif se corrige ;
 * un « complet » faux fait renoncer un client à une heure qui était libre.
 *
 * Ce fichier meurt le jour où une tournée déclare ses fenêtres. Tant qu'il vit,
 * il dit ce qu'il est.
 */
export const DELIVERY_SLOTS: readonly PickupSlot[] = [
  { id: '07:00-08:00', start: '07:00', end: '08:00', access: 'public' },
  { id: '08:00-09:00', start: '08:00', end: '09:00', access: 'public' },
  { id: '09:00-10:00', start: '09:00', end: '10:00', access: 'public' },
  { id: '10:00-11:00', start: '10:00', end: '11:00', access: 'public' },
  { id: '16:00-17:00', start: '16:00', end: '17:00', access: 'public' },
  { id: '17:00-18:00', start: '17:00', end: '18:00', access: 'public' },
  { id: '18:00-19:00', start: '18:00', end: '19:00', access: 'public' },
];
