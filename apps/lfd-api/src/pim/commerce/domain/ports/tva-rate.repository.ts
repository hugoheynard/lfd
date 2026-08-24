import type { TvaRate } from "../entities/tva-rate.js";

/**
 * Combien de familles visent un taux, **par clé de contexte de vente**. Une clé
 * absente = aucune famille ne le vise dans ce contexte.
 *
 * Une **projection de lecture**, pas un état de l'agrégat : `TvaRate` n'a
 * aucun invariant qui dépende de ce compte, et le lui faire porter obligerait
 * à le recompter à chaque `save()` pour rien.
 *
 * Indexé, et non trois champs nommés : le compte protège la suppression, et un
 * contexte oublié dans le total offrirait un bouton « Supprimer » que la base
 * refuserait ensuite. C'est exactement ce qui arrivait au B2B côté écran.
 */
export type TvaRateUsage = Readonly<Record<string, number>>;

/**
 * Port : l'application dépend de cette abstraction, jamais de Prisma.
 *
 * Il rend et reprend l'**agrégat** plutôt qu'une ligne et un tas de champs :
 * le taux n'est plus un nombre qu'un appelant pourrait passer de travers, il
 * vient du VO qui le valide.
 */
export abstract class TvaRateRepository {
  abstract listAll(): Promise<TvaRate[]>;
  abstract findById(id: string): Promise<TvaRate | null>;
  /** Le taux qui porte ce taux, s'il existe — l'unicité est fiscale. */
  abstract findByPercent(percent: number): Promise<TvaRate | null>;
  abstract add(rate: TvaRate): Promise<void>;
  abstract save(rate: TvaRate): Promise<void>;
  /** Refuse (`TvaRateInUseError`) si une famille vise encore ce taux. */
  abstract remove(id: string): Promise<void>;
  /**
   * Le compte d'usages par id de taux — un seul aller-retour pour toute la
   * liste, et non un `count` par ligne. Les taux sans usage en sont absents.
   */
  abstract usageByRegime(): Promise<ReadonlyMap<string, TvaRateUsage>>;
}
