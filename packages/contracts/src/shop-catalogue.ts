import type { ShopItemOrderLimit } from "./item-order-limit.js";
import type { OrderSaleUnit } from "./order.js";

/**
 * **Le catalogue tel qu'une boutique PUBLIQUE le montre.**
 *
 * Une vue NEUVE, et surtout pas `CatalogAdminItemView` réexportée. Le miroir
 * porte ce qui sert à décider — le prix du référentiel À CÔTÉ du prix décidé
 * ici, qui a décidé et quand, la date de réception, l'aveu qu'une liste
 * d'allergènes est amputée. Un visiteur anonyme n'a rien à faire de tout ça, et
 * deux de ces champs le renseigneraient sur nos marges : l'écart entre le tarif
 * reçu et le tarif servi EST la négociation.
 *
 * La règle de tri, la même que pour le devis client : un champ passe s'il
 * répond à « qu'est-ce que c'est, et combien ça coûte ». Tout le reste reste au
 * back-office.
 *
 * 🔴 **Un ÉLARGISSEMENT de cette vue est une décision de sécurité.** Elle est
 * servie sans jeton ; ce qu'on y ajoute est public le jour du déploiement.
 */

/**
 * **Les langues de la vue** (lot des langues, 2026-10-18 —
 * `documentation/webhooks/vitrine.md` §5).
 *
 * `GET /shop/catalogue?lang=en` rend `name` et `note` des articles et `name`
 * des rayons dans la langue demandée, **en français quand le référentiel ne
 * les a pas traduits** ; sans paramètre, en français — la vue d'avant ce lot.
 * La FORME ne change pas avec la langue : un paramètre plutôt que des champs
 * traduits en plus, pour que la boutique ne télécharge que la langue qu'elle
 * affiche et qu'un lecteur d'avant ne voie aucune différence. Les opérations
 * portent déjà leurs trois langues ({@link ShopOperationText}) et ne changent
 * pas avec le paramètre.
 *
 * Les valeurs sont celles de `contentLocales` (`fr`, `en`, `it`).
 */

/** Un rayon, tel que la vitrine le range. */
export interface ShopShelfView {
  readonly id: string;
  /** Dans la langue demandée (`?lang=`), en français sinon. */
  readonly name: string;
  /** L'ordre voulu par le référentiel — la vitrine ne trie pas elle-même. */
  readonly position: number;
}

/** Le visuel principal d'un article, ou rien. */
export interface ShopImageView {
  readonly url: string;
  readonly alt: string;
  /**
   * Les dimensions réservent la place du visuel dans la grille : sans elles,
   * la vitrine saute au chargement. `null` = pas mesuré, jamais zéro.
   */
  readonly width: number | null;
  readonly height: number | null;
  /**
   * **Le point focal** posé à la médiathèque, en fractions de 0 à 1 depuis le
   * coin haut gauche — la vitrine recadre autour (`object-position`).
   *
   * Facultatif (L4, 2026-10-10) : absent ou `null`, la vitrine recadre au
   * centre, ce qu'elle a toujours fait. Une boutique déployée avant le serveur
   * l'ignore ; un serveur déployé avant la boutique ne le lui doit pas.
   */
  readonly focal?: ShopImageFocal | null | undefined;
}

/** Un point focal : deux fractions de 0 à 1. */
export interface ShopImageFocal {
  readonly x: number;
  readonly y: number;
}

/** Une référence en vente. */
export interface ShopItemView {
  /**
   * Le **SKU de vente** — opaque pour la boutique, qui le renvoie tel quel au
   * panier, au devis et à `POST /orders`.
   *
   * Pour la déclinaison par défaut, le SKU du **PRODUIT** : celui que la
   * boutique vend depuis l'ouverture commerciale et qui est écrit dans les
   * commandes passées. Pour une autre déclinaison, montrée en vignette quand sa
   * fiche le demande, le SKU de **cette déclinaison** (2026-10-29,
   * `documentation/catalogue/plan-declinaisons-en-vignette.md`, V4) ; la
   * caisse les résout tous deux.
   */
  readonly sku: string;
  /** Dans la langue demandée (`?lang=`), en français quand le référentiel ne l'a pas traduit. */
  readonly name: string;
  /**
   * La ligne sous le nom. `null` = le référentiel n'en a pas écrit — dans
   * toutes les langues. Traduite comme {@link name}.
   */
  readonly note: string | null;
  readonly image: ShopImageView | null;
  /**
   * La **vignette de rayon** — cadrée serré pour être lisible à 200 px dans la
   * grille, là où {@link image} présente la pièce en ouverture de fiche.
   *
   * 🔴 Elle existe depuis le 2026-09-23, et son absence était un trou visible
   * depuis l'écran d'administration : le référentiel proposait un rôle
   * « vignette de rayon (4/3) », on pouvait le choisir, et **rien ne le
   * transportait**. Le choisir ne produisait aucun effet, même après un push.
   *
   * ⚠️ `null` = la fiche n'en désigne pas, et la vitrine retombe sur
   * {@link image}. C'est ce qu'elle a toujours fait, et ce qu'elle continue de
   * faire tant qu'un push v10 n'a pas tourné.
   */
  readonly thumbnail: ShopImageView | null;
  /**
   * Le prix unitaire **HT en millicentimes**, entier — celui qui sera facturé à
   * un visiteur sans mercuriale.
   *
   * En millicentimes et pas en euros parce que c'est l'unité de tout le modèle,
   * et que le front n'a plus à convertir : un flottant en euros est exactement
   * ce que ce chantier retire.
   *
   * 🔴 **C'est le prix RÉSOLU**, depuis le 2026-09-09 — celui que la caisse
   * appliquera à qui regarde : promotions publiques comprises sur la route
   * anonyme, mercuriale comprise sur la route reconnue.
   *
   * ⚠️ Ce champ a porté le prix **canonique** jusque-là, et la raison écrite ici
   * — « elle est publique, donc sans client » — confondait deux choses. Un prix
   * NÉGOCIÉ exige un client ; une promotion publique, non. Une promotion
   * `audience: all` était donc invisible au rayon et n'apparaissait qu'au
   * panier : l'écart était dans le sens agréable, mais une promotion qu'on ne
   * voit pas ne fait pas vendre (R22).
   */
  readonly unitPriceMillicents: number;
  /**
   * **Le prix d'UNE pièce, taxe comprise, en centimes** — ce que la caisse
   * encaissera pour cet article seul.
   *
   * 🔴 **Il est calculé par le SERVEUR, et c'est tout l'objet du champ.** Le
   * front pourrait le dériver du hors taxe et du taux ; il le dériverait alors
   * avec ses propres arrondis, et l'étiquette du rayon cesserait de valoir ce
   * que le panier facture — d'un centime, sur la moitié des prix à 20 %. Ce
   * nombre passe par la MÊME ventilation que la caisse.
   *
   * ⚠️ **À quantité UN.** `ventilateVat` arrondit une fois par groupe de taux
   * sur un panier entier : deux pièces ne coûtent pas toujours exactement le
   * double. C'est la limite normale d'un prix unitaire affiché, et elle est la
   * même que celle de `unitPriceMillicents` juste au-dessus.
   *
   * Servi aux DEUX audiences. C'est l'écran qui choisit lequel des deux prix il
   * montre — hors taxe à un professionnel, taxe comprise à un particulier —,
   * parce que c'est lui qui sait devant qui il est.
   */
  readonly unitPriceTtcCents: number;
  /**
   * **L'unité de vente de l'article** (plan
   * `documentation/pricing/vente-au-poids.md`, P4) : `piece`, ou `weight`
   * — et alors {@link unitPriceMillicents} et {@link unitPriceTtcCents} sont
   * des prix **au kilo**, et la quantité d'une ligne se dit en grammes.
   *
   * ⚠️ Facultatif dans le TYPE pour ne pas casser les fixtures des fronts ;
   * le serveur l'émet toujours. Absent = `piece`.
   */
  readonly saleUnit?: OrderSaleUnit;
  /**
   * Le pas de saisie d'un article au poids, en grammes — une quantité qui
   * n'en est pas un multiple est refusée à la commande. `null` pour une
   * pièce. Toujours émis par le serveur.
   */
  readonly weightStepGrams?: number | null;
  /** Le minimum d'un article au poids, en grammes ; `null` = pas de minimum (ou une pièce). */
  readonly weightMinGrams?: number | null;
  /**
   * **La quantité minimale d'achat, en pièces**, déjà résolue pour la
   * clientèle de qui regarde — le minimum public pour la boutique publique, le
   * minimum pro pour le pro
   * (`documentation/catalogue/plan-quantite-minimale.md`, M2). `null` = aucun
   * minimum. Absent
   * d'un serveur d'avant. Ni la vitrine ni le devis ne l'appliquent encore (M4).
   */
  readonly minQuantity?: number | null;
  /**
   * **Le prix au kilo PRO, hors taxe, en millicentimes** — tel que saisi au
   * référentiel (`documentation/pricing/plan-prix-au-kilo.md`).
   *
   * 🔴 **Informatif** : saisi, jamais calculé depuis le prix et le poids, et
   * jamais facturé — ni le panier, ni le devis, ni la facture ne le lisent.
   * `null` = non saisi : rien ne s'affiche.
   *
   * Les deux prix au kilo sont servis à toutes les audiences, chacun nommé par
   * son unité : comme pour la pièce, **c'est l'écran qui choisit** l'assiette
   * (`showsTtc()`), et il ne montre jamais l'autre en repli.
   *
   * ⚠️ Facultatif dans le TYPE pour ne pas casser les fixtures des fronts
   * avant leur lot (K5) ; le serveur l'émet toujours, à `null` au besoin.
   */
  readonly proPricePerKgMillicents?: number | null;
  /**
   * **Le prix au kilo PUBLIC, taxe comprise, en centimes** — tel que saisi au
   * référentiel. Même statut que {@link proPricePerKgMillicents} : informatif,
   * `null` = non saisi, toujours émis par le serveur.
   */
  readonly publicPricePerKgTtcCents?: number | null;
  /**
   * **Le tarif à barrer** — l'étiquette publique sur la route publique, le
   * tarif du canal pro sur la route reconnue et sur `?audience=pro` —
   * **absent** quand il n'y a rien à barrer.
   *
   * ⚠️ Ce JSDoc disait « le tarif catalogue pro » pour les deux routes jusqu'au
   * 2026-10-18 (relevé par `vitruve`) : sur `GET /shop/catalogue`, le tarif
   * est l'étiquette publique d'avant promotion (`servedPriceOf`, audience
   * `public`), jamais un tarif pro.
   *
   * Optionnel, donc **absent DU FIL** quand il n'y a rien à barrer, plutôt que
   * présent à `null`. Ce n'est pas une coquetterie : un e2e énumère les clés de
   * cette vue pour que la surface publique reste étroite, et une clé qui y
   * vaudrait toujours `null` l'élargirait sans rien apprendre à personne.
   *
   * Rempli sur les **deux** routes depuis le 2026-09-09, et seulement quand le
   * prix servi est **plus bas** que le tarif : la remise qu'une promotion
   * publique accorde à un visiteur, l'écart qu'un client a négocié. ⚠️ Ce
   * paragraphe disait « la route publique n'a pas de client, donc aucun écart à
   * montrer » — elle en a un dès qu'une promotion court (R22).
   *
   * 🔴 **Toujours le tarif, jamais l'autre prix servi.** Barré vers le bas
   * uniquement : un prix résolu peut MONTER (altération `increase`, règle
   * `replace` posée plus haut, plancher qui relève), et barrer alors le tarif
   * afficherait une référence **inférieure** au prix demandé — un prix de
   * référence mensonger sur une page publique.
   *
   * 🔴 **Jamais le prix promotionnel comme référence pour un client sous
   * mercuriale.** Une mercuriale SCELLE la chaîne : ce client n'aurait de toute
   * façon pas eu la promotion du moment. Lui barrer un prix promo lui montrerait
   * une remise qu'il n'a pas perdue.
   */
  readonly catalogPriceMillicents?: number;
  /** Le taux applicable, en pourcentage (5.5, 10). Un article sans taux ne sort pas d'ici. */
  readonly vatRatePercent: number;
  readonly shelfId: string;
  /** La pièce qui ne doit pas se noyer dans son rayon — mise en avant POUR CE LECTEUR. */
  readonly isFeatured: boolean;
  /**
   * **À qui l'article se vend**, tel que le référentiel le dit (Hugo,
   * 2026-10-18, option a de B1 — `vitrine.md` §4 décision 5) :
   * `both` se lit « aussi pour les professionnels ».
   *
   * 🔴 La route publique ne rend que `public` ou `both` : un article réservé
   * aux pros n'y sort pas (`servedTo`). `pro` n'apparaît que sur la route
   * reconnue d'un client pro (`/shop/catalogue/mine`), qui partage cette vue,
   * et sur le rayon pro sans jeton (`/shop/catalogue?audience=pro`, Hugo,
   * 2026-10-19 — tarif pro de base, hors taxe, rien de négocié).
   *
   * ⚠️ **Un élargissement ASSUMÉ** de la surface publique : il ne dit rien que
   * le rayon pro ne montre déjà, et l'e2e qui énumère les clés le nomme.
   */
  readonly audience: ShopItemAudience;
  /**
   * **L'opération datée qui rend cet article vendable**, pour un article
   * « vendu seulement pendant une opération » (D3, D8 de
   * `documentation/operations-datees/architecture-operations-datees.md`) : la carte dit
   * « Ouvre le 15 nov. » ou « Commandes closes », et remplace son « + ».
   *
   * La clé renvoie à {@link ShopCatalogueView.operations}, qui porte le nom et
   * les dates : les recopier sur chaque carte grossirait la réponse pour rien.
   *
   * Optionnel, donc **absent du fil** pour un article courant — la règle de
   * `catalogPriceMillicents` : la vitrine énumère les clés de cette vue pour
   * garder la surface publique étroite. Un article courant d'une opération (le
   * croissant de Noël) n'en porte pas : rien ne restreint sa vente.
   */
  readonly operation?: ShopItemOperationView;
  /**
   * **La limite de commande propre à l'article** — « Préparé sur commande — à
   * commander 2 jours à l'avance, avant 12 h » (Hugo, 2026-10-21,
   * `limites-de-commande/limites-produit.md` §4) : la limite que le
   * référentiel résout pour l'article (déclinaison, produit ou famille).
   *
   * Servie **seulement quand elle est plus stricte** que la règle générale de
   * la boutique (`shownItemOrderLimit`) — sinon la fiche dirait ce que la
   * boutique dit déjà. Jamais la grâce.
   *
   * Optionnel, donc **absent du fil** quand l'article suit la règle générale —
   * la règle de `catalogPriceMillicents` : la surface publique reste étroite.
   * ⚠️ Un élargissement ASSUMÉ : ce que la fiche affiche, rien de plus.
   */
  readonly orderTimeLimit?: ShopItemOrderLimit;
  /**
   * **Les allergènes et les traces**, tels que le client les lit, dans la
   * langue de la requête (`?lang=`) — plan
   * `documentation/pim/plan-allergenes-en-boutique.md`, décisions de Hugo du
   * 2026-10-27 : des LIBELLÉS, pas des codes (a) ; nommés par le référentiel,
   * aucun dictionnaire dans la boutique (b) ; « peut contenir » jamais sans
   * les allergènes (c).
   *
   * 🔴 **Un élargissement ASSUMÉ de la surface publique**, et le plus étroit
   * possible : un état et deux listes de libellés. Ni code GS1, ni aveu
   * d'incomplétude, ni provenance — l'information que le règlement (UE)
   * 1169/2011 (art. 14, 44) doit au client avant l'achat, rien de plus.
   *
   * Optionnel, donc **absent du fil** quand le commerce ne sait pas : article
   * reçu avant que le fil porte les libellés, sans fiche, ou dont la liste
   * est amputée d'un code que le référentiel ne nomme pas. L'absence se lit
   * « pas d'information », **jamais** « aucun allergène ».
   */
  readonly allergens?: ShopItemAllergensView;
}

/**
 * Ce que le client sait des allergènes d'un article :
 *
 * - `declared` — `contains` porte les allergènes déclarés (jamais vide) ;
 * - `none` — « Aucun allergène » est DÉCLARÉ : une affirmation, pas un silence ;
 * - `precautionary` — personne ne s'est prononcé (règle B) : la vitrine dit
 *   « Information précise non disponible », `contains` porte ce que la
 *   composition cite (peut être vide) et `mayContain` les allergènes du
 *   catalogue.
 *
 * `mayContain` (« peut contenir ») ne répète jamais une mention de `contains`.
 */
export interface ShopItemAllergensView {
  readonly state: ShopAllergenState;
  readonly contains: readonly string[];
  readonly mayContain: readonly string[];
}

/** L'état d'une information allergènes servie — cf. {@link ShopItemAllergensView}. */
export type ShopAllergenState = "declared" | "none" | "precautionary";

/** À qui un article se vend — une VALEUR du référentiel, recopiée telle quelle. */
export type ShopItemAudience = "public" | "pro" | "both";

/** L'état d'une opération montrée, calculé à l'horloge du serveur (D2). */
export type ShopOperationState = "announced" | "open" | "closed";

/** Ce qu'une carte sait de l'opération qui la rend vendable. */
export interface ShopItemOperationView {
  readonly key: string;
  readonly state: ShopOperationState;
}

/** Un texte d'opération, dans les langues que le référentiel a saisies — le français toujours. */
export interface ShopOperationText {
  readonly fr: string;
  readonly en?: string;
  readonly it?: string;
}

/**
 * **Une opération datée montrée par la vitrine** — son rayon `op:<key>`, en
 * tête pendant sa fenêtre (D8).
 *
 * Seules celles qui s'adressent à la clientèle servie et dont la fenêtre court
 * (de l'annonce au lendemain du dernier jour de retrait) sont rendues : une
 * opération en préparation n'est pas publique. Les dates sont les dates
 * EFFECTIVES — la clôture tient compte de la réception.
 */
export interface ShopOperationView {
  /** La clé, qui ne se réemploie jamais — le rayon s'appelle `op:<key>`. */
  readonly key: string;
  readonly name: ShopOperationText;
  readonly lede: ShopOperationText | null;
  /**
   * `focal` : le point focal lu à la médiathèque — au push, et sans push
   * quand la médiathèque remplace ou redécrit l'image (cf.
   * `documentation/mediatheque/mediatheque.md` §7 bis, 2026-10-11).
   * Facultatif — absent ou `null`, la bannière recadre au centre.
   */
  readonly image: {
    readonly url: string;
    readonly alt: string;
    readonly focal?: ShopImageFocal | null | undefined;
  } | null;
  readonly state: ShopOperationState;
  /** Instant ISO d'ouverture de la commande (l'annonce quand le référentiel n'en fixe pas). */
  readonly orderFrom: string;
  /** Instant ISO de clôture, le plus tôt du référentiel et de la réception. */
  readonly orderUntil: string;
  /** Premier et dernier jours de retrait, `AAAA-MM-JJ`. */
  readonly pickupFrom: string;
  readonly pickupUntil: string;
  /**
   * Les SKU **de vente** du rayon, dans l'ordre du référentiel, restreints aux
   * articles que {@link ShopCatalogueView.items} porte — donc jamais un SKU
   * que la vitrine ne saurait pas afficher.
   *
   * ⚠️ Peut être VIDE depuis la bascule des opérations au commerce (lot 3 de
   * `plan-l-operation-passe-au-commerce.md`) : pendant l'annonce, le rayon
   * paraît sur son seul encart ; commandes ouvertes, voir `awaitingProducts`.
   * Avant la bascule, jamais vide.
   */
  readonly skus: readonly string[];
  /**
   * Instant ISO de l'annonce — « Commandes à partir du… » se lit sur
   * `orderFrom`. Toujours servi depuis le 2026-10-17 (opérations au
   * commerce) ; optionnel pour lire une réponse d'avant.
   */
  readonly announceFrom?: string;
  /**
   * `true` : commandes ouvertes et rayon vide — l'encart dit « Les produits
   * arrivent bientôt ». Présent seulement une fois les opérations au commerce.
   */
  readonly awaitingProducts?: boolean;
  /**
   * `true` : « Commandez avant le 21 décembre à 12:00 » ; `false` : le jour
   * seul. Réglé par opération au commerce (2026-10-16). Présent seulement une
   * fois les opérations au commerce ; absent, la vitrine dit le jour seul.
   */
  readonly showsOrderUntilTime?: boolean;
}

/**
 * Ce que la boutique reçoit **en un appel** — l'hydratation.
 *
 * Les rayons voyagent avec les articles plutôt que sur une seconde route : ils
 * ne servent qu'ensemble, et deux appels rendraient possible un état où la
 * vitrine connaît des articles dont elle ignore le rayon.
 */
export interface ShopCatalogueView {
  readonly shelves: readonly ShopShelfView[];
  readonly items: readonly ShopItemView[];
  /**
   * Les opérations montrées, l'annonce la plus récente d'abord (D8) — vide
   * hors saison. Ajoutées au lot 3 du plan des opérations datées ; la
   * boutique en fait ses rayons `op:<key>` au lot 4.
   */
  readonly operations: readonly ShopOperationView[];
}
