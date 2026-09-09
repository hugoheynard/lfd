import type { CompanyMercuriale } from "../entities/company-mercuriale.js";
import type { PricingAct } from "../pricing-act.js";

/**
 * Port d'**écriture** de la mercuriale d'un client.
 *
 * Séparé de `CompanyMercurialeReader` comme partout ailleurs ici : le chemin qui
 * facture ne doit dépendre que de la lecture, et un port qui porterait les deux
 * lui donnerait la capacité d'écrire un tarif.
 *
 * Chaque méthode prend **l'agrégat entier**, jamais des primitives. Une
 * `setLabel(id, label)` aurait ramené l'invariant dans le handler, donc l'aurait
 * rendu invisible au prochain handler qui touche le même objet.
 */
export abstract class CompanyMercurialeRepository {
  /**
   * Pose la mercuriale **et son acte**, dans la même transaction.
   *
   * @throws {RunningMercurialeError} une mercuriale couvre déjà cette période
   *   chez ce client — la contrainte d'exclusion parle, et sa réponse est
   *   traduite plutôt qu'avalée.
   */
  abstract save(mercuriale: CompanyMercuriale, act: PricingAct): Promise<void>;

  /** Une transition — clore, suspendre, reprendre. Seul le cycle de vie bouge. */
  abstract update(mercuriale: CompanyMercuriale, act: PricingAct): Promise<void>;

  /** Le renommage : **une seule colonne**, plus l'acte. */
  abstract rename(mercuriale: CompanyMercuriale, act: PricingAct): Promise<void>;

  abstract load(id: string): Promise<CompanyMercuriale | null>;

  /**
   * La mercuriale non close de ce client qui **recouvre** cette fenêtre, ou
   * `null`.
   *
   * Sert le **pré-contrôle**, pas la garantie : la contrainte d'exclusion tient
   * la course entre deux commerciaux. Ce que cette lecture apporte est le
   * **message** — un refus qui nomme la mercuriale en cours, sans quoi on ne
   * saurait pas quoi clore.
   */
  /**
   * **Les mercuriales RANGÉES qui recouvrent cette fenêtre**, par identifiant.
   *
   * La contrainte d'exclusion est partielle (`WHERE archived_at IS NULL`) : elle
   * ne protège donc que du recouvrement avec une mercuriale **en cours**. Poser
   * par-dessus une période close reste possible en base, et c'est ce qu'il faut
   * refuser quand cette période a **facturé** — sans quoi la relecture datée y
   * trouverait deux tarifs concurrents.
   *
   * Rend des identifiants, pas des agrégats : l'appelant leur pose une seule
   * question, via `PricedDecisionsReader`.
   */
  abstract archivedOverlapping(
    companyId: string,
    validFrom: Date,
    validTo: Date | null,
  ): Promise<readonly string[]>;

  abstract runningFor(
    companyId: string,
    validFrom: Date,
    validTo: Date | null,
  ): Promise<CompanyMercuriale | null>;
}
