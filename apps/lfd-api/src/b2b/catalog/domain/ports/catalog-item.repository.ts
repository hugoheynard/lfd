import type { CatalogItem } from "../entities/catalog-item.js";

/**
 * Port d'**écriture** du catalogue. Séparé de la lecture (ISP) : le checkout lit
 * et n'écrit jamais ; l'ingestion et le back-office écrivent.
 *
 * Il ne prend **jamais** de primitives. Pas de `setPrice(sku, cents)`, pas de
 * `markHidden(sku)`, plus de `removeMany(skus)` : on charge l'agrégat, on le
 * mute par une méthode métier, on le rend. Sans cette règle, l'invariant « une décision survit au push »
 * retournerait dans l'adaptateur, où le prochain appelant ne le verrait pas.
 */
export abstract class CatalogItemRepository {
  /** Charge un article **en vente**, décision comprise, ou `null`. */
  abstract load(sku: string): Promise<CatalogItem | null>;

  /**
   * Charge tout le catalogue **en vente**, agrégats compris.
   *
   * Une lecture en bloc, pas un raccourci d'écriture : l'ingestion a besoin des
   * décisions déjà prises pour les reporter sur les faits neufs, et les charger
   * un par un ferait 92 allers-retours pour la même réponse.
   *
   * 🔴 **Les retirés en sont dehors**, et l'ingestion en dépend : un SKU
   * réintroduit doit y être ABSENT pour repasser par `CatalogItem.receive` —
   * c'est ce passage qui remet son retrait à `null`. S'il y figurait, il serait
   * rafraîchi et resterait invisible.
   */
  abstract loadAll(): Promise<CatalogItem[]>;

  /**
   * Tout ce que le miroir a jamais porté, **retirés compris**.
   *
   * 🔴 L'ingestion est le SEUL appelant légitime, et elle ne peut pas s'en
   * passer : un SKU réintroduit doit être reconnu comme *connu* pour que sa
   * décision commerciale lui revienne. Vu par {@link loadAll}, il serait absent,
   * donc reçu à neuf — et `saveMany` supprimerait l'override d'un article qu'on
   * vient de remettre en vente. C'est exactement la destruction que le retrait
   * non destructif était censé empêcher.
   *
   * ⚠️ Toute autre lecture veut {@link loadAll}. Celle-ci rend des articles qui
   * ne sont pas en vente ; les afficher, les compter ou les comparer ferait
   * mentir l'écran qui s'en sert.
   */
  abstract loadAllIncludingWithdrawn(): Promise<CatalogItem[]>;

  /**
   * Persiste l'état courant d'agrégats déjà chargés — **y compris leur retrait**.
   *
   * Il y avait ici un `removeMany(skus)`, et son JSDoc disait pourquoi : « Prend
   * des SKU et non des agrégats : retirer n'est pas muter un état, et charger un
   * agrégat pour le jeter n'apprendrait rien à personne. Leur décision part avec
   * eux — un prix négocié ne veut plus rien dire sans l'article qu'il tarifait. »
   *
   * Le raisonnement était juste **tant que le retrait est définitif**. Le retour
   * arrière le périme : rejouer une version ancienne retire les SKU entrés
   * depuis, donc détruirait les prix négociés des articles les plus récents.
   * Retirer devient alors muter un état — `CatalogItem.withdraw()` — et une
   * méthode qui écrit une colonne à partir de primitives redeviendrait le
   * « transaction script » que le CLAUDE.md §3.1 interdit.
   */
  abstract saveMany(items: readonly CatalogItem[]): Promise<void>;
}
