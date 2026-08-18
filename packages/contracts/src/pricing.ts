import { z } from "zod";

/**
 * Le vocabulaire du **prix** — cf.
 * `documentation/b2b/architecture-resolution-de-prix.md`.
 *
 * Il sert **deux publics**, et c'est pourquoi il ne s'appelle plus
 * « pricing-admin » : le staff qui saisit les règles, et le client qui lit la
 * trace figée sur sa commande. `PriceStepView` traverse les deux.
 *
 * Ce qui ne traverse jamais le fil, c'est le **calcul**. Ce qu'un écran reçoit
 * est le résultat d'une résolution faite par la fonction qui facture, jamais de
 * quoi la refaire côté navigateur : deux implémentations du prix finiraient par
 * en donner deux, et celle qu'on regarde le moins divergerait.
 */

/** Les étages, dans l'ordre où ils s'appliquent. L'ordre EST la décision. */
export const priceStageSchema = z.enum(["mercuriale", "volume", "promotion", "geste"]);
export type PriceStage = z.infer<typeof priceStageSchema>;

/**
 * Les étages qu'une règle **saisie** peut porter — l'étage `volume` en est
 * exclu, et c'est la porte fermée.
 *
 * Le volume n'est plus une règle : c'est un **barème**, une échelle entière qui
 * se pose d'un geste et qu'un agrégat refuse de laisser régresser. Tant que les
 * deux chemins coexistaient, on pouvait poser « 100+ à −5 % » en règle libre à
 * côté d'un barème accordant −10 % dès 50 : deux décisions au même étage, dont
 * aucune ne voyait l'autre, et dont la plus spécifique gagnait par accident. Le
 * barème existait précisément pour rendre ce cas impossible.
 *
 * L'étage, lui, **reste** dans {@link priceStageSchema} : le barème s'y présente
 * au moment du calcul, et toutes les traces déjà figées le nomment. Ce qui
 * disparaît, c'est la façon de l'écrire à la main — pas l'étage.
 */
export const authoredPriceStageSchema = z.enum(["mercuriale", "promotion", "geste"]);
export type AuthoredPriceStage = z.infer<typeof authoredPriceStageSchema>;

/** Ce qu'une règle vise, du plus large au plus précis. */
export const priceScopeTypeSchema = z.enum(["global", "category", "product", "variant"]);
export type PriceScopeType = z.infer<typeof priceScopeTypeSchema>;

/** Qui elle vise, du plus large au plus précis. */
export const priceAudienceTypeSchema = z.enum(["all", "segment", "company"]);
export type PriceAudienceType = z.infer<typeof priceAudienceTypeSchema>;

export const priceDirectionSchema = z.enum(["increase", "decrease"]);
export type PriceDirection = z.infer<typeof priceDirectionSchema>;

export const priceModeSchema = z.enum(["percent", "amount"]);
export type PriceMode = z.infer<typeof priceModeSchema>;

/** Étiquettes des étages, écrites une fois — l'écran ne les réinvente pas. */
export const PRICE_STAGE_LABELS: Readonly<Record<PriceStage, string>> = {
  mercuriale: "Mercuriale",
  volume: "Volume",
  promotion: "Promotion",
  geste: "Geste",
};

export const PRICE_SCOPE_LABELS: Readonly<Record<PriceScopeType, string>> = {
  global: "Tout le catalogue",
  category: "Famille",
  product: "Produit",
  variant: "Déclinaison",
};

/**
 * La portée d'une règle ou d'un plancher.
 *
 * `id` est `null` **si et seulement si** `type === 'global'`. Le serveur le
 * refuse dans les deux sens : une portée « famille » sans famille ne vise rien,
 * et une portée « tout le catalogue » qui nomme une famille dit deux choses
 * contradictoires.
 */
export const priceScopeSchema = z.object({
  type: priceScopeTypeSchema,
  id: z.string().min(1).nullable(),
});
export type PriceScopePayload = z.infer<typeof priceScopeSchema>;

export const priceAudienceSchema = z.object({
  type: priceAudienceTypeSchema,
  id: z.string().min(1).nullable(),
});
export type PriceAudiencePayload = z.infer<typeof priceAudienceSchema>;

/**
 * Ce qu'une règle **fait** au prix : elle en pose un, ou elle modifie l'entrant.
 *
 * La distinction n'est pas cosmétique. Une mercuriale saisie en « −13 % » suit
 * le tarif de liste : le jour où il augmente, le prix négocié augmente avec lui
 * — ce n'est pas ce qu'on a promis au client. Un tarif négocié est un engagement
 * en euros, il se stocke en euros.
 */
export const priceEffectSchema = z
  .discriminatedUnion("nature", [
    z.object({
      nature: z.literal("replace"),
      /** Le prix posé, HT en centimes. Zéro passe — un article offert est réel. */
      amountCents: z.number().int().nonnegative(),
    }),
    z.object({
      nature: z.literal("alter"),
      direction: priceDirectionSchema,
      mode: priceModeSchema,
      /** Points de base si `percent`, centimes si `amount`. **Toujours positif** :
       *  le signe se dit par `direction`, jamais par le nombre. */
      value: z.number().int().positive(),
    }),
  ])
  /**
   * **Une baisse en pourcentage ne dépasse pas 100 %.**
   *
   * Sans cette borne, « −150 % » se saisissait, se persistait, et rendait un
   * prix NÉGATIF au bout de la chaîne — que la ligne de commande refusait
   * ensuite : un checkout cassé pour le client, pendant que l'écran de
   * tarification affichait tranquillement « −3,00 € ».
   *
   * Portée sur l'union entière et non sur son membre : un `.refine` à
   * l'intérieur d'une union discriminée en fait un `ZodEffects`, que
   * `discriminatedUnion` refuse.
   *
   * Bornée ici et pas seulement dans l'agrégat : c'est la frontière que
   * traverse toute saisie, import et rattrapage compris.
   */
  .refine(
    (effect) => effect.nature !== "alter" || effect.mode !== "percent" || effect.value <= 10_000,
    {
      message: "Une baisse en pourcentage ne peut pas dépasser 100 % (10 000 points de base).",
      path: ["value"],
    },
  );
export type PriceEffectPayload = z.infer<typeof priceEffectSchema>;

/**
 * Créer une règle. Le serveur refuse tout ce que l'agrégat refuse.
 *
 * `stage` est l'étage **saisissable** : le volume ne s'écrit plus règle par
 * règle, il se pose en barème (cf. {@link authoredPriceStageSchema}).
 */
export const createPriceRulePayloadSchema = z.object({
  stage: authoredPriceStageSchema,
  scope: priceScopeSchema,
  audience: priceAudienceSchema,
  /** Palier de quantité. `null` = aucun seuil. */
  minQuantity: z.number().int().positive().nullable(),
  effect: priceEffectSchema,
  /** Ce que la trace affichera au client et au service client. */
  label: z.string().min(1).max(120),
  /** Borne basse **incluse**. */
  validFrom: z.string().datetime(),
  /** Borne haute **exclue**. `null` = ouverte. */
  validTo: z.string().datetime().nullable(),
  /**
   * **Cumuler par-dessus une mercuriale.**
   *
   * Une mercuriale scelle la chaîne : le tarif négocié est le prix, et les
   * étages suivants sont transparents. Cocher ceci sur une promotion dit « elle
   * vise AUSSI les comptes au tarif négocié » — donc une remise par-dessus une
   * remise déjà accordée.
   *
   * `false` par défaut, et le défaut est la décision : le cumul non voulu coûte
   * de la marge en silence, le cumul manquant se remarque au premier appel.
   */
  stacksOverMercuriale: z.boolean().default(false),
});
export type CreatePriceRulePayload = z.infer<typeof createPriceRulePayloadSchema>;

/**
 * La **condition de déverrouillage** d'un plancher dynamique.
 *
 * Deux termes, et **les deux** doivent être remplis — la plus stricte gagne. Un
 * terme absent est réputé rempli ; les deux absents feraient du plancher
 * dynamique un plancher tout court, ce que le serveur refuse.
 */
export const floorUnlockSchema = z.object({
  /** Quantité minimale **sur la commande**. `null` = pas de condition. */
  minQuantity: z.number().int().positive().nullable(),
  /**
   * Ratio de volume **observé** requis, en points de base (`12500` = ×1,25).
   * L'écran propose par défaut le ratio iso-chiffre de la baisse. `null` = pas
   * de condition.
   */
  minVolumeRatioBp: z.number().int().positive().nullable(),
});
export type FloorUnlockPayload = z.infer<typeof floorUnlockSchema>;

/** Un plancher plus bas, et la clé qui l'ouvre. */
export const dynamicFloorSchema = z.object({
  mode: priceModeSchema,
  value: z.number().int().positive(),
  unlock: floorUnlockSchema,
});
export type DynamicFloorPayload = z.infer<typeof dynamicFloorSchema>;

/**
 * Poser un plancher sur une portée. **Idempotent par portée** : re-poser
 * remplace, il n'y a jamais deux limites sur la même cible.
 *
 * `mode` / `value` décrivent le **mur** — jamais franchi, quoi qu'il arrive.
 * `dynamic` décrit la **porte** : un plancher plus bas que le volume ouvre.
 */
export const setPriceFloorPayloadSchema = z.object({
  scope: priceScopeSchema,
  mode: priceModeSchema,
  /** Points de base du **prix canonique** si `percent`, centimes si `amount`. */
  value: z.number().int().positive(),
  /** La porte, ou `null` s'il n'y en a pas. */
  dynamic: dynamicFloorSchema.nullable().default(null),
});
export type SetPriceFloorPayload = z.infer<typeof setPriceFloorPayloadSchema>;

/** Une règle telle que l'écran la lit. */
export interface PriceRuleView {
  readonly id: string;
  readonly stage: PriceStage;
  readonly scope: PriceScopePayload;
  readonly audience: PriceAudiencePayload;
  readonly minQuantity: number | null;
  readonly effect: PriceEffectPayload;
  readonly label: string;
  /**
   * Agit-elle **malgré** une mercuriale ? Cf. `createPriceRulePayloadSchema`.
   *
   * Sur l'écran, c'est ce qui distingue « promotion de rentrée » de « promotion
   * de rentrée, comptes négociés compris » — deux décisions dont l'écart se
   * mesure en marge, et qu'aucun autre champ ne laisse deviner.
   */
  readonly stacksOverMercuriale: boolean;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly createdBy: string;
  readonly createdAt: string;
  /**
   * Où en est la décision — cf. {@link ruleStatusSchema}.
   *
   * **Dérivé** des dates ci-dessous, jamais stocké : une colonne `status` aurait
   * pu contredire ce qui l'a produite, et l'écran aurait affiché « en vigueur »
   * sur une règle portant une date d'archivage.
   */
  readonly status: RuleStatus;
  /** Quand, et par qui, elle a été suspendue. `null` = elle ne l'est pas. */
  readonly pausedAt: string | null;
  readonly pausedBy: string | null;
  /** Quand, par qui, et pourquoi elle a été archivée. */
  readonly archivedAt: string | null;
  readonly archivedBy: string | null;
  readonly archiveReason: string | null;
}

/**
 * L'état d'une règle tarifaire.
 *
 * - `active` — elle s'applique quand sa fenêtre le dit ;
 * - `paused` — elle n'agit plus **et garde sa place** : la reprise ne peut donc
 *   pas échouer sur une jumelle posée entre-temps ;
 * - `archived` — terminal : elle n'agit plus et **rend sa place**.
 *
 * Rien ne s'efface. Une règle a facturé, elle a fait un prix, et la supprimer
 * effacerait l'explication d'une facture qui, elle, reste.
 */
export const ruleStatusSchema = z.enum(["active", "paused", "archived"]);
export type RuleStatus = z.infer<typeof ruleStatusSchema>;

export const RULE_STATUS_LABELS: Readonly<Record<RuleStatus, string>> = {
  active: "En vigueur",
  paused: "En pause",
  archived: "Archivée",
};

/**
 * Le **motif** d'un geste qui arrête quelque chose.
 *
 * Facultatif, délibérément : rendre le motif obligatoire produirait des « ok » et
 * des « . » — des champs remplis qui n'apprennent rien et donnent l'illusion
 * d'une traçabilité. Écrit, il l'est parce que quelqu'un avait à dire.
 */
export const pricingReasonPayloadSchema = z.object({
  reason: z.string().min(1).max(280).nullable().default(null),
});
/**
 * **Renommer une règle** — le libellé, et rien d'autre.
 *
 * Il n'y a pas de `PUT /rules/:id` qui remplacerait l'effet, la portée ou la
 * fenêtre : les changer sur une règle qui a déjà facturé réécrirait
 * l'explication de factures déjà payées. Pour cela, archiver-et-reposer, qui
 * laisse les deux décisions visibles côte à côte.
 */
export const renamePriceRulePayloadSchema = z.object({
  label: z.string().min(1).max(120),
});
export type RenamePriceRulePayload = z.infer<typeof renamePriceRulePayloadSchema>;

export type PricingReasonPayload = z.infer<typeof pricingReasonPayloadSchema>;

// ---------------------------------------------------------------------------
// Le journal — qui a posé, qui a arrêté, quand
// ---------------------------------------------------------------------------

/**
 * Ce qui peut arriver à une décision tarifaire.
 *
 * `confirmed` n'est pas un synonyme de `posed` : il dit « j'ai regardé l'écart et
 * je maintiens » — la valeur ne bouge pas, la date si. Les confondre effacerait
 * du journal la seule chose qu'on y cherche : quelqu'un a-t-il **revu** cette
 * limite, ou traîne-t-elle depuis deux ans ?
 */
export const pricingActSchema = z.enum([
  "posed",
  "paused",
  "resumed",
  "archived",
  "confirmed",
  "replaced",
  /** Le libellé a changé, **et rien d'autre** — aucun prix n'a bougé. */
  "renamed",
]);
export type PricingActKind = z.infer<typeof pricingActSchema>;

/** Ce sur quoi un acte porte : une règle, une limite, ou un barème de volume. */
export const pricingSubjectSchema = z.enum(["rule", "floor", "ladder"]);
export type PricingSubjectType = z.infer<typeof pricingSubjectSchema>;

export const PRICING_ACT_LABELS: Readonly<Record<PricingActKind, string>> = {
  posed: "Posée",
  paused: "Suspendue",
  resumed: "Reprise",
  archived: "Archivée",
  confirmed: "Confirmée",
  replaced: "Remplacée",
  renamed: "Renommée",
};

/**
 * **Un acte, tel que le journal le rend.**
 *
 * `summary` est une phrase **figée à l'écriture**, pas un rendu de l'état
 * courant : la règle peut avoir changé, avoir été archivée, ou avoir disparu du
 * vocabulaire de l'écran. Un journal qui rendrait la phrase d'aujourd'hui pour un
 * acte d'hier raconterait l'histoire à l'envers.
 */
export interface PricingJournalEntryView {
  readonly id: string;
  readonly subjectType: PricingSubjectType;
  readonly subjectId: string;
  readonly act: PricingActKind;
  /** Le `sub` du membre du staff, ou `system`. */
  readonly actor: string;
  readonly occurredAt: string;
  readonly reason: string | null;
  readonly summary: string;
}

/**
 * **L'écart entre l'intention et le tarif d'aujourd'hui.**
 *
 * Une limite est une décision, et une décision date : le beurre prend 30 %, la
 * limite reste où elle était. Ce bloc ne calcule aucune marge — il compare le
 * tarif représentatif d'aujourd'hui à celui du jour où la limite a été posée.
 *
 * `null` sur une limite en **fraction** : « jamais sous 50 % du tarif » suit le
 * tarif par construction, elle ne peut pas dériver. Et `null` aussi quand aucune
 * référence n'a été enregistrée — annoncer « 0 % d'écart » ferait passer une
 * absence de mesure pour une confirmation.
 */
export interface FloorDriftView {
  readonly referenceCanonicalCents: number;
  readonly currentCanonicalCents: number;
  /** L'écart **signé**, en points de base (`1200` = +12 %). */
  readonly driftBp: number;
  readonly ageDays: number;
  /** L'écart justifie-t-il de rouvrir la décision ? */
  readonly stale: boolean;
}

/**
 * Un plancher tel que l'écran le lit — le **mur**, et la **porte** s'il y en a
 * une.
 *
 * `mode` / `value` sont ceux du mur : c'est la limite qui vaut toujours, donc
 * celle qu'un écran affiche quand il n'en montre qu'une.
 */
export interface PriceFloorView {
  readonly id: string;
  readonly scope: PriceScopePayload;
  readonly mode: PriceMode;
  readonly value: number;
  readonly dynamic: DynamicFloorPayload | null;
  /** L'intention a-t-elle vieilli ? Cf. {@link FloorDriftView}. */
  readonly drift: FloorDriftView | null;
  readonly createdBy: string;
  readonly updatedAt: string;
}

/**
 * **Quel étage de plancher a mordu**, et sur quelles preuves — figé avec le prix.
 *
 * C'est ce qui rend le plancher dynamique tenable. Faire dépendre un prix de
 * l'historique le rendrait inexplicable dès que l'historique bouge ; la mesure
 * est donc consignée au moment où elle a compté, et ne se relit jamais.
 */
export interface FloorDecisionView {
  readonly tier: "hard" | "dynamic";
  /** Le plancher appliqué, ramené en centimes sur cet article. */
  readonly floorCents: number;
  /** Le ratio de volume mesuré à cet instant. `null` = pas de référence. */
  readonly observedVolumeRatioBp: number | null;
  /** Les deux termes de la condition, tels qu'ils ont été évalués. */
  readonly quantityMet: boolean;
  readonly volumeMet: boolean;
}

/**
 * Un étage qui a produit un effet — l'unité de la trace.
 *
 * `label` est ce que le **client** lit ; `stage` est un mot de la maison
 * (« mercuriale », « geste ») qu'on ne lui montre pas. C'est toute la raison
 * d'être du libellé : sans lui, expliquer un prix reviendrait à exposer le
 * vocabulaire interne du barème.
 */
export interface PriceStepView {
  readonly stage: PriceStage;
  readonly ruleId: string;
  readonly label: string;
  /** Le prix **au sortir** de cet étage. */
  readonly resultCents: number;
}

/**
 * Le schéma des étages, pour **relire** une trace persistée.
 *
 * Elle a été écrite en JSON par une version du code et se relit par une autre,
 * des mois plus tard : c'est la seule barrière entre les deux. Déclaré ici parce
 * que la forme et sa validation doivent vivre au même endroit — deux fichiers
 * finiraient par décrire deux formes.
 */
export const priceStepsSchema = z.array(
  z.object({
    stage: priceStageSchema,
    ruleId: z.string(),
    label: z.string(),
    resultCents: z.number().int(),
  }),
);

/**
 * L'engagement qui a décidé du palier, **et le cumul mesuré à cet instant**.
 *
 * Figé avec le prix pour la même raison que la décision de plancher : un prix
 * qui dépend de l'historique cesse d'être explicable dès que l'historique bouge.
 * Six mois plus tard, « pourquoi ce palier-là ? » n'aurait aucune réponse — le
 * cumul d'alors n'existerait plus nulle part.
 */
export interface CommitmentDecisionView {
  readonly commitmentId: string;
  readonly promisedQuantity: number;
  /** Le cumul de la période, **cette commande comprise**, au moment du calcul. */
  readonly cumulativeQuantity: number;
}

/** Le schéma de l'engagement, pour **relire** une trace persistée. */
export const commitmentDecisionSchema = z.object({
  commitmentId: z.string(),
  promisedQuantity: z.number().int(),
  cumulativeQuantity: z.number().int(),
});

/** Le schéma de la décision de plancher, pour **relire** une trace persistée. */
export const floorDecisionSchema = z.object({
  tier: z.enum(["hard", "dynamic"]),
  floorCents: z.number().int(),
  observedVolumeRatioBp: z.number().int().nullable(),
  quantityMet: z.boolean(),
  volumeMet: z.boolean(),
});

/**
 * **La trace figée sur une ligne de commande.**
 *
 * Elle répond à « pourquoi ce prix ? » six mois plus tard, quand les règles qui
 * l'ont produit peuvent avoir été retirées. C'est un **fait clos**, comme le
 * prix lui-même : on ne la recalcule jamais, on la relit.
 *
 * `ruleId` y survit à la suppression de la règle — volontairement. Le lien est
 * une piste pour le service client, pas une clé étrangère : une règle effacée ne
 * doit pas emporter l'explication d'une facture déjà payée.
 */
export interface OrderLinePricingTrace {
  /** Le prix canonique d'entrée, avant tout étage. */
  readonly basePriceCents: number;
  /** Les étages qui ont produit un effet, dans l'ordre. Vide = aucun. */
  readonly steps: readonly PriceStepView[];
  /** Le plancher a-t-il **relevé** le prix ? */
  readonly floored: boolean;
  /**
   * Quel étage de plancher s'appliquait, et sur quelles preuves. `null` quand
   * aucune limite n'était posée — ou sur une commande antérieure au plancher à
   * deux étages.
   */
  readonly floorDecision: FloorDecisionView | null;
  /**
   * L'engagement de volume qui a décidé du palier, et le cumul mesuré alors.
   * `null` = aucun engagement ne couvrait cette ligne, le palier s'est joué sur
   * la quantité de la commande.
   */
  readonly commitment: CommitmentDecisionView | null;
}

/**
 * **Ce qu'un commercial peut encore lâcher** sans franchir la limite.
 *
 * La différence entre le prix final hors geste et le plancher qui s'applique —
 * autrement dit la marge de négociation, celle qu'on peut accorder au téléphone
 * sans demander à personne.
 *
 * `null` quand **aucune limite** n'est posée : il n'y a alors pas de marge
 * définie, et afficher un nombre supposerait un plancher que personne n'a
 * décidé. Un article déjà relevé au plancher rend `0` — ce qui est une
 * information, pas une absence.
 */
export interface NegotiationRoom {
  /** Le plancher qui s'applique, ramené en centimes sur CET article. */
  readonly floorCents: number;
  /** Ce qu'on peut encore accorder, en centimes. Jamais négatif. */
  readonly maxDiscountCents: number;
  /** La même chose en points de base du prix final (`500` = 5 %). */
  readonly maxDiscountBp: number;
}

/**
 * Un article, avec tout ce qui décide de son prix — la ligne de l'écran.
 *
 * `supersededRuleIds` mérite son existence : une règle de famille et une règle
 * de produit **du même étage** ne se composent pas, la plus spécifique
 * **remplace** l'autre. Sans ce champ, l'écran afficherait deux altérations
 * l'une après l'autre et laisserait croire qu'elles s'enchaînent, alors que la
 * première n'a produit aucun effet sur cette ligne-là.
 */
export interface PricingItemView {
  readonly sku: string;
  readonly name: string;
  /** L'entrée du pipeline : le prix B2B s'il est posé, celui du PIM sinon. */
  readonly canonicalCents: number;
  /** Le plancher posé **sur cet article**, ou `null`. */
  readonly ownFloor: PriceFloorView | null;
  /**
   * Le barème de volume qui vise cet article, et ce qu'il donne palier par
   * palier. `null` quand aucun ne le vise.
   */
  readonly volumeTiers: readonly VolumeTierPriceView[] | null;
  /** Celui qui s'applique réellement — le sien, ou celui dont il hérite. */
  readonly effectiveFloor: PriceFloorView | null;
  /** Les règles qui visent cet article nommément. */
  readonly rules: readonly PriceRuleView[];
  /** Les règles de famille qu'une règle d'article évince, étage par étage. */
  readonly supersededRuleIds: readonly string[];
  /**
   * La **mercuriale** qui scelle la chaîne pour cet article, ou `null`.
   *
   * Voisin de `supersededRuleIds` et pourtant distinct : une règle évincée a
   * perdu **son étage** contre plus spécifique ; une règle scellée avait gagné
   * le sien, et c'est le tarif négocié du client qui l'écarte. Deux raisons de
   * ne pas s'appliquer, deux phrases différentes à l'écran.
   */
  readonly sealedByRuleId: string | null;
  /** Les règles qui auraient agi si la mercuriale n'avait pas scellé. */
  readonly sealedRuleIds: readonly string[];
  readonly steps: readonly PriceStepView[];
  /** Le plancher a-t-il **relevé** le prix ? */
  readonly floored: boolean;
  /**
   * La chaîne est-elle passée **sous zéro**, et le prix ramené à zéro ?
   *
   * Le cas se produit quand une baisse en euros dépasse le prix de l'article —
   * « −5 € sur le catalogue » sur un croissant à 2 €. Il ne se refuse pas à la
   * saisie (le canonique varie d'un article à l'autre), donc l'écran est le
   * SEUL endroit où on peut s'en apercevoir avant qu'un client ne commande.
   */
  readonly clampedToZero: boolean;
  readonly finalCents: number;
  /**
   * Ce que l'altération coûte en volume. `null` quand le prix n'a pas bougé —
   * il n'y a alors rien à compenser, et afficher « ×1,00 » ferait du bruit sur
   * quatre-vingt-dix lignes.
   */
  readonly elasticity: ItemElasticityView | null;
  /**
   * La remise commerciale maximale accordable — cf. {@link NegotiationRoom}.
   * `null` si aucune limite n'est posée sur cet article.
   */
  readonly negotiationRoom: NegotiationRoom | null;
}

// ---------------------------------------------------------------------------
// Le barème de volume — une échelle, pas N règles
// ---------------------------------------------------------------------------

/**
 * **Un palier** : à partir de cette quantité, cette remise.
 *
 * Le schéma sert aussi à **relire** les paliers persistés en JSON : ils ont été
 * écrits par une version du code et se relisent par une autre, des mois plus
 * tard. Déclaré ici parce que la forme et sa validation doivent vivre au même
 * endroit — deux fichiers finiraient par décrire deux formes.
 */
export const volumeTierSchema = z.object({
  /** Quantité minimale **sur la commande**. Strictement positive. */
  minQuantity: z.number().int().positive(),
  /** La remise : points de base si `percent`, centimes si `amount`. Positive. */
  value: z.number().int().positive(),
});
export type VolumeTierPayload = z.infer<typeof volumeTierSchema>;

export const volumeTiersSchema = z.array(volumeTierSchema);

/**
 * **Poser un barème de volume.**
 *
 * Une seule unité pour toute l'échelle : « 50+ à −5 %, 100+ à −0,20 € » ne se
 * compare pas sans connaître l'article, donc ne permet pas de vérifier que le
 * barème progresse. Un champ unique rend le mélange impossible, pas interdit.
 *
 * Le serveur refuse en plus ce qu'aucun palier isolé ne peut voir : une échelle
 * qui régresse (commander plus rapporterait moins), deux paliers à la même
 * quantité, une échelle vide.
 */
export const setVolumeLadderPayloadSchema = z.object({
  scope: priceScopeSchema,
  audience: priceAudienceSchema,
  unit: priceModeSchema,
  tiers: volumeTiersSchema.min(1),
  label: z.string().min(1).max(120),
  /** Borne basse **incluse**. */
  validFrom: z.string().datetime(),
  /** Borne haute **exclue**. `null` = ouverte. */
  validTo: z.string().datetime().nullable(),
});
export type SetVolumeLadderPayload = z.infer<typeof setVolumeLadderPayloadSchema>;

/**
 * Le barème, tel que l'écran le lit.
 *
 * `tiers` est **trié par quantité croissante** — le serveur le garantit, donc
 * l'écran peut l'afficher tel quel et marquer le palier atteint sans retrier.
 */
export interface VolumeLadderView {
  readonly id: string;
  readonly scope: PriceScopePayload;
  readonly audience: PriceAudiencePayload;
  readonly unit: PriceMode;
  readonly tiers: readonly VolumeTierPayload[];
  readonly label: string;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly createdBy: string;
  readonly status: RuleStatus;
}

/**
 * **Ce que le barème donne, palier par palier**, sur UN article.
 *
 * C'est la grille que le commercial lit au téléphone — « à combien je lui fais
 * les 100 ? » — et elle ne peut se calculer qu'ici : il faut le prix canonique
 * de l'article, et l'arithmétique qui facture.
 */
export interface VolumeTierPriceView {
  readonly minQuantity: number;
  /** Le prix unitaire à ce palier, tous étages passés. */
  readonly unitPriceCents: number;
  /** L'écart au tarif d'entrée, en points de base d'une baisse (`1000` = −10 %). */
  readonly discountBp: number;
}

/**
 * **Ce qui se passe quand deux décisions se recouvrent dans le temps.**
 *
 * Une promotion du 1er au 20, un geste du 15 au 30 : du 15 au 20, les deux
 * jouent. Personne ne l'a décidé — chacune a été posée pour de bonnes raisons, à
 * des semaines d'intervalle — et le client, lui, paie le cumul.
 *
 * Le calcul vient du **serveur**, avec l'arithmétique qui facture : un cumul
 * recalculé dans le navigateur finirait par annoncer un chiffre que la caisse ne
 * pratique pas.
 */
export const overlapKindSchema = z.enum(["compose", "supersede"]);
export type OverlapKind = z.infer<typeof overlapKindSchema>;

export interface PriceOverlapView {
  /** Borne basse **incluse**. */
  readonly from: string;
  /** Borne haute **exclue**. `null` = le recouvrement ne se referme jamais. */
  readonly to: string | null;
  /** Toutes les règles en vigueur sur la tranche, gagnantes comprises. */
  readonly ruleIds: readonly string[];
  /**
   * Celles qu'une **plus spécifique évince** dans leur propre étage.
   *
   * Le cas dominant sur une lignée : une promotion famille recouvre en
   * permanence une promotion catalogue, et la famille gagne. Le tableau montrait
   * déjà la barrée ; il ne disait pas à partir de quand.
   */
  readonly evictedRuleIds: readonly string[];
  /**
   * `compose` — plusieurs étages survivent : elles se composent, et le client
   * paie le produit. `supersede` — une seule survit, les autres sont évincées
   * dans leur étage. Les confondre ferait crier au cumul là où il n'y a qu'une
   * relève.
   */
  readonly kind: OverlapKind;
  /**
   * L'effet cumulé des **gagnantes**, en points de base d'une baisse
   * (`2800` = −28 %).
   *
   * Composé et non additionné : −20 % puis −10 % font −28 %, parce que la
   * seconde s'applique au prix sortant de la première. Les évincées n'y entrent
   * pas — elles ne produisent rien, et les compter afficherait un cumul que la
   * caisse ne facture pas.
   *
   * `null` dès qu'une gagnante n'est pas une altération en pourcentage : un
   * montant ne se cumule pas en fraction sans connaître l'article.
   *
   * Quand un **barème** entre dans la tranche, c'est le cumul à son **premier
   * palier** — le plus faible. Cf. {@link composedTopBp}.
   */
  readonly composedBp: number | null;
  /**
   * Le même cumul, au palier le plus **haut** du barème en jeu.
   *
   * Égal à {@link composedBp} tant qu'aucun barème ne compose : un cumul de
   * règles ne dépend pas de la quantité. Dès qu'un barème compose, il en dépend —
   * et l'écran annonce une fourchette, parce qu'un chiffre unique serait faux
   * pour toutes les quantités sauf une.
   */
  readonly composedTopBp: number | null;
}

/**
 * Un **barème posé sur la frise** — juste de quoi tracer une barre datée.
 *
 * Volontairement plus maigre que {@link VolumeLadderView} : la frise ne montre
 * pas les paliers, elle montre une période. Les prix palier par palier vivent
 * dans la colonne du prix, où ils sont **résolus** article par article — donc
 * exacts, ce qu'une frise ne peut pas être.
 */
export interface PricingLadderBandView {
  readonly id: string;
  readonly label: string;
  readonly validFrom: string;
  readonly validTo: string | null;
  /** Pour dire « 3 paliers » sans les transporter tous. */
  readonly tierCount: number;
}

/** Une famille et ses articles — la bande horizontale de l'écran. */
export interface PricingCategoryView {
  readonly id: string;
  readonly name: string;
  /** `null` = famille sans régime de TVA : ses articles ne sont pas vendables. */
  readonly vatRatePercent: number | null;
  readonly floor: PriceFloorView | null;
  readonly rules: readonly PriceRuleView[];
  /**
   * Les tranches où plusieurs règles de la **lignée** — catalogue puis famille —
   * couvrent le même instant.
   *
   * Portées par la famille et non par le catalogue, parce que le recouvrement
   * intéressant est **entre niveaux** : deux règles de même étage et même portée
   * ne peuvent pas se recouvrir (la contrainte d'exclusion l'interdit), donc une
   * frise du seul catalogue n'avait presque rien à montrer.
   */
  readonly overlaps: readonly PriceOverlapView[];
  /**
   * Les **barèmes** de la lignée — catalogue puis famille —, posés sur le même
   * axe que les règles. Sans eux, la frise se lirait « rien d'autre ne joue »
   * alors qu'un barème compose avec toute promotion en cours.
   */
  readonly ladders: readonly PricingLadderBandView[];
  readonly items: readonly PricingItemView[];
}

/**
 * Le tableau complet.
 *
 * `simulation` n'est pas décoratif : le prix montré est celui d'**un** article
 * commandé par **quelqu'un sans tarif négocié**, aujourd'hui. Les mercuriales et
 * les paliers de volume existent et ne se voient pas ici. Le taire ferait passer
 * cette colonne pour « le prix », alors qu'elle est le prix de vitrine.
 */
export interface PricingBoardView {
  readonly categories: readonly PricingCategoryView[];
  readonly globalFloor: PriceFloorView | null;
  /** Les règles de portée globale — elles s'appliquent à toutes les familles. */
  readonly globalRules: readonly PriceRuleView[];
  /**
   * **Depuis quand le tarif canonique est historisé**, en ISO — `null` si aucune
   * trace n'existe encore.
   *
   * Une lecture datée AVANT cet instant applique les décisions de ce jour-là aux
   * tarifs d'aujourd'hui : l'histoire commence quand on l'écrit, et avant elle
   * il n'y a rien. L'écran doit pouvoir le dire plutôt que de rendre un tableau
   * qui aurait l'air complet — c'est précisément le mensonge que cet historique
   * existe pour supprimer.
   */
  readonly canonicalHistoryStartsAt: string | null;
  readonly simulation: {
    readonly quantity: number;
    readonly at: string;
    readonly audience: "all";
  };
}

// ---------------------------------------------------------------------------
// Élasticité — ce qu'une altération coûte en volume
// ---------------------------------------------------------------------------

/** Une fenêtre d'observation. Borne basse incluse, borne haute exclue. */
export interface VolumeWindowView {
  readonly from: string;
  readonly to: string;
  readonly days: number;
}

/**
 * Une comparaison **volume réalisé contre objectif**, sur deux fenêtres de même
 * durée.
 *
 * `conclusive` n'est pas décoratif : quelques jours après la pose d'une règle,
 * l'écart n'a aucun sens, et l'afficher comme un résultat ferait juger une
 * décision sur du bruit. L'écran doit alors dire « trop tôt » plutôt qu'un
 * pourcentage.
 */
export interface ElasticityComparison {
  readonly baseline: VolumeWindowView;
  readonly baselineVolume: number;
  readonly observed: VolumeWindowView;
  readonly observedVolume: number;
  /** Le volume à atteindre pour tenir le chiffre. `null` = pas de référence. */
  readonly targetVolume: number | null;
  /** Où en est le réalisé vis-à-vis de l'objectif, en bp. `null` = pas d'objectif. */
  readonly attainmentBp: number | null;
  /** La fenêtre observée est-elle assez longue pour conclure ? */
  readonly conclusive: boolean;
}

/**
 * **Ce que l'altération d'un article coûte en volume.**
 *
 * Attachée à l'ARTICLE et non à la règle, parce que c'est là que le prix et le
 * volume existent tous les deux sans ambiguïté : une règle de famille exprimée
 * en euros n'implique pas le même ratio sur un croissant et sur une pièce
 * montée. Une règle en pourcentage, elle, porte son ratio intrinsèquement —
 * l'écran l'affiche alors sur le nœud de la règle aussi.
 */
export interface ItemElasticityView {
  readonly fromCents: number;
  readonly toCents: number;
  /** Le volume qu'il faut vendre pour le même chiffre, en bp (`12500` = ×1,25). */
  readonly isoRevenueRatioBp: number | null;
  /**
   * Avant / après le **changement de prix** — la seule comparaison qui juge la
   * règle. `null` quand rien n'a changé, ou quand la date du changement est
   * inconnue.
   */
  readonly sinceChange: ElasticityComparison | null;
  /** Fenêtre glissante — où on en est aujourd'hui, indépendamment de la règle. */
  readonly rolling: ElasticityComparison;
}

/**
 * **Un article vu de deux instants**, et ce qui a bougé entre les deux.
 *
 * Le prix vient de la résolution — la fonction qui facture — appelée à chacune
 * des deux dates. Le volume vient des commandes réelles sur la fenêtre qui les
 * sépare, comparé à la fenêtre **miroir** juste avant, de même durée : comparer
 * trente jours à quatre-vingt-dix ferait passer une saison pour un effet.
 */
export interface PricingComparisonItemView {
  readonly sku: string;
  readonly name: string;
  readonly categoryId: string;
  readonly categoryName: string;
  /** Le prix résolu au premier marqueur, puis au second. HT, en centimes. */
  readonly fromCents: number;
  readonly toCents: number;
  /**
   * Les **paliers de volume** à chaque marqueur, ou `null` s'il n'y a pas de
   * barème ce jour-là.
   *
   * Des deux côtés, parce qu'un barème naît, change et s'arrête comme le reste :
   * ne montrer que ceux d'aujourd'hui ferait lire une baisse de prix unitaire
   * sans voir que le barème qui l'accompagnait a disparu.
   *
   * Ils ne coûtent aucune lecture de plus : la comparaison lit déjà les deux
   * catalogues, et les paliers y sont — chacun étant une résolution complète à la
   * quantité de son palier.
   */
  readonly fromTiers: readonly VolumeTierPriceView[] | null;
  readonly toTiers: readonly VolumeTierPriceView[] | null;
  /** L'écart de prix en points de base (`-1500` = −15 %). `null` si le premier vaut zéro. */
  readonly priceVariationBp: number | null;
  /** Les pièces vendues sur la fenêtre, puis sur la fenêtre miroir d'avant. */
  readonly volume: number;
  readonly previousVolume: number;
  /** `null` quand la fenêtre miroir n'a rien vendu : ce n'est pas une variation. */
  readonly volumeVariationBp: number | null;
}

/**
 * **Deux marqueurs, et tout ce qui les sépare.**
 *
 * Ce que cette vue dit : quelles décisions étaient en vigueur à chaque instant,
 * et ce que le catalogue valait sous elles. Ce qu'elle **ne dit pas** : le prix
 * facturé ce jour-là. Le tarif canonique vient du PIM au présent — il n'est pas
 * historisé — donc une lecture passée applique les décisions d'hier aux tarifs
 * d'aujourd'hui. La vérité de ce qui a été facturé vit sur les lignes de
 * commande, figée à la passation.
 */
export interface PricingComparisonView {
  /** Les deux marqueurs, bornes de la fenêtre observée. */
  readonly from: string;
  readonly to: string;
  /** La fenêtre miroir, celle d'avant — même durée. */
  readonly previousFrom: string;
  readonly days: number;
  /** Combien d'articles ont changé de prix entre les deux instants. */
  readonly changedCount: number;
  readonly items: readonly PricingComparisonItemView[];
}

/**
 * **L'engagement de volume** — un client promet un volume sur une période, et
 * le barème se juge alors sur le **cumul** de la période au lieu de la quantité
 * de chaque commande.
 *
 * C'est la forme retenue le 2026-08-18, contre le prix fixe daté, et le motif
 * est entièrement dans les **conditions de sortie**. Au volume promis, les deux
 * formes donnent le même prix ; elles divergent quand la promesse n'est pas
 * tenue. Un prix fixe n'a alors aucune réponse arithmétique : il faut une
 * clause, et un rattrapage facturé rétroactivement — donc réécrire l'explication
 * de factures déjà payées, ce que la trace figée interdit précisément. Le cumul,
 * lui, laisse le client au palier qu'il a **réellement atteint** : chaque
 * facture reste juste au moment où elle est émise, et rien n'est jamais révisé.
 *
 * Ce que l'engagement **n'est pas** : une réservation. Rien n'est bloqué, rien
 * n'est dû. Il déclare une période et un volume visé ; le prix, lui, ne dépend
 * que de ce qui a été commandé.
 */
export const createVolumeCommitmentPayloadSchema = z.object({
  companyId: z.string().min(1),
  scope: priceScopeSchema,
  /** Le volume visé sur la période. Sert à l'écran, jamais au calcul. */
  promisedQuantity: z.number().int().positive(),
  /** Borne basse **incluse**. */
  validFrom: z.string().datetime(),
  /**
   * Borne haute **exclue**, et **obligatoire** : un engagement sans terme est
   * une mercuriale, qui a son propre étage. C'est la période qui donne un sens
   * au cumul — sans elle, il n'y a rien à cumuler sur quoi que ce soit.
   */
  validTo: z.string().datetime(),
});
export type CreateVolumeCommitmentPayload = z.infer<typeof createVolumeCommitmentPayloadSchema>;

/** Un engagement, tel que l'écran le lit. */
export interface VolumeCommitmentView {
  readonly id: string;
  readonly companyId: string;
  readonly scope: PriceScopePayload;
  readonly promisedQuantity: number;
  readonly validFrom: string;
  readonly validTo: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly archivedAt: string | null;
  readonly archivedBy: string | null;
  readonly archiveReason: string | null;
  /**
   * Le volume **déjà commandé** sur la période, à l'instant de la lecture.
   *
   * Mesuré, jamais promis : c'est lui qui décide du palier, et l'écart avec
   * `promisedQuantity` est toute l'information que le suivi apporte.
   */
  readonly orderedQuantity: number;
}

/**
 * **La projection de prix** — ce que coûterait l'article à des niveaux de cumul
 * qui n'existent pas encore.
 *
 * C'est ce qui rend le devis temporel possible sans rien inventer : plutôt que
 * de rejouer côté écran la règle « le plus haut palier atteint gagne », on
 * demande au serveur de RÉSOUDRE à chaque niveau de cumul. Chaque point rendu
 * est donc un prix produit par la fonction qui facture, exactement comme si le
 * client y était.
 *
 * `cumulativeQuantities` sont des niveaux de **cumul**, pas des quantités de
 * commande : c'est la mesure sur laquelle l'étage volume se juge sous
 * engagement.
 */
export const priceProjectionPayloadSchema = z.object({
  /** `null` = client de passage : seules les règles ouvertes à tous jouent. */
  companyId: z.string().nullable(),
  sku: z.string().min(1),
  /**
   * Bornée à vingt-quatre : chaque niveau est une résolution complète, et une
   * projection sur trois scénarios de douze échéances en fait déjà trente-six.
   * La borne dit non plutôt que de rendre une réponse tronquée sans le dire.
   */
  cumulativeQuantities: z.array(z.number().int().positive()).min(1).max(24),
});
export type PriceProjectionPayload = z.infer<typeof priceProjectionPayloadSchema>;

/** Un niveau de cumul, et le prix qu'il donne. */
export interface PriceProjectionPointView {
  readonly cumulativeQuantity: number;
  /** Le tarif d'entrée, avant tout étage. */
  readonly canonicalCents: number;
  /** Le prix unitaire **résolu** à ce niveau de cumul. */
  readonly unitPriceCents: number;
  readonly steps: readonly PriceStepView[];
  readonly floored: boolean;
}

export interface PriceProjectionView {
  readonly productName: string;
  readonly points: readonly PriceProjectionPointView[];
}
