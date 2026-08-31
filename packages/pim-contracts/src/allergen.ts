/**
 * Contrat de fil du **référentiel allergènes** — la liste servie à la saisie
 * (`GET /reference/allergens`) et l'administration du référentiel lui-même.
 *
 * La partie lecture reste des vues plain, sans schéma zod : rien n'entre par ce
 * chemin-là. Les payloads d'écriture, eux, sont validés — le référentiel est
 * devenu administrable, et un corps qui n'a pas la bonne forme doit être refusé
 * à la frontière plutôt qu'au fond d'un agrégat.
 *
 * ⚠️ Les schémas valident la **forme**, pas la règle : la graphie d'une clé ou
 * d'un code, la présence de la langue source dans un libellé et le refus d'une
 * catégorie officielle sont tenus par le domaine, sur TOUS les chemins d'entrée.
 * Les redire ici en ferait deux sources de vérité, dont une que personne ne
 * penserait à corriger.
 *
 * Il vit ici parce que la même forme était déclarée deux fois — une dans le
 * domaine, une dans les modèles du front — pour une donnée réglementée. La
 * LISTE a cessé d'être recopiée quand le front s'est branché sur l'endpoint ;
 * sa forme restait, elle, à tenir d'accord à la main.
 */
import { z } from "zod";

import { localizedTextSchema } from "./localized.js";
import type { LocalizedText } from "./shared.js";

/** Une identité de référentiel telle qu'elle arrive sur le fil — le domaine en juge la graphie. */
const referenceIdentitySchema = z.string().trim().min(1).max(48);

/** Un rang d'affichage : un entier positif, parce que c'est un ordre et pas une mesure. */
const positionSchema = z.number().int().min(0);

/**
 * Quel catalogue : `eu` est la liste **légale** (annexe II du règlement UE
 * 1169/2011), `world` la liste **interopérable**, codes sans obligation UE
 * compris. Ce n'est pas un filtre d'affichage anodin.
 */
export type AllergenScope = "eu" | "world";

/** Une entrée du référentiel : un code GS1, ce qu'il nomme, ce qu'il déclare. */
export interface AllergenEntry {
  /** Code de stockage canonique — GS1 `AllergenTypeCode` (T4078). */
  readonly code: string;
  /** Libellé granulaire — « Noisettes ». */
  readonly label: string;
  /** Catégorie réglementaire, `null` hors obligation UE. */
  readonly incoCategory: string | null;
  /** Libellé **d'étiquette** — « Fruits à coque ». C'est lui qui fait foi. */
  readonly incoLabel: string | null;
}

/** Le référentiel tel que l'API le rend, pour un catalogue donné. */
export interface AllergenReference {
  readonly scope: AllergenScope;
  readonly entries: readonly AllergenEntry[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * L'ADMINISTRATION du référentiel — écrans staff, pas fiche produit.
 *
 * Ce qui précède sert la SAISIE : ce qu'on a le droit de cocher, aplati dans
 * une langue, sans rien de ce qui n'est plus proposé. Ce qui suit sert la
 * GESTION : le référentiel entier, ses libellés dans toutes leurs langues, et
 * l'archivage — qu'il faut voir pour pouvoir le défaire.
 *
 * Deux formes plutôt qu'une élargie, parce que ce sont deux questions
 * différentes (D2 bis) : « qu'est-ce que je peux cocher » et « qu'est-ce que le
 * référentiel contient ». Une forme unique obligerait la fiche produit à
 * connaître `archivedAt` pour l'ignorer, et rendrait le filtre reproductible —
 * donc oubliable — chez chaque lecteur.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Une entrée telle que l'écran d'administration la lit — archivage compris. */
export interface AllergenEntryAdminView {
  readonly id: string;
  readonly code: string;
  /** Libellé granulaire, dans toutes ses langues : l'écran les édite. */
  readonly name: LocalizedText;
  /** Semée et verrouillée : l'écran l'affiche sous cadenas, avec sa raison. */
  readonly official: boolean;
  /** Date ISO ou `null` — retirée de ce qu'on PROPOSE, jamais de ce qu'on reconnaît. */
  readonly archivedAt: string | null;
}

/** Une catégorie et ce qu'elle accueille, d'un bloc — le mapping est n:1. */
export interface AllergenCategoryAdminView {
  readonly id: string;
  readonly key: string;
  readonly name: LocalizedText;
  /** `null` = hors annexe II, donc jamais dans une projection INCO. */
  readonly incoCategory: string | null;
  readonly official: boolean;
  readonly position: number;
  readonly archivedAt: string | null;
  readonly entries: readonly AllergenEntryAdminView[];
}

/**
 * Ouvrir une catégorie **maison**.
 *
 * Ni `official` ni `incoCategory` : l'annexe II ne s'étend pas depuis le
 * back-office, et l'absence de champ le dit mieux qu'une validation.
 */
export const createAllergenCategoryPayloadSchema = z.object({
  /** Identité stable — minuscules, chiffres, tirets ou soulignés. */
  key: referenceIdentitySchema,
  name: localizedTextSchema,
  /** Rang d'affichage. Sans portée réglementaire, donc libre même sur l'officiel. */
  position: positionSchema.optional(),
});
export type CreateAllergenCategoryPayload = z.infer<typeof createAllergenCategoryPayloadSchema>;

/** Renommer une catégorie maison. La clé n'y est pas : c'est une identité. */
export const renameAllergenCategoryPayloadSchema = z.object({
  name: localizedTextSchema,
});
export type RenameAllergenCategoryPayload = z.infer<typeof renameAllergenCategoryPayloadSchema>;

/** Ranger une catégorie dans l'écran — le seul geste qu'une catégorie officielle accepte. */
export const moveAllergenCategoryPayloadSchema = z.object({
  position: positionSchema,
});
export type MoveAllergenCategoryPayload = z.infer<typeof moveAllergenCategoryPayloadSchema>;

/** Déclarer une entrée **maison**. Le `code` est une identité : il ne change plus. */
export const createAllergenEntryPayloadSchema = z.object({
  /** Code de stockage — majuscules, chiffres, tirets ou soulignés. */
  code: referenceIdentitySchema,
  name: localizedTextSchema,
  /** L'identifiant technique de la catégorie d'accueil. */
  categoryId: z.string().min(1),
});
export type CreateAllergenEntryPayload = z.infer<typeof createAllergenEntryPayloadSchema>;

/**
 * Réviser une entrée maison. Un champ **absent** vaut « ne touche pas à ça » —
 * le code n'y figure pas, il est l'identité de stockage.
 */
export const reviseAllergenEntryPayloadSchema = z.object({
  name: localizedTextSchema.optional(),
  categoryId: z.string().min(1).optional(),
});
export type ReviseAllergenEntryPayload = z.infer<typeof reviseAllergenEntryPayloadSchema>;
