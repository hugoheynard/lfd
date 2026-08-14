import { z } from "zod";

/**
 * Les **pièces du dossier d'activation** d'un compte client.
 *
 * Ce fichier portait aussi la *configuration* de ces pièces — un mode
 * (`hidden` / `optional` / `required`) par pièce, réglable par le staff depuis
 * Réglages → Activation client. Elle a été **supprimée** : le parcours
 * d'ouverture est arrêté, et un parcours arrêté ne se reconfigure pas depuis un
 * écran. Une case cochée un mardi soir redéfinissait « client » pour toute la
 * plateforme, sans revue, sans test et sans trace.
 *
 * Ce qui bloque désormais est écrit en dur dans `activationGate` (backend), la
 * seule autorité. Il ne reste ici que le **vocabulaire** : le nom des pièces,
 * partagé par le serveur et les deux fronts.
 */

/**
 * Les pièces d'un dossier. `paymentTerm` n'en est pas une (elle a toujours une
 * valeur) ; `delivery` n'est plus demandée tant que le service n'existe pas,
 * mais son nom reste — c'est un vocabulaire, pas une liste d'exigences.
 */
export const activationPieceSchema = z.enum(["tva", "kbis", "billing", "delivery"]);
export type ActivationPiece = z.infer<typeof activationPieceSchema>;
