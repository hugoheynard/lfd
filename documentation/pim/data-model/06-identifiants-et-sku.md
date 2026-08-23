# 06 — Identifiants & SKU

> Ce que le catalogue appelle « une référence », et qui a le droit d'en émettre. Réécriture après
> revue adversariale de la proposition archivée dans
> [`_sources/sku-module-nestjs-doc.md`](./_sources/sku-module-nestjs-doc.md) — dont la notion centrale
> (« un SKU par canal ») est une **erreur de catégorie**.

## 1. Quatre identifiants, quatre natures

La confusion vient de ce qu'on les appelle tous « la référence ».

|                     | Qui l'émet                                  | Portée          | Change ?          | Rôle                                       |
| ------------------- | ------------------------------------------- | --------------- | ----------------- | ------------------------------------------ |
| **`id`** (UUID v7)  | **nous**, à la commande (R1)                | interne         | **jamais**        | **La** clé de jointure, partout            |
| **`sku`**           | **nous**                                    | notre catalogue | oui, par un verbe | Ce qu'un **humain** lit et dit             |
| **Référence canal** | **le canal**, ou nous si le canal l'accepte | ce canal        | selon le canal    | Ce que **ce système-là** appelle l'article |
| **GTIN / EAN-13**   | **GS1** (organisme)                         | **mondiale**    | jamais            | Identifiant de l'article commercial        |

Deux règles en découlent, et elles suffisent à trancher la plupart des débats :

> **La jointure se fait toujours sur l'`id`, jamais sur le `sku`.** C'est le seul point que la
> proposition d'origine avait parfaitement juste, et il faut le garder tel quel.

> **Rien ne _parse_ jamais un SKU.** Le jour où un bout de code lit le début d'une référence pour en
> déduire la famille, la famille a deux sources de vérité et le SKU devient non modifiable. Le SKU est
> un **libellé**, pas une structure de données. Depuis que le défaut est **opaque** (§4), la tentation
> a disparu : il n'y a plus rien à y lire.

## 2. Pourquoi « un SKU par canal » est faux

La proposition modélisait `Sku = (variantUuid, channel, value)` avec
`channel ∈ {shopify, caisse, ean13}`. Quatre objections, par ordre de gravité.

**a. Ce n'est pas ce qu'est un SKU.** _Stock Keeping Unit_ : la référence **du commerçant**, pour
son propre usage. Elle est par définition **unique et unique tout court** — c'est le mot que le
boulanger prononce en désignant l'article. Un SKU qui change selon l'interlocuteur ne remplit plus
sa fonction : le référentiel commun qu'on cherche à construire disparaît.

**b. `ean13` n'est pas un canal.** C'est un identifiant **mondial** émis par GS1, attaché à l'article
commercial et non à un système. Le mettre sur le même axe que « Shopify » range un organisme de
normalisation à côté d'un logiciel. La proposition le remarque elle-même en §13 — puis l'embarque
quand même.

**c. `channel: 'shopify' | 'caisse'` dans le domaine viole [ADR-13](../adr.md#adr-13--composition-par-tables-satellites-canaux-au-bord).**
Une énumération de canaux au cœur du catalogue, c'est le vocabulaire des systèmes tiers dans le
domaine. Test d'ADR-13 : _si on supprimait le module Shopify, le catalogue compilerait-il encore ?_
Ici — **non**, l'enum ne compile plus.

**d. Ça duplique les tables de binding déjà conçues.** `helios_variant_binding.plu` et
`shopify_variant_binding` existent déjà en [`04`](./04-composition-et-canaux.md) et font ce travail,
**du bon côté de la frontière**.

### Et pourtant l'exigence « unicité par canal » est légitime

Elle l'est, et elle est **mieux servie** par les tables de binding : chaque table **est** un canal,
donc un index unique sur sa colonne **est** une unicité par canal — sans jamais nommer un canal dans
le domaine. Voir §6.

## 3. Le `Sku` est un _value object_, pas un module

La proposition en faisait un module Nest avec entité, service, contrôleur et `POST /skus`. Trois
problèmes :

- **Un SKU n'a pas de cycle de vie propre** : il ne naît, ne vit et ne meurt qu'avec la déclinaison
  qui le porte. Ce n'est donc pas une entité, encore moins un agrégat — c'est un **value object**
  du module `catalogue`.
- **`POST /skus` est une API en forme de table.** On ne « crée un SKU » jamais dans la vraie vie : on
  crée un produit, on ajoute une déclinaison, on corrige une référence. C'est la règle **R2**
  ([`00`](./00-langage-et-comportement.md#5--les-trois-règles-irréversibles)) : les verbes existants
  (`CreateProduct`, `AddVariant`, `ChangeVariantSku`) portent déjà le SKU. Un endpoint séparé
  ouvrirait un **second chemin d'écriture** sur la même donnée.
- **La validation était dans un DTO Zod, pas dans le domaine.** Le service faisait confiance au pipe.
  Le jour où un import CSV, un seed ou une migration construit un SKU sans passer par HTTP,
  l'invariant n'existe plus. Notre convention est l'inverse : _les entités garantissent leurs
  invariants ; les contrôleurs ne revalident pas ce qui est déjà garanti_.

```ts
// catalogue/domain/value-objects/sku.value-object.ts
const PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const MIN_LENGTH = 3;
const MAX_LENGTH = 32;

export class Sku {
  private constructor(public readonly value: string) {}

  /** Seul point de construction : un `Sku` mal formé ne peut pas exister en mémoire. */
  static create(raw: string): Sku {
    const normalized = Sku.normalize(raw);
    if (normalized.length < MIN_LENGTH || normalized.length > MAX_LENGTH) {
      throw new InvalidSkuError(raw, `longueur ${MIN_LENGTH}–${MAX_LENGTH}`);
    }
    if (!PATTERN.test(normalized)) {
      throw new InvalidSkuError(raw, "lettres, chiffres et tirets");
    }
    return new Sku(normalized);
  }

  /** Idempotente : `normalize(normalize(x)) === normalize(x)`. */
  static normalize(raw: string): string {
    return raw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/gu, "") // diacritiques : « crème » → « creme »
      .toUpperCase()
      .replace(/[^A-Z0-9]+/gu, "-") // tout séparateur devient un tiret
      .replace(/^-+|-+$/gu, "");
  }

  equals(other: Sku): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
```

Le charset `A-Z 0-9 -` n'est pas une préférence esthétique : c'est l'intersection sûre de tout ce
qui traversera la chaîne — champs Shopify, écrans de caisse, exports CSV, noms de fichiers,
étiquettes imprimées, URL. Les accents et les espaces y cassent quelque chose tôt ou tard.

> **Ce que la normalisation achète, au-delà du confort** : puisque `create()` est le **seul**
> constructeur et qu'il met en majuscules, la valeur stockée est _toujours_ normalisée. Un index
> unique ordinaire suffit alors à garantir l'unicité **insensible à la casse** — pas besoin d'index
> fonctionnel sur `upper(sku)`. La proposition d'origine, elle, normalisait dans un `.transform()`
> Zod : `ecl-01` importé hors HTTP cohabitait tranquillement avec `ECL-01`.

## 4. Le SKU par défaut — la pratique courante

### Le débat, re-tranché le 2026-08-23

Deux écoles s'affrontent depuis toujours : le **SKU signifiant** (`VIEN-CROISSANT-BEURRE`) et le
**SKU muet** (`100472`). Le muet ne ment jamais et ne se périme pas ; le signifiant se lit.

Ce document avait tranché pour le **signifiant**, sur un argument d'usage : le SKU sera lu à voix
haute au labo, cherché sur un écran de caisse à 6h, imprimé sur une feuille de production. Le risque
(l'information se périme) était réputé neutralisé par la règle du §1 — rien ne parse le SKU, il peut
donc mentir sans conséquence _technique_.

**C'est l'inversion qui a fait rouvrir le débat.** Cette règle protège le code ; elle ne protège pas
l'humain qui lit la référence — or c'était précisément _pour lui_ que le signifiant avait été choisi.
`{FAMILLE}-{PRODUIT}` dérivait la référence de deux valeurs **éditoriales et mutables**, puis la
figeait : reclasser un produit laissait sa référence annoncer `VIEN` pour toujours. Un affichage qui
affirme avec aplomb quelque chose de faux, exactement ce que le §1 interdit au code de croire.

Et l'argument d'usage penche en fait dans **l'autre sens**. Six caractères tirés d'un alphabet sans
caractères ambigus se dictent au téléphone et se relisent sur une feuille de production mieux que
`PATI-TARTE-FRAISE-6P`, qui est long, contient des `O` et des `I`, et s'épelle. Quant à « chercher sur
un écran de caisse » : on cherche un produit **par son nom**, pas par sa référence.

**Le muet gagne donc**, et il n'a rien coûté : le motif existait déjà, éprouvé, sur la référence
société `C-XXXXXX`.

### Le format retenu

```
P-XXXXXX      le produit
P-XXXXXX-{N}  ses déclinaisons, par rang
```

| Segment  | Source                                 | Règle                                                                                              |
| -------- | -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `P`      | —                                      | préfixe fixe, ce que `C-` est à un client                                                          |
| `XXXXXX` | queue d'un identifiant frais (UUID v7) | 6 symboles sur l'alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — ni `I`, ni `O`, ni `0`, ni `1`      |
| `N`      | rang de la déclinaison                 | `-1`, `-2`… — jamais absent : sans lui, la déclinaison par défaut viserait la référence du produit |

```
P-K7M3QT      croissant au beurre
P-K7M3QT-1    …sa déclinaison par défaut
P-K7M3QT-2    …son carton de 50
```

**Pourquoi la _queue_ de l'identifiant** : le préfixe d'un UUID v7 est son **horodatage**. Le lire
donnerait des références voisines à deux produits créés la même milliseconde — la partie aléatoire est
en fin de chaîne. 12 chiffres hexadécimaux (48 bits) en entrée, 30 consommés : 2⁴⁸ étant un multiple de
2³⁰, la troncature reste **uniforme**, sans biais de modulo. 6 symboles ≈ 33 millions de combinaisons.

Le SKU de déclinaison **préfixe** celui du produit : le tri alphabétique reste utile et deux
déclinaisons du même produit se reconnaissent d'un coup d'œil sur un bon de commande.

> **Le format imposé par un tiers n'a pas disparu du problème** — il a changé de place. Un canal qui
> ne peut pas accepter notre référence (PLU numérique de caisse) la porte dans la colonne
> `channel_reference` de **sa** table de binding (§6), et la saisie manuelle reste ouverte à la
> création : reprise d'un ancien catalogue, référence fournisseur, format contractuel.

> **Aucune migration.** Rien ne parse un SKU et aucune référence existante ne change : les produits
> déjà créés gardent la leur, seuls les suivants naissent sous la nouvelle forme.

### Quatre règles d'usage

1. **Proposé, jamais imposé.** La commande calcule un défaut, l'utilisateur peut l'écraser à la
   saisie. Un SKU auto-généré qu'on ne peut pas corriger est plus hostile qu'un champ vide.
2. **Calculé une seule fois, à la création.** Renommer un produit ne renomme **pas** son SKU. Sinon
   la référence bouge sous les pieds de tout le monde à chaque retouche éditoriale.
3. **Collision → jamais un hash.** Pour le **produit**, on **re-tire** un identifiant frais :
   suffixer donnerait `P-XXXXXX-2`, qui se lirait comme la déclinaison n° 2 d'un autre produit — une
   référence qui ment sur ce qu'elle désigne. Pour la **déclinaison**, dont la racine est imposée par
   son produit, on suffixe (`-2`, `-3`) : lisible et prononçable. Les deux boucles sont bornées
   (10 tentatives) et échouent franchement au-delà.
4. **Le défaut n'est pas une garantie d'unicité** — seule la base l'est (§5). Le générateur _propose_
   en évitant les collisions connues ; il ne les _exclut_ pas.

```ts
// catalogue/domain/services/sku-generator.ts — pur, testable sans Nest
export interface SkuAvailability {
  isTaken(candidate: Sku): Promise<boolean>;
}

/** `0192f3…a7b91c` → `P-K7M3QT`. Déterministe : même identifiant, même référence. */
export function productSkuRoot(id: string): string;

/** Collision → re-tirage, jamais un suffixe (cf. règle 3). */
export async function proposeProductSku(
  draw: () => string,
  availability: SkuAvailability,
): Promise<Sku>;

/** Racine d'une déclinaison : la référence du produit, suffixée par son rang. */
export function variantSkuRoot(productSku: Sku, position: number): string;
```

> Le générateur dépend d'un **port** (`SkuAvailability`), pas d'un dépôt : le domaine reste pur et
> le test n'a besoin ni de base ni de framework.

## 5. L'unicité globale : trois couches, une seule garantie

C'est le point où la proposition d'origine était à la fois juste et incomplète.

| Couche                       | Ce qu'elle apporte                                     | Ce qu'elle **ne** garantit **pas**                        |
| ---------------------------- | ------------------------------------------------------ | --------------------------------------------------------- |
| **Value object**             | la **forme** — un SKU invalide n'existe pas en mémoire | rien sur l'unicité                                        |
| **Vérification en commande** | un **message clair** (« déjà utilisé par _Tarte 8P_ ») | rien : deux requêtes concurrentes passent toutes les deux |
| **Index unique en base**     | **la garantie**, la seule                              | un message utilisable tel quel                            |

Les trois sont nécessaires, et il faut savoir **pourquoi** on garde la deuxième alors qu'elle ne
garantit rien : elle existe pour l'**ergonomie**, pas pour la sûreté. C'est un cas de
_time-of-check / time-of-use_ assumé — on l'écrit dans le code pour que personne ne « simplifie » en
la supprimant, ni ne s'y fie.

**Traduction de la violation** : la proposition attrapait le code `23505` **dans le service** et
levait un `ConflictException` HTTP. Deux fuites — l'infrastructure Postgres et le vocabulaire HTTP
remontent dans l'application. Chez nous, l'**adaptateur de dépôt** traduit `23505` en
`SkuAlreadyUsedError` (une `BusinessError` du domaine) ; c'est le filtre d'exceptions, à la frontière
HTTP, qui décide que ça vaut un **409**.

## 6. L'unicité **par canal** : où elle vit réellement

C'est ton exigence, et elle est satisfaite — mais du bon côté de la frontière.

| Canal     | Table (possédée par l'adaptateur) | Colonne       | Contrainte |
| --------- | --------------------------------- | ------------- | ---------- |
| Shopify   | `shopify_variant_binding`         | `shopify_sku` | `UNIQUE`   |
| Caisse PI | `helios_variant_binding`          | `plu`         | `UNIQUE`   |

**Chaque table _est_ un canal** — un index unique sur sa colonne **est** une unicité par canal. Aucun
enum de canal, aucune colonne discriminante, aucune ligne de code du domaine à toucher pour en
ajouter un.

Et le cas nominal se passe de tout ça :

> **Par défaut, la référence canal est le SKU lui-même.** La colonne reste `NULL`, et l'adaptateur
> pousse le SKU interne. Elle n'est renseignée **que** si le canal ne peut pas l'accepter — typiquement
> un PLU de caisse contraint au numérique. Postgres autorisant plusieurs `NULL` dans un index unique,
> la contrainte cohabite naturellement avec le cas nominal.

Deux corollaires :

- **Un même SKU ne peut pas désigner deux articles sur un canal** — c'est la garantie demandée.
- **Deux canaux peuvent porter la même valeur** pour la même déclinaison sans conflit, puisque les
  contraintes sont dans des tables distinctes.

## 7. Ce qu'on ne fait pas

**Le GTIN / EAN-13 est descopé** ([ADR-14](../adr.md#adr-14--couche-logistique-descopée-de-la-v1)).
Trois raisons, dans l'ordre :

1. La quasi-totalité des articles d'une boulangerie est vendue **non préemballée** et n'a donc aucun
   GTIN.
2. Les codes EAN-13 valides **s'achètent** auprès de GS1 : on ne les invente pas. Le seul usage
   légitime hors adhésion est la plage **réservée à l'usage interne** (préfixes `02` / `20`–`29`), qui
   ne sort pas du magasin — c'est un besoin de **caisse**, pas de catalogue.
3. Le code-barres est une contrainte de la caisse : sa place est dans `helios_variant_binding`, quand
   **D4** aura tranché.

La fonction de contrôle du **checksum EAN-13** de la proposition d'origine est correcte et vaut
d'être reprise **telle quelle** le jour venu — c'est le seul de ses formats objectivement fondé.

> ⚠️ Les autres contraintes de la proposition (`16` caractères pour Shopify, `6` chiffres pour la
> caisse) sont **affirmées sans source**. La règle caisse est explicitement marquée « à confirmer » ;
> la règle Shopify ne l'est pas et paraît tout aussi inventée. **À vérifier avant tout usage** — c'est
> exactement le genre de constante qui traverse un projet entier sans que personne ne la questionne.

## 8. Partage front / back

La proposition affirmait « une source unique alimente la validation back **et** l'aide à la saisie
front ». C'est faux dès que le front est une app séparée qui parle à l'API : le registre contient une
`RegExp` et des **fonctions** (`normalize`, `extraCheck`) — **rien de tout ça ne traverse JSON**.

Le partage réel se fait à la **compilation**, pas au runtime :

| Quoi                                 | Où                      | Pourquoi                                                                        |
| ------------------------------------ | ----------------------- | ------------------------------------------------------------------------------- |
| Motif, longueurs, `normalize`        | `packages/shared-types` | Importé _littéralement_ par les deux — une seule définition, vérifiée par `tsc` |
| Libellés, exemples, aide à la saisie | **front**               | Ce sont des **textes d'interface**, ils n'ont rien à faire dans le domaine      |

Le front **guide**, le back **valide**, la base **garantit** — la règle d'or de la proposition était
juste ; c'est son implémentation qui ne tenait pas.

## 9. Invariants figés

1. `sku` **unique** dans un espace de noms **global** (produits et déclinaisons confondus).
2. Un `Sku` n'existe que **normalisé et valide** — un seul constructeur, `Sku.create()`.
3. Le `sku` est **modifiable** par un verbe explicite (`ChangeProductSku`, `ChangeVariantSku`) ; les
   canaux bindent sur l'**`id`**, jamais sur lui.
4. **Rien ne parse un SKU** pour en déduire une information métier.
5. La référence d'un canal est **unique au sein de ce canal** ; `NULL` = « le SKU interne est poussé
   tel quel ».
6. Un SKU par défaut est **proposé** à la création, **calculé une seule fois**, et **modifiable**.

## 10. Points ouverts

1. **Faut-il un SKU sur le `Product` ?** Il n'est pas vendable, donc jamais poussé nulle part — sa
   seule fonction est de servir de **préfixe** aux déclinaisons. Alternative : ne garder que le SKU
   de déclinaison et calculer le préfixe à la volée. Trancher avant le schéma Prisma.
2. **Longueur maximale** : 32 est confortable côté catalogue, mais l'écran de caisse aura son propre
   plafond (D4). S'il est plus court, la référence canal prendra le relais — ce que le modèle prévoit
   déjà.
3. **Réutilisation d'un SKU libéré** : quand une déclinaison est retirée de la vente (R3 : jamais
   supprimée), son SKU reste pris. Faut-il pouvoir le recycler ? Recommandation : **non** — un SKU
   réutilisé pointe vers deux articles différents dans l'historique des ventes.
