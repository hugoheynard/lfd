import type { MercurialeDraftView, SaveMercurialeDraftPayload } from "@lfd/contracts";

/**
 * **Le brouillon de mercuriale d'un client** — lire, enregistrer, jeter.
 *
 * ## Un seul port, lecture et écriture, et c'est une décision
 *
 * Le dépôt sépare partout ailleurs le lecteur du dépôt d'écriture
 * (`PriceRuleReader` ≠ `PricingRuleRepository`), et `CLAUDE.md` §2 le pose en
 * règle. Ici, non — parce que ce que cette règle protège n'existe pas :
 *
 * - il n'y a **pas d'agrégat** derrière. Le brouillon n'a aucun invariant, et
 *   son propre commentaire d'origine l'explique : une grille incomplète est son
 *   état normal, c'est même sa raison d'être. Les refus arrivent à la pose ;
 * - les deux moitiés ne se séparent pas dans la vie du fichier. `save` remplace
 *   ce que `forCompany` relit, sur une ligne dont la clé primaire **est** le
 *   client. Ce sont trois gestes sur un même état, pas deux vues d'un modèle.
 *
 * ⚠️ **Le prix est réel et il faut le dire** : le handler qui pose une
 * mercuriale n'appelle que `discard`, et dépend ici de trois méthodes. C'est
 * exactement ce que l'ISP fait éviter. Le jour où un quatrième geste apparaît —
 * ou où quelqu'un est tenté d'écrire depuis un chemin de lecture —, c'est le
 * moment de couper, et cette phrase est là pour qu'on s'en souvienne.
 *
 * **Déclaré dans `application/`** : il se contractualise en `MercurialeDraftView`
 * et `SaveMercurialeDraftPayload`, des types du fil.
 */
export abstract class MercurialeDraftStore {
  /** Le brouillon en cours, ou `null` — il n'y en a jamais eu, ou il est posé. */
  abstract forCompany(companyId: string): Promise<MercurialeDraftView | null>;

  /** Enregistre — remplace ce qui s'y trouvait. */
  abstract save(
    companyId: string,
    payload: SaveMercurialeDraftPayload,
    staffSub: string,
  ): Promise<void>;

  /**
   * Jette le brouillon. **Silencieux s'il n'y en a pas** : le geste vise un état
   * — « plus de brouillon sur ce compte » — et il est atteint dans les deux cas.
   * C'est aussi ce qui rend la pose sûre à répéter.
   */
  abstract discard(companyId: string): Promise<void>;
}
