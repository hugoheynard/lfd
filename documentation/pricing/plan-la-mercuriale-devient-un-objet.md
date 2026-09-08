# La mercuriale devient un objet

**Plan v2, réécrit le 2026-09-08.** 📐 Doc-first : décidé, rien n'est bâti.
**Les inconnues du §9 ont été levées le 2026-09-08** — plus rien n'y est supposé.

> Ferme **T2** de
> [`etat-des-lieux-mercuriale-client.md`](etat-des-lieux-mercuriale-client.md).
>
> **Décision de Hugo, 2026-09-08 :** une mercuriale se prend **en bloc**. On la
> pose entière, on la clôt entière ; si un prix est faux, on assume et on
> repose. Une ligne n'a donc pas de cycle de vie propre.
>
> **La v1 ne tenait pas.** Contredite le même jour : cinq objections bloquantes,
> dont quatre venaient de moi. Ce qui a changé, et qu'il faut lire avant le
> reste :
>
> - une ligne de mercuriale **porte des paliers** ; la v1 la modélisait comme un
>   prix unique, ce qui supprimait un champ d'un contrat déjà servi (§2) ;
> - il y a **deux chemins de pose**, pas un — la v1 en ignorait un, et l'aurait
>   tué en silence (§4) ;
> - la « fonction d'assemblage unique » de la v1 **est impossible** : deux
>   appelants ont besoin de la liste non assemblée, et l'un d'eux porte un bug
>   déjà corrigé qui reviendrait. La couture est ailleurs — dans les
>   **lecteurs** (§3) ;
> - la migration du barème de volume, citée comme précédent, est un
>   **contre-exemple** : un seul déploiement, et une autre clé de regroupement
>   (§6).

---

## 1. Le fait

Poser une mercuriale écrit **N lignes indépendantes** dans `price_rules`, et
aucune ne sait qu'elle appartient à une mercuriale.

N vaut le nombre d'articles **fois le nombre de paliers** : la pose depuis la
fiche d'un compte force un palier unique
(`company-mercuriale.handlers.ts:118-121`), donc 92 articles → 92 règles ; la
pose depuis un gabarit, non — `price-template.handlers.ts:89-91` le dit :
_« un gabarit de trente lignes à deux paliers en pose soixante »_.

Ce que l'écran appelle « 2027 » n'existe pas : `posed-mercuriales.ts:52` le
**reconstitue** en regroupant les règles qui partagent `(validFrom, validTo,
label)`. C'est la seule chose que `templateToRules` leur donne en commun, donc
la seule clé disponible.

|                 | aujourd'hui                                                    |
| --------------- | -------------------------------------------------------------- |
| poser (fiche)   | N sauvegardes + N actes, dans **une** transaction              |
| poser (gabarit) | N sauvegardes + N actes, **sans transaction** — c'est T3       |
| clore           | archiver N lignes                                              |
| renommer        | réécrire N lignes, sous transaction, avec un refus d'homonymie |
| lire            | déduire, avec deux cas que la déduction ne sait pas distinguer |

Le refus d'homonymie du renommage (`00181ce0`) n'existe que pour compenser
l'absence d'identité ; il disparaît. La transaction, elle, reste utile pour
d'autres raisons — ne pas la compter dans le gain.

## 2. Le modèle

```prisma
model CompanyMercuriale {
  id String @id                          // ULID — deux mercuriales successives coexistent

  companyId String @map("company_id")    // identifiant OPAQUE, aucune clé étrangère :
                                         // même frontière que partout, le tarif
                                         // survit à la fiche

  label String

  /// La grille : `[{ sku, tiers: [{ minQuantity, unitPriceMillicents }] }]`.
  ///
  /// 🔴 **Des paliers, pas un prix.** Une ligne de gabarit EST une liste de
  /// paliers (`price-template.ts`, `TemplateTier`), et le contrat les sert déjà
  /// (`PosedMercurialeLineView.minQuantity`), jusque dans l'export CSV. Un
  /// modèle à prix unique supprimerait un champ d'un contrat en ligne.
  ///
  /// En JSON et non dans une table fille, pour la raison écrite sur
  /// `VolumeLadder.tiers` : une grille s'écrit **entière** ou pas du tout. Une
  /// table fille permettrait d'insérer une ligne sans les autres — exactement
  /// ce que cet agrégat existe pour empêcher.
  lines Json

  validFrom DateTime  @map("valid_from") @db.Timestamptz(3)
  validTo   DateTime? @map("valid_to")   @db.Timestamptz(3)

  createdBy String   @map("created_by")
  // + suspendedFrom, archivedAt/By/Reason — copiés sur la TABLE `volume_ladders`.
  //   ⚠️ Le DOMAINE `VolumeLadder` ne porte que `suspendedFrom` ; ne pas
  //   confondre les deux quand on copie l'analogie.
}
```

Les invariants que l'agrégat doit refuser, tous repris de `PriceTemplate` parce
que la grille est la même : **un SKU une seule fois** (`DuplicateTemplateSkuError`),
**des paliers cohérents** (`NonDecreasingTemplateTiersError`), **grille non
vide** (`EmptyPriceTemplateError`). Sans eux, la reprise de deux règles
`(même sku, minQuantity 1 et 5000)` produirait un objet que rien ne rattrape.

`Timestamptz` obligatoire : sans fuseau, `tstzrange()` dépend du réglage de
session, donc n'est pas `IMMUTABLE`, donc ne peut pas entrer dans une contrainte
d'exclusion. La leçon est déjà payée deux fois dans ce dépôt.

### La contrainte, et le seul engagement irréversible du plan

```sql
ALTER TABLE "company_mercuriales"
  ADD CONSTRAINT "company_mercuriales_no_overlap"
  EXCLUDE USING gist (
    "company_id" WITH =,
    tstzrange("valid_from", "valid_to", '[)') WITH &&
  )
  WHERE ("archived_at" IS NULL);
```

🔴 **Changement de comportement, pas traduction.** Aujourd'hui le chevauchement
est refusé **par article et par seuil** (`price_rules_no_overlap`, qui porte
`coalesce("min_quantity", 0)`), et le pré-contrôle de la pose ne regarde que les
SKU de la nouvelle grille (`company-mercuriale.handlers.ts:201-212`). Deux
mercuriales peuvent donc coexister sur la même fenêtre chez le même client si
elles portent sur des articles disjoints — l'e2e `company-pricing.e2e-spec.ts`
(« refuse un nom déjà pris ») construit exactement cet état, et les deux poses
réussissent.

Sous le nouveau modèle : **une mercuriale en cours par client, point.**

⚠️ **C'est le seul point du plan qu'on ne peut plus défaire.** Tout le reste se
reprend par un `ALTER TABLE` ou un refactor ; revenir à « deux mercuriales
disjointes chez le même client » après avoir fondu la grille en un objet serait
une re-découpe du modèle **et** du contrat. Validé par Hugo le 2026-09-08, en
connaissance de ça.

## 3. Le branchement — la couture est le LECTEUR, pas la résolution

La v1 proposait « une fonction unique qui assemble règles + barèmes +
mercuriale, prise par les cinq appelants de `resolvePrice` ». **C'est
impossible**, et pour des raisons écrites dans le dépôt :

- `price-line.ts:186-190` passe volontairement à `volumeTierPrices` les règles
  **sans** les barèmes, parce que celui-ci les réinjecte lui-même : _« deux
  règles de même identifiant à l'étage volume rendaient la résolution ambiguë —
  400 sur une commande de 20 »_. Un assembleur lui rendrait la liste qu'il ne
  doit pas recevoir ;
- `mercuriale-benchmark.query.ts` n'a pas _un_ contexte : il en fabrique un par
  `(sku, company)`, résout **une seule règle**, **sans plancher**, et c'est
  documenté comme délibéré.

La bonne couture existe déjà, et elle est plus basse : **`PriceRuleReader`**,
dont le contrat dit _« les règles potentiellement applicables à cet article, ce
client et cet instant »_ — ce qu'une ligne de mercuriale **est**. Le port
autorise même explicitement une lecture large, la fonction pure refiltrant.

Il y a **deux** lecteurs, parce qu'il y a deux questions :

| couture                                                          | qui la prend                                                        | ce qu'elle sert                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **`PriceRuleReader`** (`inScopes` / `candidatesFor`)             | `order-line-pricing.service.ts:182`, `price-projection.query.ts:67` | la caisse, la vitrine au prix du client, le devis, la projection   |
| **`PricingBoardReader`** (`prisma-pricing-board.reader.ts:load`) | `board-item.ts`                                                     | l'écran de tarification général **et** l'onglet Tarifs d'une fiche |

`volumeTierPrices` n'est **pas** un troisième point d'injection : il reçoit ses
règles de `price-line`, donc la mercuriale y arrive déjà — et sans dupliquer
quoi que ce soit, une mercuriale n'étant pas un barème. Le bug des 400 ne
revient pas par là.

### `mercurialeAsRule`

```ts
/**
 * La mercuriale, vue comme la règle de l'étage mercuriale qu'elle est POUR CET
 * ARTICLE À CETTE QUANTITÉ. `null` quand elle ne porte pas l'article, ou quand
 * la quantité n'atteint aucun palier — l'étage est alors transparent.
 */
export function mercurialeAsRule(
  mercuriale: CompanyMercuriale,
  context: PricingContext,
): PriceRule | null;
```

Elle prend le **contexte**, comme `ladderAsRule`, et pour la même raison
mécanique : elle doit rendre **au plus une** règle. Toutes les règles issues
d'une mercuriale portent `id = mercuriale.id` ; en rendre deux (deux paliers du
même article) recréerait l'ambiguïté qui a produit le 400.

La fenêtre, la suspension et l'audience restent filtrées par `applies` /
`inForceFor`, qui ne demandent qu'une forme `{audience, validFrom, validTo,
suspendedFrom}`.

**Le silence reste une information.** Une mercuriale ne dit que ce qui a été
négocié ; les articles absents retombent sur le tarif catalogue et **suivent ses
évolutions**. Y recopier le prix catalogue le **gèlerait** pour ce client — une
remise que personne n'a accordée et que rien n'affiche. C'est le symétrique
exact du refus déjà en place (`MercurialeMustPoseAPriceError`) : une mercuriale
se pose en euros et jamais en pourcentage, pour ne pas suivre le catalogue ; elle
ne recopie pas le catalogue, pour ne pas cesser de le suivre.

### Ce que chaque couture demande en plus

**`PricingBoardReader`** ne peut pas se contenter de la forme règle.
`board-item.ts` consomme aussi `materials.byStage` (pour `supersededRuleIds`) et
des `PriceRuleView` issus d'une ligne `price_rules`. Il faut donc que le lecteur
rende la mercuriale **sous les deux formes** — la règle pour résoudre, une vue
pour afficher.

🔴 **Ce que ça casse si on l'oublie est invisible.**
`shelf-table.ts:146` croise `item.supersededRuleIds` contre la liste des règles
du tableau : un identifiant absent ne lève rien, **le badge disparaît**. Même
famille que la frise des recouvrements, qu'il a fallu rebrancher à la main quand
le barème a quitté `price_rules` — _« elle disait donc moins que la vérité »_.
À rebrancher explicitement : `shelf-table`, `overlap-timeline`,
`lineage-overlaps`.

**`volumeTierPrices`** doit recevoir la mercuriale **en objet**, comme il reçoit
déjà `ladders`. Ses seuils viennent aujourd'hui de `rule.minQuantity`
(`allThresholds`, l. 117-129) ; une fois les mercuriales sorties de
`price_rules`, la colonne des paliers reperdrait les seuils négociés — et ce
serait annuler un correctif marqué 🔴 dont le commentaire annonce le coût :
_« c'est un prix faux, et pour les clients qui ont négocié »_.

**`mercuriale-benchmark.query.ts`** est une **réécriture**, pas une injection :
il interroge `priceRule.findMany({ stage: 'mercuriale', audienceType: 'company' })`
pour comparer un client aux autres. Il doit lire `company_mercuriales`.

## 4. Les deux chemins de pose convergent

`ApplyPriceTemplateHandler` (`price-template.handlers.ts:101-133`) est le
**second** chemin : poser un gabarit chez un client. Il écrit des règles
`stage='mercuriale'`, audience société, `validTo` **nullable**.

Si on ne le traite pas, la bascule le tue en silence : la route continue de
répondre `201` avec un nombre de règles posées, et **plus rien ne les lit** — le
client est facturé au tarif catalogue.

Il écrit donc, lui aussi, **une** `CompanyMercuriale`. Deux bénéfices que ce
plan n'allait pas chercher :

- les deux poses convergent sur un seul écrivain, donc sur un seul jeu
  d'invariants ;
- **T3 se ferme pour ce chemin** : la boucle sans transaction de
  `ApplyPriceTemplateHandler` — qui laisse aujourd'hui un client à moitié tarifé
  quand elle échoue à mi-parcours — devient une écriture unique. Ce n'est plus
  « transactionnel », c'est **atomique par construction**.

`templateToRules` perd son unique appelant utile et se supprime… **sauf** si la
reprise en a besoin (§6). Vérifier avant de la retirer.

## 5. Le brouillon

`mercuriale_drafts` (une ligne par société, grille en JSONB) **ne change pas de
forme** : il porte déjà des lignes libres et ne tarife rien. Seule sa
transformation à la pose change de destination. Il gagne les paliers en même
temps que le reste, pour rester la même grille que ce qu'il produit.

## 6. La migration

**Il n'y a aucune mercuriale en production** (Hugo, 2026-09-08). Ça retire le
risque principal — rien à convertir, donc pas de compromis de forme imposé par
les données existantes.

Ça ne dispense pas d'écrire la reprise, pour deux raisons :

1. **« zéro » est un fait daté**, pas une propriété du plan. Les deux routes de
   pose sont en service d'ici au déploiement. Faire dépendre la justesse d'une
   migration d'un fait qui n'est pas dans le fichier est précisément ce qu'on
   reproche ailleurs.
2. La base de **dev** n'est pas vide, et un poste qui migre sans reprise perd
   ses mercuriales sans le dire.

### Ce que la reprise fait, et ce qu'elle refuse

`INSERT … SELECT` depuis `price_rules` où `stage='mercuriale' AND
audience_type='company' AND archived_at IS NULL`, groupé par
`(audience_id, label, valid_from, valid_to)`, les règles d'un même SKU devenant
les paliers d'une ligne.

🔴 **Elle doit refuser bruyamment**, et deux cas l'exigent :

- **chevauchement** — deux libellés différents sur la même fenêtre chez le même
  client produisent deux lignes que la nouvelle contrainte rejette. La migration
  échoue, le déploiement s'arrête, on nettoie à la main. C'est le bon
  comportement ; ce qui ne l'est pas, c'est de ne rien en dire ;
- **grille invalide** — un SKU en double, des paliers incohérents. Un `HAVING`
  explicite, comme la migration du barème de volume en porte un
  (`count(DISTINCT "mode") = 1`).

### Le nombre de déploiements

⚠️ **La v1 citait `20260817220000_bareme_de_volume` comme précédent de trois
déploiements. C'est faux, et le fichier dit le contraire :** il crée la table,
insère la reprise **et** archive les règles reprises dans **un seul** fichier,
donc un seul déploiement — et il groupe par **cible**, pas par `(label,
fenêtre)`. À citer comme contre-exemple.

Côté **données**, un seul déploiement suffit donc : la table est neuve, la
reprise est un no-op, il n'y a pas d'état intermédiaire à tenir.

Côté **contrat**, non. Un onglet d'admin ouvert sur l'ancien bundle continue
d'appeler `POST …/mercuriale` et de lire `PosedMercurialeView`. `ruleCount` se
**déprécie**, il ne disparaît pas dans le même déploiement (§0 du `CLAUDE.md`).
`minQuantity`, lui, survit — c'est tout l'objet du §2.

## 7. Ce qu'on perd, et que Hugo a tranché

`prisma-pricing-board.reader.ts:113-115` charge **toutes** les règles non
archivées, sans filtre d'étage ni d'audience. Les règles de mercuriale de chaque
client sont donc dans l'écran de tarification général, et chacune y est
**suspendable et archivable à l'unité** — `pauseRule` / `resumeRule` /
`archiveRule` de `tarification.service.ts:104-121` sont branchés. C'est
joignable en trois clics aujourd'hui.

Après ce plan, une ligne n'a plus de cycle de vie propre : elle vit et meurt avec
sa mercuriale. **C'est la décision de Hugo**, et c'est le principe d'une
mercuriale.

⚠️ Le **renommage** d'une règle à l'unité (`PATCH /admin/pricing/rules/:id/label`)
existe côté serveur et **n'a aucun appelant front** — vérifié. Ne pas le compter
dans ce qu'on retire.

Effet de bord favorable : l'écran général cesse d'afficher les prix négociés de
tous les clients comme des règles en vrac.

## 8. Ce que ça rapporte

|                 | avant                                        | après                                |
| --------------- | -------------------------------------------- | ------------------------------------ |
| poser (fiche)   | N écritures + N actes, transaction longue    | 1 insert + 1 acte                    |
| poser (gabarit) | N écritures **sans transaction** (T3)        | 1 insert — atomique par construction |
| clore           | N archivages                                 | 1                                    |
| renommer        | N réécritures + refus d'homonymie            | 1, sans refus                        |
| lire            | reconstitution par `(libellé, fenêtre)`      | lecture                              |
| chevauchement   | refusé par la base, par article et par seuil | refusé par la base, par client       |

## 9. Ce qui reste ouvert

**Les quatre inconnues de la v2 sont levées** (2026-09-08, vérifié en base de
dev `lfc_b2b_dev` et dans le code — pas déduit).

- **Audience.** Une règle porte deux axes : la **portée** (ce qu'elle vise —
  catalogue, famille, article) et l'**audience** (à qui elle s'applique —
  `all`, `segment`, `company`). Une mercuriale est normalement
  `stage=mercuriale` + `audience=company` : c'est l'audience qui en fait _le
  prix de ce client-là_.

  Or `createPriceRulePayloadSchema` accepte n'importe quelle audience à
  n'importe quel étage saisissable, et `PricingRule.create` ne le refuse pas
  non plus. Une mercuriale d'audience `all` est donc **exprimable** — et elle
  n'a aucun sens : « un prix négocié pour tout le monde » est un tarif
  catalogue. Pire, elle **scellerait** la chaîne pour tout le monde (une
  mercuriale rend les étages suivants transparents), donc éteindrait toutes les
  promotions sur cet article sans que rien ne le dise.

  🔵 **Il n'en existe aucune** — la seule règle de mercuriale en base est
  `company` / `replace`. Le plan **n'a donc rien à reprendre**, et la
  recommandation est de fermer la porte plutôt que de la surveiller : refuser
  dans `PricingRule.create` une audience autre que `company` à l'étage
  mercuriale. Zéro ligne concernée, donc aucun risque, et le `WHERE
audience_type='company'` de la reprise devient exhaustif **par construction**
  au lieu de l'être par chance. C'est un durcissement indépendant, qui peut
  partir avant ce chantier.

- **`alter` : il n'y a pas de problème, et il n'y en a jamais eu.** Une
  mercuriale pose un prix à la place du canonique, point —
  `MercurialeMustPoseAPriceError` refuse `alter` à cet étage **depuis le premier
  commit qui a permis d'écrire une règle** (`23d65bf8`, 2026-08-17 11 h 18).
  Vérifié en base : zéro ligne `alter`.

  Ce qui existait était un **JSDoc faux** dans `mercuriale-benchmark.query.ts`,
  à deux endroits, affirmant qu'une mercuriale « peut être posée en `alter` » —
  et s'en servant pour justifier son passage par `resolvePrice`. Corrigé le
  2026-09-08. La reprise n'a donc aucun cas `alter` à traiter.

- **La borne de taille est donnée par le catalogue :** 94 articles au canal B2B.
  Une grille ne peut pas être plus large que ce qu'on vend. Les « 10 000
  lignes » de la v2 étaient une inquiétude inventée ; le JSON tient, et
  `mercurialeAsRule` n'a pas besoin d'index pré-calculé. À réexaminer si le
  catalogue B2B change d'ordre de grandeur.

- **Le seed ne pose aucune règle de prix** — vérifié, `src/dev/seeding/` n'en
  crée pas une seule ; `reset.seed.ts` ne fait qu'en supprimer. La reprise
  s'exécutera donc sur les seules mercuriales posées à la main sur un poste.

**Volontairement hors lot.**

- **Le TODO des barèmes**
  ([`todo-ecran-tarification-ignore-les-baremes.md`](../todos/todo-ecran-tarification-ignore-les-baremes.md)).
  La v1 le couplait à ce chantier. Vérification faite, **trois** appelants sur
  cinq injectent déjà les barèmes ; il ne manque qu'à `board-item.ts:92`, qui
  reçoit `ladders` en paramètre et ne les passe pas. C'est un correctif d'une
  ligne dans un fichier — il ne justifie pas de grossir ce lot, et il n'attend
  pas après lui.
- **T7** — les fenêtres construites à minuit UTC alors que
  `contracts/src/paris-time.ts` existe et n'est pas utilisé. Le toucher ici
  déplacerait les bornes de tarifs posés. Autre chantier, autre commit.

**Conséquence acceptée, pas un trou.** `resolve-price.ts:95-97` remplit
`steps[].supersedes` avec les perdants de l'étage. Aujourd'hui, à l'étage
mercuriale, les perdants sont les autres paliers de la même grille ; demain
l'étage ne présente plus qu'une règle, donc `supersedes` y devient vide. La
trace des commandes passées et celle des futures ne diront plus la même chose
pour la même grille — sans qu'aucun prix ne change.
