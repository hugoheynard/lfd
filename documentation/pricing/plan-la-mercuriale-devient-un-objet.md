# La mercuriale devient un objet

**Plan, écrit le 2026-09-08.** 📐 Doc-first : décidé, rien n’est bâti.

> Ferme **T2** de
> [`etat-des-lieux-mercuriale-client.md`](etat-des-lieux-mercuriale-client.md).
> Décision prise par Hugo le 2026-09-08 : **une mercuriale se prend en bloc.**
> On la pose entière, on la clôt entière ; si un prix est faux, on assume et on
> repose.

---

## 1. Le fait, avant la conception

Poser une mercuriale de 92 articles écrit **92 lignes indépendantes** dans
`price_rules`. Aucune ne sait qu'elle appartient à une mercuriale.

Ce que l'écran appelle « 2027 » n'existe pas : `posed-mercuriales.ts` le
**reconstitue** en regroupant les règles qui partagent `(validFrom, validTo,
label)`. C'est la seule clé disponible, parce que c'est la seule chose que
`templateToRules` leur donne en commun.

Quatre conséquences, toutes mesurées aujourd'hui :

|          | aujourd'hui                                                     |
| -------- | --------------------------------------------------------------- |
| poser    | 92 sauvegardes + 92 actes de journal, dans **une** transaction  |
| clore    | archiver 92 lignes                                              |
| renommer | réécrire 92 lignes, sous transaction, avec un refus d'homonymie |
| lire     | déduire, avec deux cas que la déduction ne sait pas distinguer  |

Les deux garde-fous du renommage (`00181ce0`, ce matin) n'existent que pour
compenser l'absence d'identité. Ils **disparaissent** avec ce plan.

## 2. Ce qui rend ce plan peu risqué : le chemin a déjà été pris

L'étage **volume** était lui aussi fait de règles. Il est devenu un objet le
2026-08-17 — `VolumeLadder`, ses paliers en JSON, sa contrainte d'exclusion, et
une migration qui a repris les règles déjà posées. Deux pièces de ce travail
sont directement réutilisables, et leur justification est déjà écrite dans le
dépôt :

**La forme.** `VolumeLadder.tiers` est en `Json`, pas dans une table fille, et le
schéma dit pourquoi : _« une échelle s'écrit **entière** ou pas du tout. Une
table fille permettrait d'insérer un palier sans les autres — exactement ce que
cet agrégat existe pour empêcher. »_ C'est mot pour mot l'argument du monobloc.

**Le branchement.** `ladderAsRule(ladder, context)` **présente** l'échelle comme
une `PriceRule` au moment de résoudre. Son JSDoc : _« la pièce qui évite de
toucher au pipeline »_. `resolvePrice` ne connaît toujours qu'une liste plate de
règles ; la spécificité continue d'arbitrer ; la trace figée sur la ligne de
commande porte l'identifiant de l'échelle comme elle portait celui d'une règle.

🔴 **Corollaire à retenir : ce plan ne touche pas `resolvePrice`.** J'ai affirmé
le contraire en le présentant oralement à Hugo ; c'était faux, et c'est ce qui
changeait le coût du chantier.

## 3. Le modèle

```prisma
model CompanyMercuriale {
  id String @id                          // ULID — deux mercuriales successives coexistent

  companyId String @map("company_id")    // identifiant OPAQUE : aucune clé étrangère
                                         // vers `companies` — même frontière que
                                         // partout, le tarif survit à la fiche

  label String
  /// Les prix accordés : `[{ sku, unitPriceMillicents }]`.
  /// En JSON pour la raison de `VolumeLadder.tiers` : une mercuriale s'écrit
  /// entière ou pas du tout.
  lines Json

  validFrom DateTime  @map("valid_from") @db.Timestamptz(3)
  validTo   DateTime? @map("valid_to")   @db.Timestamptz(3)

  createdBy String   @map("created_by")
  // … même cycle de vie qu'une règle : pausedAt/By, archivedAt/By/Reason
}
```

`Timestamptz` obligatoire, et pas par élégance : sans fuseau, `tstzrange()`
dépend du réglage de session, donc n'est pas `IMMUTABLE`, donc **ne peut pas
entrer dans une contrainte d'exclusion**. La leçon est déjà payée deux fois.

### La contrainte, et ce qu'elle change

```sql
ALTER TABLE "company_mercuriales"
  ADD CONSTRAINT "company_mercuriales_no_overlap"
  EXCLUDE USING gist (
    "company_id" WITH =,
    tstzrange("valid_from", "valid_to", '[)') WITH &&
  )
  WHERE ("archived_at" IS NULL);
```

🔴 **C'est un changement de comportement, pas une traduction.** Aujourd'hui le
chevauchement est refusé **par article** : deux mercuriales peuvent coexister
sur la même fenêtre chez le même client si elles portent sur des SKU disjoints.
Ce n'est pas théorique — l'e2e « refuse un nom déjà pris » (écrit ce matin) pose
exactement ça, et les deux poses réussissent.

Sous le nouveau modèle : **une mercuriale en cours par client, point.**

C'est plus fort et plus simple, c'est ce que l'écran raconte déjà (« il faut la
clore avant d'en poser une autre »), et c'est cohérent avec le monobloc. Mais
c'est une capacité retirée, et il faut le dire plutôt que le découvrir en
production. **À valider explicitement avec Hugo.**

## 4. Le branchement

```ts
/** La mercuriale, vue comme la règle de l'étage mercuriale, pour CET article. */
export function mercurialeAsRule(mercuriale: CompanyMercuriale, sku: string): PriceRule | null;
```

`null` quand la mercuriale ne porte pas cet article — l'étage est alors
transparent, exactement comme lorsqu'aucune règle ne s'applique. C'est la
sémantique de `ladderAsRule` quand la quantité n'atteint aucun palier.

**Le silence reste une information.** Une mercuriale ne dit que ce qui a été
négocié ; les articles absents retombent sur le tarif catalogue et **suivent ses
évolutions**. Y recopier le prix catalogue le **gèlerait** pour ce client — une
remise que personne n'a accordée, invisible à l'écran. C'est le symétrique exact
du refus déjà en place (`MercurialeMustPoseAPriceError`) : une mercuriale se
pose en euros et jamais en pourcentage, pour ne pas suivre le catalogue ; elle
ne recopie pas le catalogue, pour ne pas cesser de le suivre.

### 🔴 Le vrai risque du plan, et il est déjà démontré

`resolvePrice` a **cinq** appelants, et chacun **assemble sa propre liste de
règles** :

| appelant                                                    | ce qu'il sert                                                    |
| ----------------------------------------------------------- | ---------------------------------------------------------------- |
| `orders/domain/services/price-line.ts`                      | la caisse — et par elle la vitrine au prix du client et le devis |
| `pricing/application/board-item.ts`                         | l'écran de tarification **et** l'onglet Tarifs d'une fiche       |
| `pricing/application/queries/price-projection.query.ts`     | la projection                                                    |
| `pricing/application/volume-tier-prices.ts`                 | la colonne des paliers                                           |
| `pricing/application/queries/mercuriale-benchmark.query.ts` | le comparatif                                                    |

Un appelant qui oublierait d'injecter la mercuriale servirait le **tarif
catalogue** — un prix parfaitement plausible, sur le seul écran où l'erreur ne
se voit pas.

**Ce n'est pas une crainte, c'est un fait constaté.** C'est exactement ce qui
est arrivé aux barèmes de volume :
[`todo-ecran-tarification-ignore-les-baremes.md`](../todos/todo-ecran-tarification-ignore-les-baremes.md)
— `price-line.ts` convertit les barèmes en règles, `board-item.ts` ne le fait
pas, et les deux annoncent des prix différents pour le même article. Le défaut
est ouvert aujourd'hui.

Le patron `*AsRule` évite de toucher le pipeline, mais il **déplace la charge sur
chaque appelant**, et c'est le mauvais bout de la hiérarchie des garde-fous :
une consigne, pas une impossibilité.

**Le plan doit donc porter ce qui manquait aux barèmes** : une fonction unique
qui assemble la liste de règles d'un contexte — règles + barèmes + mercuriale —
et que les cinq appelants prennent **à la place** de `resolvePrice` nu. Oublier
un étage cesse alors d'être possible ; il n'y a plus qu'un endroit où
l'assemblage s'écrit.

Corollaire : ce chantier **referme le TODO des barèmes** au passage, ou ne vaut
pas la peine d'être fait. Les deux défauts ont la même racine.

## 5. La reprise des données

Une migration de données, donc trois déploiements (`documentation/ops/pipelines.md`).

1. **Étendre** — créer `company_mercuriales`, la remplir depuis les règles
   `stage = 'mercuriale' AND audience_type = 'company' AND archived_at IS NULL`,
   groupées par `(audience_id, label, valid_from, valid_to)`. Les deux tables
   coexistent ; la résolution lit encore les règles.
2. **Basculer** — la résolution passe par `mercurialeAsRule` ; les anciennes
   règles sont archivées avec un motif qui le dit.
3. **Resserrer** — plus rien à supprimer : les règles archivées **restent**, et
   c'est la règle du dépôt. Ce déploiement ne fait que retirer le code mort.

La migration de reprise du barème de volume
(`20260817220000_bareme_de_volume`) porte déjà ce geste, y compris le
regroupement de N règles en un objet. C'est le fichier à relire avant d'écrire
celui-ci.

⚠️ **Ce que je ne sais pas** et qui doit être mesuré avant l'étape 1 : combien de
mercuriales sont posées en production, et sur combien d'articles. Le plan tient
à 92 lignes par client ; il n'a pas été pensé pour 10 000.

## 6. Ce qu'on perd, et que Hugo a tranché

Aujourd'hui, `prisma-pricing-board.reader.ts` charge **toutes** les règles non
archivées, sans filtre d'étage ni d'audience. Les 92 règles de chaque client
sont donc dans l'écran de tarification général, et chacune y est **suspendable
et archivable à l'unité** — `pauseRule` / `resumeRule` / `archiveRule` de
`tarification.service.ts` sont branchés sur les routes correspondantes.

Ce n'est pas hypothétique : c'est joignable en trois clics aujourd'hui.

⚠️ En revanche le **renommage** d'une règle à l'unité (`PATCH
/admin/pricing/rules/:id/label`) existe côté serveur et **n'a aucun appelant
front** — vérifié. Ne pas le compter dans ce qu'on retire.

Après ce plan, une ligne de mercuriale n'a plus de cycle de vie propre — elle
vit et meurt avec sa mercuriale. **Hugo a tranché le 2026-09-08 :** c'est le
principe d'une mercuriale, et un prix mal posé s'assume et se repose.

Effet de bord favorable : l'écran général cesse d'afficher les prix négociés de
tous les clients comme des règles en vrac.

## 7. Ce que ça rapporte

|               | avant                                           | après                          |
| ------------- | ----------------------------------------------- | ------------------------------ |
| poser         | 92 écritures + 92 actes, une transaction longue | 1 insert + 1 acte              |
| clore         | 92 archivages                                   | 1                              |
| renommer      | 92 réécritures + refus d'homonymie              | 1, sans refus                  |
| lire          | reconstitution par `(libellé, fenêtre)`         | lecture                        |
| chevauchement | refusé par la base, par article                 | refusé par la base, par client |

La transaction longue de la pose — signalée en JSDoc comme pouvant expirer sous
Accelerate en production, ce qui n'a **pas** été observé à ce jour — disparaît.

## 8. Ce qui reste ouvert

- **La contrainte élargie** (§3) retire une capacité existante. Décision de Hugo.
- **Le volume en production** (§5) doit être mesuré avant d'écrire la migration.
- **T7** (fenêtres construites à minuit UTC alors que `contracts/src/paris-time.ts`
  existe et n'est pas utilisé) n'est **pas** traité ici. Le toucher au passage
  déplacerait les bornes de tarifs déjà posés — c'est un autre chantier, et il
  doit rester un autre commit.
