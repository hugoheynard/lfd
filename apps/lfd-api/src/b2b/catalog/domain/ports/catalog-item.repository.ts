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
   * Charge des articles **en vente** désignés, en UNE lecture. Les SKU absents
   * (inconnus ou retirés) manquent simplement du résultat, dans un ordre
   * quelconque : c'est à l'appelant de refuser, il sait ce qu'il attendait.
   *
   * Un geste de lot qui chargeait article par article ouvrait autant
   * d'allers-retours que de SKU dans sa transaction, et l'a fait expirer en
   * production (P2028, 64 SKU, 2026-10-17).
   */
  abstract loadMany(skus: readonly string[]): Promise<CatalogItem[]>;

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
   * Les articles d'UN produit du référentiel — retirés compris.
   *
   * Un produit porte plusieurs articles (ses déclinaisons), et ses visuels sont
   * les mêmes pour tous : c'est le PRODUIT qu'on photographie, pas la taille.
   *
   * 🔴 **Les retirés EN SONT**, à l'inverse de {@link loadAll}, et la raison
   * est le sens du geste : recevoir une photo n'est pas revenir au catalogue.
   * Un article retiré dont on corrige le visuel doit garder son visuel à jour —
   * sinon il reviendrait un jour en vente sous une photo périmée, et personne
   * ne saurait d'où elle vient.
   *
   * Rend `[]` pour un produit que le commerce ne connaît pas : le cas est
   * NORMAL — une fiche peut exister au référentiel sans avoir jamais été
   * poussée.
   */
  abstract loadByProduct(productId: string): Promise<CatalogItem[]>;

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
   *
   * Un nombre de requêtes qui ne croît pas avec le lot (P2028, 2026-10-17).
   */
  abstract saveMany(items: readonly CatalogItem[]): Promise<void>;

  /**
   * Persiste **l'attente de validation** d'agrégats déjà chargés, et rien
   * d'autre — en un nombre de requêtes qui ne dépend pas de leur nombre.
   *
   * Prend des agrégats, pas des primitives : c'est `CatalogItem.approveFor`
   * qui a décidé de la lever, et l'adaptateur ne fait que lire l'état qu'il
   * porte. Elle existe parce que valider ne change QUE ces deux colonnes, et
   * que {@link saveMany} réécrit aussi les faits, la décision et la trace du
   * tarif — en lot depuis le 2026-10-17, mais réécrire des faits ne ferait
   * qu'élargir la fenêtre où un fait concurrent du référentiel serait écrasé.
   *
   * ⚠️ Un appelant qui a muté autre chose que l'attente veut {@link saveMany}.
   */
  abstract saveReviewStates(items: readonly CatalogItem[]): Promise<void>;
}
