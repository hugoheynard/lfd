# C0-d — la matrice de canaux pilotée par la donnée

> **Note doc-first, 2026-08-26. Aucun code écrit.** Elle tranche la seule
> question qui coûte cher si on la tranche mal — le sort du drapeau `b2b` — et
> elle rapporte ce que l'examen a révélé au passage : C0-d a un **prérequis**
> qu'on ne lui connaissait pas.

## 1. Pourquoi maintenant : la promesse de C0 est fausse

C0 a été livré avec une promesse écrite : **« ajouter un contexte de vente =
une ligne, zéro code »**. Elle ne tient pas. Insérer une quatrième ligne dans
`pim.sales_context` produit ceci :

```ts
// prisma-sales-context.registry.ts
const CHANNEL_KEYS: readonly SalesChannelKey[] = ["emporter", "surPlace", "b2b"];

function toContext(row: SalesContextRow): SalesContext | null {
  if (!isChannelKey(row.channelKey)) {
    return null; // ← la ligne est écartée, en silence
  }
```

Le contexte n'apparaît **nulle part** : pas à l'écran, pas dans la TVA, pas
dans les projections. Aucune erreur, aucun log — `active()` le filtre. Le
comportement est prudent et il est même justifié dans le code (« lui prêter un
canal par défaut ferait facturer un contexte que personne ne peut vendre »),
mais il referme la porte que C0 disait avoir ouverte.

C'est la **dernière dimension scalable écrite en dur du référentiel**. Les
autres constantes du PIM (`MEDIA_ROLES`, `PACKAGING_TYPES`, les types MIME
acceptés) sont des ensembles réellement fermés, pas des dimensions qui
grandissent.

| Dimension                            | État                                                  |
| ------------------------------------ | ----------------------------------------------------- |
| Emplacements                         | ✅ donnée — `pim.emplacement`, matrice indexée par id |
| Taux de TVA                          | ✅ donnée — `pim.tva_rate` + jointure par contexte    |
| Contextes de vente — **existence**   | ✅ donnée — `pim.sales_context`                       |
| Contextes de vente — **vendabilité** | ❌ `CHANNEL_KEYS`, trois valeurs en dur               |

Conséquence sur l'ordre des travaux : **on ne peut pas attendre d'avoir besoin
d'un quatrième contexte pour faire C0-d.** C'est C0-d qui rend ce besoin
exprimable.

## 2. L'état exact, sans interprétation

Les trois lignes en base, aujourd'hui :

```
 key      | channel_key | active | shopify_projected | handle_suffix
----------+-------------+--------+-------------------+---------------
 emporter | emporter    | t      | t                 |
 surPlace | surPlace    | t      | f                 | -surplace
 b2b      | b2b         | t      | f                 | -b2b
```

`channel_key` est **l'identité**. La colonne de transition que C0-d doit
supprimer ne porte, à cette heure, aucune information. Elle n'en porterait que
le jour où deux contextes partageraient un canal — ce que le modèle actuel
interdit justement d'exprimer.

Et la forme qui la rend nécessaire :

```ts
interface SalesChannels {
  readonly boutiques: Readonly<Record<string, ShopChannels>>; // clé = id d'emplacement
  readonly b2b: boolean;
}
interface ShopChannels {
  readonly emporter: boolean;
  readonly surPlace: boolean;
}
```

La matrice est **déjà** pilotée par la donnée sur un axe (les emplacements) et
en dur sur l'autre (les modes). C'est cette asymétrie que C0-d supprime.

## 3. La question : que devient `b2b` ?

Le drapeau n'appartient à **aucun emplacement** — un professionnel qui commande
en gros ne consomme ni sur place ni à emporter. La cible notée au TODO
(`Record<emplacementId, Record<contextKey, boolean>>`) ne dit pas où il va.

L'écran, lui, a déjà tranché à sa façon. `ChannelMatrix` affiche « une ligne par
emplacement réel, **plus une pour la plateforme B2B** » : la présentation unifie
ce que la donnée sépare.

### Les trois sorties

**A — la plateforme devient un pseudo-emplacement.** Une ligne dans
`pim.emplacement`, et la matrice n'a plus qu'un seul axe.
_Contre, et c'est rédhibitoire_ : cette ligne porterait `name`, `click_collect`,
`eat_in`, `base_url` et une grille de tables — tous absurdes pour une
plateforme. L'écran des emplacements devrait la **cacher**, c'est-à-dire porter
une exception ; et la supprimer par mégarde couperait le B2B sans que rien ne
le dise. On ferait mentir une table pour économiser une clé.

**B — `b2b` survit tel quel, à côté de la matrice.**
_Contre, et c'est décisif_ : si le drapeau reste un booléen nommé, le registre
doit continuer à dire **quels contextes le chevauchent** — donc `channel_key`
survit, donc `CHANNEL_KEYS` survit, donc C0-d ne livre pas ce pour quoi il
existe. Cette option n'est pas un compromis : c'est le renoncement.

**C — deux cartes nommées, même forme.** ✅ **Retenue.**

```ts
interface SalesChannels {
  /** Ce que chaque point de vente physique vend, par contexte. */
  readonly byLocation: Readonly<Record<string, Readonly<Record<string, boolean>>>>;
  /** Ce que la plateforme vend, par contexte. Elle n'est pas un lieu. */
  readonly platform: Readonly<Record<string, boolean>>;
}
```

### Pourquoi C

- **Elle livre le but.** `contextIsSold` perd sa branche sémantique — plus de
  `context.channelKey === "b2b"`, plus de connaissance de quel contexte est
  lequel. Un contexte est vendu s'il est vrai **quelque part** :

  ```ts
  function contextIsSold(key: string, channels: SalesChannels): boolean {
    return (
      channels.platform[key] === true ||
      Object.values(channels.byLocation).some((sold) => sold[key] === true)
    );
  }
  ```

  `channel_key`, `SalesChannelKey` et `CHANNEL_KEYS` disparaissent tous les
  trois.

- **Elle ne fait mentir aucune table.** La plateforme n'entre pas dans
  `pim.emplacement`, et aucune clé réservée magique (`"platform"`) ne se cache
  dans un dictionnaire d'identifiants.

- **Elle ne casse pas le mur qu'on vient de poser.** `category_location_ref`
  (l'index de référence qui porte le `Restrict` vers l'emplacement, cf.
  [`concurrence-et-allers-retours.md` § 6](./concurrence-et-allers-retours.md))
  continue de dériver de `byLocation`, sans rien changer d'autre.

- **Elle laisse la porte ouverte.** Le jour où « point de vente » devient une
  vraie notion — une table avec un genre (`shop` / `platform`) dont
  l'emplacement n'est qu'un cas — les deux cartes fusionnent sans refaire la
  migration : `platform` devient une ligne de plus dans `byLocation`.

### Ce que C ne résout pas, et qu'il faut dire

Deux cartes, c'est deux chemins de lecture. Toute règle qui parle de « tous les
canaux » devra parcourir les deux — et une règle future qui n'en parcourrait
qu'un serait fausse en silence. La parade est de n'exposer **aucun accès direct
aux deux cartes** hors du value object : tout passe par `contextIsSold`,
`soldContexts(channels)` et `referencedLocations(channels)`. Si un appelant lit
`channels.platform` lui-même, c'est un défaut de conception, pas un usage.

## 4. Ce que la question a révélé : le prérequis manquant

En cherchant où ranger `b2b`, une deuxième constante est apparue — et elle est
sur le même axe.

**Un emplacement porte ses propres modes en dur** :

```prisma
model Location {
  clickCollect Boolean @default(false) @map("click_collect")
  eatIn        Boolean @default(false) @map("sur_place")
}
```

Ce sont, en substance, **les contextes que ce point de vente offre**. Les
laisser en colonnes pendant que la matrice devient une donnée, c'est déplacer le
verrou sans l'ouvrir : ajouter le contexte « borne libre-service » demanderait
encore une colonne de plus sur `emplacement`.

Pire, rien ne relie aujourd'hui les deux niveaux. On peut parfaitement cocher
« sur place » pour une famille dans un emplacement dont `eat_in` est faux :

```mermaid
flowchart LR
    A["Emplacement « Labo »<br/>eat_in = false"] -->|aucune vérification| B["Famille « Viennoiseries »<br/>vend surPlace au Labo"]
    B --> C["Projection : une fiche « sur place »<br/>pour un lieu sans salle"]
```

Aucun code ne pose la question. Ce n'est pas un bug ouvert — personne n'a coché
cette case — mais c'est un invariant absent, et C0-d le rendrait bien plus facile
à violer, puisque la matrice deviendrait libre.

**Conclusion : C0-d a un prérequis.** Un scope doit **déclarer les contextes
qu'il offre**, avant que la matrice ne dise ce qu'on y vend :

| Niveau          | Question                              | Aujourd'hui                | Cible                         |
| --------------- | ------------------------------------- | -------------------------- | ----------------------------- |
| Point de vente  | quels contextes ce lieu **sert-il** ? | `click_collect` / `eat_in` | `location_context` (jointure) |
| Famille / fiche | quels contextes y **vend-on** ?       | `channel_preset` (`jsonb`) | la matrice de C0-d            |

Et la matrice ne doit accepter que ce que le point de vente offre — invariant
d'agrégat, tenu par `Category.setChannels`, comme les taux le sont déjà.

## 5. Le plan

Trois déploiements, discipline `étendre / basculer / resserrer` non négociable
(`documentation/ops/pipelines.md`), comme `AddressKind` l'a suivie en août.

| Tranche           | Migration                                                        | Code                                                                                           |
| ----------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **d-0**           | table `location_context` + reprise de `click_collect` / `eat_in` | les deux colonnes restent ÉCRITES ; l'écran des emplacements coche des contextes               |
| **d-1 étendre**   | —                                                                | la nouvelle forme de `channel_preset` / `channel_override` est écrite **à côté** de l'ancienne |
| **d-2 basculer**  | reprise des `jsonb`                                              | tout lit la nouvelle forme ; `channel_key`, `SalesChannelKey`, `CHANNEL_KEYS` tombent          |
| **d-3 resserrer** | `DROP` de `channel_key`, `click_collect`, `eat_in`               | suppression du double-écriture                                                                 |

**Surface** : 12 fichiers backend (le cœur est `sales-channels.ts` — 80 lignes —
`json-readers.ts` et `sales-context.ts`), les deux agrégats `Category` et
`Product`, les deux projections Shopify et B2B, et **un** composant front de
81 lignes (`ChannelMatrix`, qui itère déjà le registre pour ses colonnes).

**Ce que ça rend au passage** : `category_location_ref` redevient inutile le jour
où la matrice sera une table plutôt qu'un `jsonb` — la clé étrangère sera
directe, et l'invariant cessera de reposer sur la discipline d'un seul dépôt.
Ce n'est **pas** dans les tranches ci-dessus : d-1/d-2 changent la forme du
`jsonb`, pas sa nature. Sortir la matrice du `jsonb` est un chantier distinct,
et il n'a d'intérêt qu'après.

## 6. Ce que cette note ne tranche pas

- **La forme finale de la clé de contexte.** `emporter` / `surPlace` restent des
  valeurs françaises en base ; C0-d les fait disparaître **en tant que clés de
  structure**, pas en tant que valeurs de `sales_context.key`. Leur traduction
  reste un geste de données à part (`langue-du-code.md` § 4 quater).
- **Quand.** Rien n'oblige à enchaîner d-0 → d-3 d'un trait ; d-0 a une valeur
  propre (il ferme l'incohérence du § 4) et peut vivre seul.
- **Le sort du drapeau `shopifyProjected`**, qui est un autre axe du registre et
  ne bouge pas ici.
