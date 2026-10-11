import { z } from "zod";

import type { MediaFactsView } from "./media.js";
import type { LocalizedText } from "./shared.js";

/*
 * **Les formes d'un visuel ATTACHÉ** — ce qu'un porteur (fiche, famille) lit
 * et renvoie de son emploi d'une image. Sorties de `media.ts` le 2026-10-11 :
 * celui-ci décrit le FONDS, ce fichier décrit l'EMPLOI, et les deux ne
 * changent pas pour les mêmes raisons.
 */

/** Un visuel attaché, tel qu'un écran le lit et le renvoie. */
export interface AttachedMediaView extends MediaFactsView {
  /** `hero`, `gallery`, `lifestyle`, `thumbnail`, `print`. */
  readonly role: string;
  readonly url: string;
  /**
   * L'étiquette de la bibliothèque — courte, non traduite, faite pour
   * RETROUVER. Distincte du texte alternatif, qui DÉCRIT l'image à qui ne la
   * voit pas : deux informations, deux publics. `''` = pas nommé.
   */
  readonly name: string;
  /** Le SEUL champ d'image qui se traduit — accessibilité ET référencement. */
  readonly alt: LocalizedText;
}

/**
 * Un visuel tel qu'un écran l'ENVOIE : **le rôle et l'adresse**.
 *
 * 🔴 Plus d'étiquette ni d'alternative depuis le 2026-09-23 — elles décrivent
 * l'image, qui est partagée, et se saisissent dans la médiathèque. Les
 * envoyer d'ici faisait écrire la bibliothèque à chaque enregistrement de
 * fiche, et corriger l'une changeait silencieusement ce que l'autre affichait.
 */
export const mediaItemPayloadSchema = z.object({
  role: z.string().min(1),
  url: z.string().min(1),
});

/**
 * La liste ENTIÈRE des visuels, dans son ordre. Un remplacement et non un
 * ajout : l'écran envoie ce qu'il affiche, et l'ordre affiché EST l'ordre.
 */
export const setMediaPayloadSchema = z.object({
  media: z.array(mediaItemPayloadSchema),
});
export type SetMediaPayload = z.infer<typeof setMediaPayloadSchema>;
