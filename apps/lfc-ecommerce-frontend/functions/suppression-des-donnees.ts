/**
 * **Pages Function `GET /suppression-des-donnees`** — l'adresse donnée à Meta
 * comme « URL d'instructions de suppression des données ».
 *
 * Meta refuse `…/confidentialite#suppression-des-donnees` (« should represent
 * a valid URL », 2026-10-05) : son contrôle n'accepte pas le fragment. Cette
 * adresse sans `#` sert la MÊME page que `/confidentialite` — la politique
 * entière, dont la section requise de suppression — en 200, lisible sans
 * JavaScript. Pas de redirection : un robot qui ne la suivrait pas lirait une
 * page vide.
 */
export { onRequestGet } from './confidentialite';
