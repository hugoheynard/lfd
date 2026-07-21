# 06 — Identifiants & SKU

> Ce que le catalogue appelle « une référence », et qui a le droit d'en émettre. Réécriture après
> revue adversariale de la proposition archivée dans
> [`_sources/sku-module-nestjs-doc.md`](./_sources/sku-module-nestjs-doc.md) — dont la notion centrale
> (« un SKU par canal ») est une **erreur de catégorie**.

## 1. Quatre identifiants, quatre natures

La confusion vient de ce qu'on les appelle tous « la référence ».

| | Qui l'émet | Portée | Change ? | Rôle |
|---|---|---|---|---|
| **`id`** (UUID v7) | **nous**, à la commande (R1) | interne | **jamais** | **La** clé de jointure, partout |
| **`sku`** | **nous** | notre catalogue | oui, par un verbe | Ce qu'un **humain** lit et dit |
| **Référence canal** | **le canal**, ou nous si le canal l'accepte | ce canal | selon le canal | Ce que **ce système-là** appelle l'article |
| **GTIN / EAN-13** | **GS1** (organisme) | **mondiale** | jamais | Identifiant de l'article commercial |

Deux règles en découlent, et elles suffisent à trancher la plupart des débats :

> **La jointure se fait toujours sur l'`id`, jamais sur le `sku`.** C'est le seul point que la
> proposition d'origine avait parfaitement juste, et il faut le garder tel quel.

> **Rien ne *parse* jamais un SKU.** Le jour où un bout de code lit `VIEN-…` pour en déduire la
> famille, la famille a deux sources de vérité et le SKU devient non modifiable. Le SKU est un
> **libellé**, pas une structure de données.

## 2. Pourquoi « un SKU par canal » est faux

La proposition modélisait `Sku = (variantUuid, channel, value)` avec
`channel ∈ {shopify, caisse, ean13}`. Quatre objections, par ordre de gravité.

**a. Ce n'est pas ce qu'est un SKU.** *Stock Keeping Unit* : la référence **du commerçant**, pour
son propre usage. Elle est par définition **unique et unique tout court** — c'est le mot que le
boulanger prononce en désignant l'article. Un SKU qui change selon l'interlocuteur ne remplit plus
sa fonction : le référentiel commun qu'on cherche à construire disparaît.

**b. `ean13` n'est pas un canal.** C'est un identifiant **mondial** émis par GS1, attaché à l'article
commercial et non à un système. Le mettre sur le même axe que « Shopify » range un organisme de
normalisation à côté d'un logiciel. La proposition le remarque elle-même en §13 — puis l'embarque
quand même.

**c. `channel: 'shopify' | 'caisse'` dans le domaine viole [ADR-13](../adr.md#adr-13--composition-par-tables-satellites-canaux-au-bord).**
Une énumération de canaux au cœur du catalogue, c'est le vocabulaire des systèmes tiers dans le
domaine. Test d'ADR-13 : *si on supprimait le module Shopify, le catalogue compilerait-il encore ?*
Ici — **non**, l'enum ne compile plus.

**d. Ça duplique les tables de binding déjà conçues.** `helios_variant_binding.plu` et
`shopify_variant_binding` existent déjà en [`04`](./04-composition-et-canaux.md) et font ce travail,
**du bon côté de la frontière**.

### Et pourtant l'exigence « unicité par canal » est légitime

Elle l'est, et elle est **mieux servie** par les tables de binding : chaque table **est** un canal,
donc un index unique sur sa colonne **est** une unicité par canal — sans jamais nommer un canal dans
le domaine. Voir §6.

## 3. Le `Sku` est un *value object*, pas un module

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
  l'invariant n'existe plus. Notre convention est l'inverse : *les entités garantissent leurs
  invariants ; les contrôleurs ne revalident pas ce qui est déjà garanti*.

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
      throw new InvalidSkuError(raw, 'lettres, chiffres et tirets');
    }
    return new Sku(normalized);
  }

  /** Idempotente : `normalize(normalize(x)) === normalize(x)`. */
  static normalize(raw: string): string {
    return raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/gu, '') // diacritiques : « crème » → « creme »
      .toUpperCase()
      .replace(/[^A-Z0-9]+/gu, '-') // tout séparateur devient un tiret
      .replace(/^-+|-+$/gu, '');
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
> constructeur et qu'il met en majuscules, la valeur stockée est *toujours* normalisée. Un index
> unique ordinaire suffit alors à garantir l'unicité **insensible à la casse** — pas besoin d'index
> fonctionnel sur `upper(sku)`. La proposition d'origine, elle, normalisait dans un `.transform()`
> Zod : `ecl-01` importé hors HTTP cohabitait tranquillement avec `ECL-01`.

## 4. Le SKU par défaut — la pratique courante

### Le débat, tranché

Deux écoles s'affrontent depuis toujours : le **SKU signifiant** (`VIEN-CROISSANT-BEURRE`) et le
**SKU muet** (`100472`). Le muet ne ment jamais et ne se périme pas ; le signifiant se lit.

Pour une boulangerie, **le signifiant gagne** — parce que le SKU sera lu à voix haute au labo, cherché
sur un écran de caisse à 6h, imprimé sur une feuille de production. Un identifiant qu'aucun humain ne
peut reconnaître se paie tous les jours.

Le risque du signifiant (l'information se périme : un produit change de famille, le SKU ment) est
neutralisé par la règle du §1 : **rien ne parse le SKU**. Il peut donc mentir sans conséquence
technique — c'est un mnémonique, pas une donnée.

### Le format retenu

```
{FAMILLE}-{PRODUIT}[-{DÉCLINAISON}][-{N}]
```

| Segment | Source | Règle |
|---|---|---|
| `FAMILLE` | slug de la famille | 4 premiers caractères — `viennoiseries` → `VIEN` |
| `PRODUIT` | slug du nom `fr` | mots vides retirés (`de`, `du`, `la`, `aux`, `et`…), 2 mots max, 6 caractères par mot — `tarte-aux-fraises` → `TARTE-FRAISE` |
| `DÉCLINAISON` | `options` | initiales + chiffres — `{ taille: "6 pers" }` → `6P`. Absent sur la déclinaison par défaut d'un produit sans options |
| `N` | — | **suffixe de collision** uniquement : `-2`, `-3`… |

```
VIEN-CROISS              croissant au beurre (déclinaison unique)
PATI-TARTE-FRAISE        tarte aux fraises, déclinaison par défaut
PATI-TARTE-FRAISE-6P     …déclinée 6 personnes
PATI-TARTE-FRAISE-8P     …déclinée 8 personnes
```

Le SKU de déclinaison **préfixe** celui du produit : c'est la convention de fait (parent SKU + suffixe),
elle rend le tri alphabétique utile et regroupe visuellement une famille de déclinaisons.

### Quatre règles d'usage

1. **Proposé, jamais imposé.** La commande calcule un défaut, l'utilisateur peut l'écraser à la
   saisie. Un SKU auto-généré qu'on ne peut pas corriger est plus hostile qu'un champ vide.
2. **Calculé une seule fois, à la création.** Renommer un produit ne renomme **pas** son SKU. Sinon
   la référence bouge sous les pieds de tout le monde à chaque retouche éditoriale.
3. **Collision → suffixe numérique**, jamais un aléa. `-2` reste lisible et prononçable ; un hash ne
   l'est pas. La boucle est bornée (10 tentatives) et échoue franchement au-delà.
4. **Le défaut n'est pas une garantie d'unicité** — seule la base l'est (§5). Le générateur *propose*
   en évitant les collisions connues ; il ne les *exclut* pas.

```ts
// catalogue/domain/services/sku-generator.ts — pur, testable sans Nest
export interface SkuAvailability {
  isTaken(candidate: Sku): Promise<boolean>;
}

export async function proposeVariantSku(
  productSku: Sku,
  options: ReadonlyMap<string, string>,
  availability: SkuAvailability,
): Promise<Sku> {
  const base = discriminator(options);
  const root = base === '' ? productSku.value : `${productSku.value}-${base}`;

  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const candidate = Sku.create(attempt === 1 ? root : `${root}-${attempt}`);
    if (!(await availability.isTaken(candidate))) {
      return candidate;
    }
  }
  throw new SkuGenerationExhaustedError(root);
}
```

> Le générateur dépend d'un **port** (`SkuAvailability`), pas d'un dépôt : le domaine reste pur et
> le test n'a besoin ni de base ni de framework.

## 5. L'unicité globale : trois couches, une seule garantie

C'est le point où la proposition d'origine était à la fois juste et incomplète.

| Couche | Ce qu'elle apporte | Ce qu'elle **ne** garantit **pas** |
|---|---|---|
| **Value object** | la **forme** — un SKU invalide n'existe pas en mémoire | rien sur l'unicité |
| **Vérification en commande** | un **message clair** (« déjà utilisé par *Tarte 8P* ») | rien : deux requêtes concurrentes passent toutes les deux |
| **Index unique en base** | **la garantie**, la seule | un message utilisable tel quel |

Les trois sont nécessaires, et il faut savoir **pourquoi** on garde la deuxième alors qu'elle ne
garantit rien : elle existe pour l'**ergonomie**, pas pour la sûreté. C'est un cas de
*time-of-check / time-of-use* assumé — on l'écrit dans le code pour que personne ne « simplifie » en
la supprimant, ni ne s'y fie.

**Traduction de la violation** : la proposition attrapait le code `23505` **dans le service** et
levait un `ConflictException` HTTP. Deux fuites — l'infrastructure Postgres et le vocabulaire HTTP
remontent dans l'application. Chez nous, l'**adaptateur de dépôt** traduit `23505` en
`SkuAlreadyUsedError` (une `BusinessError` du domaine) ; c'est le filtre d'exceptions, à la frontière
HTTP, qui décide que ça vaut un **409**.

## 6. L'unicité **par canal** : où elle vit réellement

C'est ton exigence, et elle est satisfaite — mais du bon côté de la frontière.

| Canal | Table (possédée par l'adaptateur) | Colonne | Contrainte |
|---|---|---|---|
| Shopify | `shopify_variant_binding` | `shopify_sku` | `UNIQUE` |
| Caisse PI | `helios_variant_binding` | `plu` | `UNIQUE` |

**Chaque table *est* un canal** — un index unique sur sa colonne **est** une unicité par canal. Aucun
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

| Quoi | Où | Pourquoi |
|---|---|---|
| Motif, longueurs, `normalize` | `packages/shared-types` | Importé *littéralement* par les deux — une seule définition, vérifiée par `tsc` |
| Libellés, exemples, aide à la saisie | **front** | Ce sont des **textes d'interface**, ils n'ont rien à faire dans le domaine |

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
