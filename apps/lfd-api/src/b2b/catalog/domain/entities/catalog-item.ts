import {
  CannotFeatureHiddenItemError,
  InvalidB2bPriceError,
  InvalidPublicPriceError,
  PublicPriceWithoutContextError,
  RedundantPublicPriceError,
  RedundantB2bPriceError,
} from "../errors/catalog-errors.js";

/**
 * **L'article du catalogue B2B** — l'agrégat, et le seul chemin d'écriture.
 *
 * Il tient ensemble deux choses de natures opposées, et c'est tout son intérêt :
 *
 * - les **faits reçus du PIM** (nom, prix canonique, famille, TVA) — subis, jamais
 *   décidés ici, remplacés au push suivant ;
 * - la **décision de la plateforme** (prix B2B, visibilité, mise en avant) — prise
 *   ici, et qui doit survivre au push.
 *
 * Les faire cohabiter dans un agrégat rend l'invariant structurel plutôt que
 * conventionnel : `refreshFromPim()` ne **peut pas** toucher à la décision, parce
 * qu'il n'écrit que les champs du premier groupe. Une ingestion en « table rase »
 * n'est plus une erreur qu'un test rattrape — elle n'est plus exprimable.
 *
 * Cycle de vie, comme partout ailleurs :
 * `repo.load(sku)` → `item.méthodeMétier()` → `repo.save(item)`.
 * Aucune écriture ne prend de primitives ; aucun `setStatus(id, valeur)`.
 */

/** Ce que le PIM envoie pour un article — les faits, sans aucune décision. */
/**
 * **Jusqu'à quand on prend commande de cet article**, tel que le référentiel l'a
 * résolu. Les trois valeurs vont ensemble : une limite sans heure ne se compare
 * à rien, un rattrapage sans limite n'a rien à rattraper.
 *
 * Déclaré ici et non importé du fil : le domaine du commerce ne dépend pas du
 * schéma de transport. Les deux se ressemblent aujourd'hui, et c'est normal —
 * l'un décrit ce qu'on reçoit, l'autre ce qu'on tient.
 */
export interface OrderTimeLimitFacts {
  /** Combien de jours **avant** l'acheminement la limite tombe. `0` = le jour même. */
  readonly daysBefore: number;
  /** `HH:MM` en heure de pendule d'**Europe/Paris**, jamais un instant UTC. */
  readonly time: string;
  /** Le rattrapage après la limite, en minutes. `0` = limite ferme. */
  readonly graceMinutes: number;
}

export interface PimFacts {
  readonly sku: string;
  readonly productId: string;
  readonly productSku: string;
  readonly name: string;
  readonly kind: string;
  readonly categoryId: string;
  readonly priceMillicents: number;
  readonly weightGrams: number | null;
  readonly isDefault: boolean;
  readonly position: number;
  /**
   * Le taux de TVA de CET article, résolu par le PIM. `null` = famille non
   * réglée là-bas : l'article entre au référentiel local mais n'est pas
   * vendable — cf. `CatalogReader`.
   */
  readonly vatRatePercent: number | null;
  /**
   * **L'étiquette**, en centimes — ce qu'un particulier lit et paie, taxe
   * comprise, tel que le référentiel le saisit.
   *
   * `null` sur une ligne d'avant le fil **v9** : le prix public ne traversait
   * pas, et seul son dérivé professionnel arrivait. ⚠️ `null` ne veut donc pas
   * dire « gratuit » ni « pas de prix » — il veut dire **on ne sait pas encore
   * ce qu'un particulier paierait**, et un push complet le remplit.
   */
  readonly publicTtcCents: number | null;
  /**
   * **Le prix public par contexte de vente**, tel que le PIM l'a résolu — une
   * entrée par contexte réglé, indexée par sa clé (`takeaway`, `eatIn`, `b2b`).
   *
   * 🔴 **Ce n'est PAS `priceMillicents`.** Celui-ci porte le prix
   * PROFESSIONNEL — l'étiquette diminuée du rapport, puis mise hors taxe ; les
   * entrées d'ici portent l'étiquette ELLE-MÊME mise hors taxe au taux de
   * chaque contexte. Les deux sont des hors taxe et c'est tout ce qu'ils
   * partagent ; les confondre facturerait un particulier au tarif pro.
   *
   * Une CARTE et non des champs nommés : ajouter un contexte est une ligne de
   * données côté référentiel, et la plateforme n'a pas à connaître les clés
   * pour les ranger. Elle ne les invente pas non plus — un contexte sans taux
   * réglé n'a pas d'entrée.
   *
   * `null` sur une ligne d'avant la v9, pour la même raison que ci-dessus.
   */
  readonly publicByContext: Readonly<Record<string, PimContextPrice>> | null;
  /**
   * Les codes allergènes GS1 déclarés par le PIM. **Trois états**, tous
   * significatifs : `null` = aucune fiche réglementaire, `[]` = fiche déclarée
   * sans allergène, une liste = les codes.
   *
   * Les deux premiers ne se confondent pas : l'un est un silence, l'autre une
   * affirmation qu'un client a le droit de lire.
   */
  readonly allergens: readonly string[] | null;
  /**
   * Les **mentions d'étiquette** que le PIM a projetées pour ces codes, et
   * l'aveu que la liste peut être amputée.
   *
   * Subies comme le reste : la plateforme ne les recalcule pas, elle n'a plus le
   * référentiel réglementaire (D6). `null` suit `allergens` — et vaut aussi pour
   * un article reçu avant la v5 du fil, que seul un push complet garnira.
   *
   * ⚠️ Cette phrase a été **fausse** du 2026-08-31 au 2026-09-03 :
   * `prisma-catalog-admin.reader.ts` recalculait bel et bien, depuis une table
   * figée, pendant que ce commentaire affirmait le contraire à trois lignes de
   * la colonne prévue pour l'en dispenser. Une doctrine écrite ne tient pas une
   * frontière — c'est `lint:context-boundaries` qui la tient désormais.
   *
   * `incomplete` compte autant que les libellés : un code sans obligation UE ou
   * inconnu disparaît de la projection sans bruit, et une liste vide qui se tait
   * s'affiche « sans allergène ».
   */
  readonly allergenLabels: PimAllergenLabels | null;
  /**
   * La limite de commande de cet article, ou `null` = **le référentiel n'en
   * déclare aucune**. Distinct d'un article d'avant le fil v6, qui porte lui
   * aussi `null` — les deux se comportent pareil, et c'est voulu : dans les deux
   * cas, le commerce retombe sur sa propre règle.
   */
  readonly orderTimeLimit: OrderTimeLimitFacts | null;
  /**
   * **La ligne de vitrine**, telle que le référentiel l'écrit — `null` quand
   * rien n'a été saisi.
   *
   * Portée par l'ARTICLE alors que le référentiel la range sur le produit, pour
   * la raison qui a déjà fait descendre le taux de TVA ici : c'est l'article
   * qu'on vend, c'est lui qui doit savoir se montrer. La lire sur le produit
   * ferait dépendre une vitrine d'une jointure que le miroir n'a pas.
   *
   * ⚠️ `null` n'est pas `""`. Rien n'a été écrit n'est pas une ligne effacée, et
   * l'écran de réception doit pouvoir dire lequel des deux vient d'arriver.
   */
  readonly note: string | null;
  /** Le packshot, ou `null` — cf. {@link PimImage}. */
  readonly image: PimImage | null;
  /**
   * La **vignette de rayon**, ou `null` — cf. {@link PimImage}.
   *
   * Distincte du packshot, et pas un doublon : l'une est cadrée serré pour
   * être lisible à 200 px dans une grille, l'autre présente la pièce en
   * ouverture de fiche. 4/3 contre 3/2.
   *
   * ⚠️ `null` est le cas COURANT tant qu'un push v10 n'a pas tourné : la
   * vignette ne traversait pas le fil avant, donc la choisir à l'écran ne
   * produisait aucun effet. La vitrine retombe alors sur le packshot.
   */
  readonly thumbnail: PimImage | null;
  readonly receivedAt: Date;
}

/**
 * Le visuel principal d'un article, reçu du référentiel.
 *
 * Les dimensions accompagnent l'URL parce qu'elles ne servent qu'ensemble : la
 * grille réserve la place du visuel avec, et la vitrine saute au chargement
 * sans. `null` = pas mesuré (visuel saisi par son URL), jamais zéro.
 */
export interface PimImage {
  readonly url: string;
  readonly alt: string;
  readonly width: number | null;
  readonly height: number | null;
}

/** Une mention d'étiquette reçue : la catégorie INCO et son libellé français. */
export interface PimAllergenLabel {
  readonly category: string;
  readonly label: string;
}

/** Les mentions reçues pour un article, et ce qu'elles taisent. */
export interface PimAllergenLabels {
  readonly labels: readonly PimAllergenLabel[];
  readonly incomplete: boolean;
}

/**
 * **Ce que le public paie dans UN contexte de vente**, et à quel taux.
 *
 * Déclaré ICI plutôt qu'importé du contrat de fil, comme {@link
 * PimAllergenLabels} juste au-dessus : le domaine décrit ce qu'il SAIT, il
 * n'emprunte pas la forme de celui qui le lui a dit. Le jour où le fil change
 * de forme, c'est le mapper qui traduit — pas l'agrégat qui suit.
 */
export interface PimContextPrice {
  /** Le taux de CE contexte, en pourcentage. */
  readonly vatRatePercent: number;
  /** L'étiquette mise hors taxe à ce taux, en millicentimes (10⁻⁵ €). */
  readonly htMillicents: number;
}

/** La décision de la plateforme. `null` partout = aucune décision prise. */
export interface LocalDecision {
  readonly priceMillicents: number | null;
  /**
   * Le prix **public** décidé ici, en centimes **TTC**. `null` = on garde
   * l'étiquette du PIM.
   *
   * ⚠️ **Une unité différente de sa voisine**, et c'est voulu : celui-ci est un
   * prix qu'un humain POSE, l'autre un hors taxe DÉRIVÉ. `millicents.ts` tient
   * la règle.
   */
  readonly decidedPublicTtcCents: number | null;
  /** Masqué de la boutique **professionnelle**. */
  readonly isHidden: boolean;
  /**
   * Masqué de la boutique **publique** — une décision distincte de la
   * précédente.
   *
   * ⚠️ Jusqu'au 2026-09-21, `isHidden` valait pour les deux : masquer un article
   * le retirait de partout. Le backfill a recopié la valeur, de sorte que ce qui
   * était masqué le reste des deux côtés.
   */
  readonly isHiddenPublic: boolean;
  readonly isFeatured: boolean;
  readonly decidedBy: string | null;
}

/** Aucune décision : l'état d'un article que personne n'a encore touché. */
const NO_DECISION: LocalDecision = {
  priceMillicents: null,
  decidedPublicTtcCents: null,
  isHidden: false,
  isHiddenPublic: false,
  isFeatured: false,
  decidedBy: null,
};

/** L'état sérialisé pour la persistance — aucun type Prisma ici. */
export interface CatalogItemState {
  readonly facts: PimFacts;
  /**
   * Quand l'article a quitté la vente, ou `null` s'il y est.
   *
   * Il vit à côté des faits et de la décision parce qu'il n'est ni l'un ni
   * l'autre : le PIM ne l'envoie pas — un retrait est une ABSENCE dans son
   * snapshot — et aucun commercial ne le décide. C'est une conséquence, et elle
   * a besoin de sa propre place.
   */
  readonly withdrawnAt: Date | null;
  /**
   * `null` quand plus aucune décision ne subsiste : l'adaptateur **supprime**
   * alors la ligne d'override au lieu d'en écrire une neutre. « Revenir au prix
   * du PIM » redevient ainsi l'absence de décision, pas une décision vide.
   */
  readonly decision: LocalDecision | null;
}

export class CatalogItem {
  private constructor(
    private readonly facts: PimFacts,
    private decision: LocalDecision,
    private withdrawnAt: Date | null,
  ) {}

  /**
   * **Reçoit** un article du PIM pour la première fois.
   *
   * Nomme l'intention (`receive`, pas `new`) : cet article entre au catalogue
   * parce qu'un push l'a apporté, jamais parce que quelqu'un l'a créé ici.
   *
   * 🔴 Il naît **en vente**, et c'est ce qui remet en rayon un SKU retiré puis
   * réintroduit : le miroir ne rend plus les retirés, donc un tel article
   * repasse par ici, et son `withdrawnAt` est réécrit à `null`. Sans ça, il
   * resterait invisible pour toujours — et rien ne le dirait, puisque le push
   * l'annoncerait accepté.
   */
  static receive(facts: PimFacts): CatalogItem {
    return new CatalogItem(facts, NO_DECISION, null);
  }

  /** Reconstitue un article persisté, décision comprise. */
  static reconstitute(state: CatalogItemState): CatalogItem {
    return new CatalogItem(state.facts, state.decision ?? NO_DECISION, state.withdrawnAt);
  }

  get sku(): string {
    return this.facts.sku;
  }

  /**
   * Le prix **réellement applicable** : la décision locale si elle existe, sinon
   * celui du PIM. La règle vit ici, une seule fois — la laisser fuir donnerait
   * autant de réponses qu'il y a d'écrans.
   */
  get effectivePriceMillicents(): number {
    return this.decision.priceMillicents ?? this.facts.priceMillicents;
  }

  get pimPriceMillicents(): number {
    return this.facts.priceMillicents;
  }

  /**
   * Le prix B2B **décidé**, ou `null` quand l'article suit le tarif du PIM.
   *
   * Distinct de {@link effectivePriceMillicents} : un prix B2B peut égaler le
   * prix du PIM après un push, et seul ce getter dit alors qu'une décision
   * existe — ce que le journal doit savoir pour ne pas annoncer un retour au
   * PIM qui n'a rien retiré.
   */
  get b2bPriceMillicents(): number | null {
    return this.decision.priceMillicents;
  }

  /**
   * Les faits **reçus** du référentiel, en lecture.
   *
   * Exposés parce qu'un diff d'arrivée les compare un par un — et il compare
   * les CODES d'allergènes, là où la vue d'administration rend des libellés
   * déjà projetés. Deux besoins, deux formes : celle-ci est la brute, celle qui
   * se compare.
   */
  get name(): string {
    return this.facts.name;
  }

  get categoryId(): string {
    return this.facts.categoryId;
  }

  /**
   * La limite de commande déclarée par le référentiel pour cet article, ou
   * `null` — auquel cas c'est la règle du commerce qui s'applique.
   */
  get orderTimeLimit(): OrderTimeLimitFacts | null {
    return this.facts.orderTimeLimit;
  }

  /** La ligne de vitrine reçue — `null` = rien de saisi, jamais « effacé ». */
  get note(): string | null {
    return this.facts.note;
  }

  get image(): PimImage | null {
    return this.facts.image;
  }

  get thumbnail(): PimImage | null {
    return this.facts.thumbnail;
  }

  get vatRatePercent(): number | null {
    return this.facts.vatRatePercent;
  }

  /** L'étiquette reçue du référentiel. `null` avant le fil v9. */
  get publicTtcCents(): number | null {
    return this.facts.publicTtcCents;
  }

  /** Le prix public par contexte, reçu du référentiel. `null` avant le fil v9. */
  get publicByContext(): Readonly<Record<string, PimContextPrice>> | null {
    return this.facts.publicByContext;
  }

  get weightGrams(): number | null {
    return this.facts.weightGrams;
  }

  /** Les codes GS1 déclarés — `null` (pas de fiche) ≠ `[]` (aucun allergène). */
  get allergens(): readonly string[] | null {
    return this.facts.allergens;
  }

  /**
   * **Tous** les faits reçus, d'un bloc — et strictement eux.
   *
   * Sert à photographier le miroir au moment d'une validation. Le bloc plutôt
   * que les champs un par un, parce qu'une version doit être *complète* : un
   * getter oublié ici donnerait une archive amputée qu'aucun test ne verrait,
   * puisqu'elle serait cohérente avec elle-même.
   *
   * ⚠️ Aucune décision n'en sort, et c'est tout l'intérêt : le prix rendu est le
   * prix **reçu**, jamais l'effectif. Y glisser la décision rendrait faux dès la
   * première renégociation un objet qu'on promet immuable.
   */
  get pimFacts(): PimFacts {
    return this.facts;
  }

  get isHidden(): boolean {
    return this.decision.isHidden;
  }

  /** Masqué de la boutique publique. Indépendant de {@link isHidden}. */
  get isHiddenPublic(): boolean {
    return this.decision.isHiddenPublic;
  }

  get isFeatured(): boolean {
    return this.decision.isFeatured;
  }

  /**
   * **Remplace les faits** par ceux d'un nouveau push.
   *
   * Rend un agrégat neuf portant la **même décision** : c'est ce qui garantit
   * qu'un push ne perd jamais un prix négocié. L'invariant n'est pas surveillé,
   * il est indisponible autrement.
   *
   * 🔴 **Et il remet l'article en vente.** Le référentiel l'envoie : il est au
   * catalogue, point. C'est ce qui rend le retrait réversible — et le prix
   * négocié le retrouve, puisque la décision traverse.
   *
   * Le repli inverse — préserver le retrait — a été écrit d'abord, et il perdait
   * la décision : le miroir ne rendant pas les retirés, un article qui revient
   * repassait par `receive`, donc sans décision, et `saveMany` supprimait
   * l'override. La sortie n'est pas de préserver le retrait ici, c'est de faire
   * lire les retirés à l'ingestion.
   */
  refreshFromPim(facts: PimFacts): CatalogItem {
    return new CatalogItem(facts, this.decision, null);
  }

  /**
   * **Retire l'article de la vente**, sans rien détruire.
   *
   * Le retrait était une SUPPRESSION, et la décision commerciale partait en
   * cascade avec l'article. Le raisonnement était juste — « un prix négocié ne
   * veut plus rien dire sans l'article qu'il tarifait » — tant que le retrait
   * est définitif. Le retour arrière le périme : rejouer une version ancienne
   * retire les SKU entrés depuis, donc détruirait les prix négociés des articles
   * les PLUS récents.
   *
   * Idempotent : retirer deux fois ne repousse pas la date. C'est la première
   * sortie qui répond à « depuis quand », et un second push ne doit pas effacer
   * cette réponse.
   *
   * ⚠️ Ne prend pas d'horloge : le domaine reste pur, et l'instant vient de
   * l'appelant qui en a un — c'est le même instant pour tout un lot.
   */
  withdraw(at: Date): void {
    if (this.withdrawnAt === null) {
      this.withdrawnAt = at;
    }
  }

  /** L'article a quitté la vente. Sa décision, elle, l'attend. */
  get isWithdrawn(): boolean {
    return this.withdrawnAt !== null;
  }

  /**
   * Pose le **prix de vente B2B**, distinct de celui du PIM.
   *
   * @throws {InvalidB2bPriceError} prix nul ou négatif.
   * @throws {RedundantB2bPriceError} prix identique à celui du PIM — le geste
   *   voulu est alors {@link alignOnPim}.
   */
  setB2bPrice(priceMillicents: number, decidedBy: string | null): void {
    if (!Number.isInteger(priceMillicents) || priceMillicents <= 0) {
      throw new InvalidB2bPriceError(priceMillicents);
    }
    if (priceMillicents === this.facts.priceMillicents) {
      throw new RedundantB2bPriceError(priceMillicents);
    }
    this.decision = { ...this.decision, priceMillicents, decidedBy };
  }

  /**
   * Retire le prix B2B : l'article **repasse au tarif du PIM**, et suivra ses
   * évolutions. C'est l'inverse de {@link setB2bPrice}, et le seul moyen de
   * revenir en arrière — d'où un nom qui dit le résultat, pas la suppression.
   */
  alignOnPim(): void {
    this.decision = { ...this.decision, priceMillicents: null };
  }

  /** Le prix public décidé ici, en centimes TTC. `null` = on suit l'étiquette. */
  get decidedPublicTtcCents(): number | null {
    return this.decision.decidedPublicTtcCents;
  }

  /**
   * Pose le **prix public**, en centimes TTC — l'étiquette que la maison
   * substitue à celle du référentiel.
   *
   * 🔴 **Ce nombre est une ENTRÉE, pas un affichage.** Il est mis hors taxe à la
   * lecture, au taux du contexte public, puis traverse le même pipeline que le
   * prix professionnel — promotions et paliers ouverts à tous s'appliquent
   * par-dessus. Ce que le rayon montre est le TTC qui en RESSORT, et il peut
   * différer d'un centime de celui-ci : l'aller-retour hors taxe ne revient pas
   * toujours sur lui-même (mesuré, `ancrage-du-ttc-pose.mjs`, et assumé —
   * Hugo, 2026-09-21).
   *
   * @throws {InvalidPublicPriceError} prix nul, négatif ou non entier.
   * @throws {RedundantPublicPriceError} prix identique à l'étiquette du PIM —
   *   le geste voulu est alors {@link alignPublicOnPim}.
   * @throws {PublicPriceWithoutContextError} le miroir ne porte aucune entrée
   *   pour ce contexte : la vitrine n'expose pas l'article, et le prix serait
   *   écrit sans jamais être servi.
   */
  setPublicPrice(ttcCents: number, publicContext: string, decidedBy: string | null): void {
    if (!Number.isInteger(ttcCents) || ttcCents <= 0) {
      throw new InvalidPublicPriceError(ttcCents);
    }
    if (this.facts.publicByContext?.[publicContext] === undefined) {
      throw new PublicPriceWithoutContextError(this.facts.sku, publicContext);
    }
    if (ttcCents === this.facts.publicTtcCents) {
      throw new RedundantPublicPriceError(ttcCents);
    }
    this.decision = { ...this.decision, decidedPublicTtcCents: ttcCents, decidedBy };
  }

  /**
   * Retire le prix public : l'article **repasse à l'étiquette du PIM**.
   * L'inverse de {@link setPublicPrice}, et sans effet sur le prix
   * professionnel — les deux audiences se décident séparément.
   */
  alignPublicOnPim(): void {
    this.decision = { ...this.decision, decidedPublicTtcCents: null };
  }

  /**
   * **Retire l'article de la vitrine B2B**, sans le retirer du PIM.
   *
   * Éteint la mise en avant au passage : les deux drapeaux ensemble diraient
   * « ne pas le montrer » et « le montrer en premier ». Corriger ici plutôt que
   * de refuser, parce que l'intention de masquer est sans ambiguïté — c'est
   * l'inverse ({@link feature} sur un masqué) qui l'est.
   */
  hide(decidedBy: string | null): void {
    this.decision = { ...this.decision, isHidden: true, isFeatured: false, decidedBy };
  }

  /** Remet l'article en vente **chez les pros**. */
  show(decidedBy: string | null): void {
    this.decision = { ...this.decision, isHidden: false, decidedBy };
  }

  /**
   * **Retire l'article de la vitrine PUBLIQUE**, sans toucher au canal pro.
   *
   * ⚠️ **Il n'éteint PAS la mise en avant**, à la différence de son voisin, et
   * ce n'est pas un oubli : `isFeatured` n'a plus d'écran de réglage et son
   * audience n'est pas tranchée. L'éteindre ici trancherait par effet de bord
   * une question que personne n'a posée. Son voisin garde le couplage parce
   * qu'il l'avait déjà — on ne l'étend pas, on ne le retire pas.
   */
  hidePublic(decidedBy: string | null): void {
    this.decision = { ...this.decision, isHiddenPublic: true, decidedBy };
  }

  /** Remet l'article en vitrine publique. */
  showPublic(decidedBy: string | null): void {
    this.decision = { ...this.decision, isHiddenPublic: false, decidedBy };
  }

  /**
   * **Met l'article en avant** dans la boutique.
   *
   * @throws {CannotFeatureHiddenItemError} l'article est masqué — sinon un
   *   commercial croirait avoir mis en vitrine un produit que personne ne voit.
   */
  feature(decidedBy: string | null): void {
    if (this.decision.isHidden) {
      throw new CannotFeatureHiddenItemError(this.facts.sku);
    }
    this.decision = { ...this.decision, isFeatured: true, decidedBy };
  }

  /** Retire la mise en avant. */
  unfeature(decidedBy: string | null): void {
    this.decision = { ...this.decision, isFeatured: false, decidedBy };
  }

  /**
   * L'état à écrire.
   *
   * `decision: null` quand plus rien n'a été décidé — l'adaptateur supprime
   * alors la ligne. Sans ça, un article ramené au prix du PIM garderait une
   * ligne de décision vide, et l'écran annoncerait une négociation qui n'existe
   * plus.
   */
  toPersistence(): CatalogItemState {
    // 🔴 **Toute décision doit figurer ici.** Un champ oublié rendrait
    // `untouched` vrai alors qu'une décision existe : l'adaptateur supprimerait
    // la ligne, et le prix disparaîtrait AU PROCHAIN PUSH du PIM — loin du
    // geste, donc loin de sa cause. C'est le mode de panne le plus coûteux de
    // cet agrégat, et aucun type ne le voit.
    const untouched =
      this.decision.priceMillicents === null &&
      this.decision.decidedPublicTtcCents === null &&
      !this.decision.isHidden &&
      !this.decision.isHiddenPublic &&
      !this.decision.isFeatured;
    return {
      facts: this.facts,
      withdrawnAt: this.withdrawnAt,
      decision: untouched ? null : this.decision,
    };
  }
}
