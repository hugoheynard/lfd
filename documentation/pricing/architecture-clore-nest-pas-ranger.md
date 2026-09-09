# Clore n'est pas ranger

> **État réel au 2026-09-09.** Ce document décrit ce qui **tourne**. Ce qui reste
> ouvert est au §7, nommé — pas suggéré.
>
> Il a d'abord été un plan, **démoli quatre fois par `vitruve`**. Ce que chaque
> démolition a renversé vit au §8 : c'est la partie qu'on relit avant de croire
> qu'on a compris ce dossier.

---

## 1. Les deux gestes

`archived_at` disait **deux choses** à la fois, et c'est de là que tout venait :

| Sens       | Geste              | Effet                                                         |
| ---------- | ------------------ | ------------------------------------------------------------- |
| **ranger** | retirer de l'écran | rend sa place dans la contrainte d'exclusion                  |
| **finir**  | cesser d'agir      | ~~ne se lisait que par ce champ~~ **s'écrit dans la fenêtre** |

Le second a déménagé. **Ranger écrit désormais aussi la fin dans `valid_to`**, qui
est l'endroit où le domaine la lit déjà (`isInForce`). `archived_at` garde le
premier sens, et lui seul.

Ce que ça répare : la clause `archived_at IS NULL` que portent tous les lecteurs
transformait « il n'agit plus » en **disparition**. Une mercuriale en vigueur le
3 mars, rangée en avril, était introuvable pour une lecture datée du 3 mars —
alors que quatre affirmations du dépôt promettaient de la retrouver.

## 2. Ranger, et les trois fois où l'on ne borne PAS

`closingWindowAt` porte la décision, **une fois** pour les quatre agrégats. Les
trois `null` valent autant que la valeur : ce sont les cas où la fenêtre dit déjà
la vérité, et où l'écrire la falsifierait.

| Cas                                | Réponse                  | Ce que ça évite                                                                                                                                                                  |
| ---------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validFrom >= at` — n'a jamais agi | ne rien borner           | `validTo <= validFrom`, que `tstzrange` refuse en **22000** — que `isExclusionViolation` n'attrape pas, puisqu'il compare un NOM de contrainte. Un **500** sur un geste de staff |
| déjà terminée                      | ne rien borner           | la **ressusciter** sur l'intervalle écoulé. C'est le cas le plus courant : on range ce qui est fini                                                                              |
| suspendue avant d'agir             | ne rien borner           | idem le premier                                                                                                                                                                  |
| suspendue **pendant**              | borner à `suspendedFrom` | occuper `[pause, rangement[` avec une décision qui ne s'y appliquait pas — et refuser au staff une remplaçante sur une période où rien ne courait                                |

⚠️ `validFrom >= at` est une comparaison **large**, et l'égalité est un cas, pas
une limite : borner à `validFrom` produirait une plage **vide**, et une plage
vide n'est `&&` avec rien — la ligne échapperait entièrement à l'exclusion.

## 3. Demander un prix à une date

```ts
await pricer.load({ articles, companyId, at: le3Mars });
```

Un second axe, `PriceEpoch`, à côté de la lentille — et il ne faut pas les
confondre : la **lentille** dit ce que la question a le droit de _prouver_,
l'**époque** dit dans quel état du monde on la pose.

|                    | `current`             | `replay`           |
| ------------------ | --------------------- | ------------------ |
| clause d'archivage | `archived_at IS NULL` | `unarchivedAt(at)` |
| cache de matériaux | **utilisé**           | **contourné**      |

**La décision se prend une seule fois, dans `Pricer`** — le seul endroit du
chemin qui tient à la fois l'instant demandé et l'horloge. Faire descendre le
`Clock` jusqu'aux cinq lecteurs pour qu'ils recalculent chacun la même
comparaison, c'aurait été cinq encodages d'une décision : l'éparpillement par
lequel R15 s'est glissé.

🔴 **Le contournement du cache n'est pas de l'hygiène.** Le cache retient des
**tables entières, pour tous les clients**, sous une clé qui ne porte que le nom
de la table. Une lecture datée qui s'y rangerait servirait ensuite des lignes
rangées **au chemin qui facture** — un prix faux, durable, pour tout le monde.

Il est **non caché par construction** : la lecture datée passe par `listAll(at)`,
qui ne l'est pas. On ne peut pas l'oublier, il n'y a rien à oublier.

## 4. Reposer sur une période close

Refusé **si elle a facturé**. Autorisé sinon.

```
poser → il existe une décision RANGÉE qui recouvre cette fenêtre ?
          └─ oui → l'une d'elles est-elle citée par une ligne de commande ?
                     ├─ oui → 409 PricedPeriodIsSealedError
                     └─ non → posé
```

🔴 **La frontière est « a facturé », pas « est passé »**, et c'est toute la raison
d'être du port `PricedDecisionsReader`. Un barème posé puis rangé dix minutes
plus tard n'a rien facturé : le reposer sur la même période est le geste
ordinaire « je me suis trompé, je recommence », et le dépôt l'atteste par un e2e.
Interdire toute pose rétroactive aurait supprimé cet usage pour protéger un cas
qui ne se produisait pas.

### Pourquoi la base ne suffit pas

La contrainte d'exclusion est **partielle** :

```sql
EXCLUDE USING gist (…, tstzrange("valid_from", "valid_to", '[)') WITH &&)
  WHERE ("archived_at" IS NULL);
```

Elle refuse le chevauchement avec une décision **en cours**, jamais avec une
rangée. Chaque famille a donc son `archivedOverlapping`, **avec la clé
d'exclusion de sa table** — c'est là que la recopier de travers rendrait un
ensemble vide rassurant et faux :

| Famille    | Clé                                |
| ---------- | ---------------------------------- |
| règle      | étage, portée, audience, **seuil** |
| barème     | portée, audience                   |
| engagement | société, portée                    |
| mercuriale | société                            |

### Le port, et de quel côté il vit

`PricedDecisionsReader` est **déclaré par `pricing`**, qui a besoin du fait ;
l'adaptateur vit dans **`orders`**, qui le détient — la trace figée de chaque
ligne cite les décisions ayant produit son prix. `pricing` ne lit pas ces tables,
la dépendance ayant été coupée le même jour. `appBootstrap` les relie ; même
forme que `production/channels/commerce/`.

Il interroge **deux colonnes**, et ça compte : `pricing_steps` porte ce qui a
**modifié** le prix (règle, barème, mercuriale) ; `pricing_commitment` porte
l'engagement à part, parce qu'il ne modifie rien — il **mesure** ce qui ouvre le
palier. Chercher un engagement dans les étages n'aurait jamais rien rendu, et le
refus bâti dessus aurait été silencieusement inopérant.

Deux index GIN **partiels** l'accompagnent : sans eux, `@>` sur du `jsonb` est un
parcours complet des lignes de commande. La question ne se pose jamais sur le
chemin qui facture — c'est un geste de staff, quelques fois par jour — mais elle
grossirait avec l'histoire.

## 4 bis. Les planchers, datés eux aussi

Ils étaient la seule décision tarifaire **sans fenêtre** : l'index de leur
migration l'écrivait, « la résolution filtre sur la portée, **jamais sur la
date** ». Re-poser **réécrivait** la ligne, si bien qu'une lecture datée
appliquait les valeurs d'aujourd'hui à une période où la limite disait autre
chose. Un plancher **relève** un prix — le mode de défaillance était un prix
historique **gonflé**, silencieux.

|            | Avant                        | Après                                      |
| ---------- | ---------------------------- | ------------------------------------------ |
| identité   | `id = f(portée)`             | tirée, comme les quatre autres             |
| re-poser   | `upsert` — **réécrit**       | **borne** la précédente, en pose une neuve |
| contrainte | index unique **non partiel** | exclusion sur portée × plage, partielle    |
| résolution | portée seule                 | **fenêtre puis portée**                    |

Ils rejoignent ainsi `isInForce`, dont ils étaient l'**exception**.

🔴 **Ce que la réécriture en place défendait est préservé**, et il fallait le
vérifier : « re-posée = re-décidée, la référence se rafraîchit et l'écart repart
de zéro — sans quoi le signal ne s'éteindrait jamais et on apprendrait à
l'ignorer ». La ligne neuve porte **sa propre** référence, donc l'écart repart
bien de zéro ; ce qu'on ne perd plus, c'est l'ancienne.

### Deux lecteurs continuaient de lire la portée seule

Versionner déplace une charge : partout où « le plancher de cette portée » était
**une** ligne, il en existe désormais N, et le code qui ne le sait pas prend la
première venue. Deux endroits l'ignoraient, et aucun typecheck ne pouvait le
dire — les deux compilent parfaitement en rendant la mauvaise ligne.

- **Le tableau de tarification** chargeait `where: unarchivedAt(at)` puis
  `find` sur la portée. Juste après une re-pose, l'écran affichait donc la
  limite **périmée**, et le signal de dérive restait allumé sur une limite qu'on
  venait de confirmer. Corrigé en ajoutant la fenêtre à la requête, comme
  `inForceFor` la porte déjà.
- **Le journal** prenait pour sujet l'identifiant de la **version**. L'histoire
  d'une limite serait devenue une suite de journaux d'une entrée chacun, et tout
  ce que le journal contient déjà — écrit quand l'identifiant ÉTAIT la portée —
  serait devenu inatteignable. Le sujet est la **cible** (`floorScopeKey`), pas
  la ligne : c'est la question qu'on pose en relisant.

Les deux ont été trouvés par les e2e, pas par la relecture : les seuls tests qui
posent une limite **deux fois** contre un vrai Postgres.

⚠️ **Le remplissage dit ce qu'il ne sait pas.** L'historique des planchers
n'existe pas en données — le journal ne garde qu'un `summary`, une phrase figée.
`valid_from` vaut donc la dernière pose (et, pour une limite rangée, sa création,
parce qu'une écriture postérieure au rangement pousserait `updated_at` **après**
la fin). Une lecture antérieure ne trouve aucun plancher : honnête, là où un
plancher inventé serait indistinguable d'un vrai.

## 5. Ce qui n'a PAS changé

- **Ranger reste ranger.** `archive()` garde sa route, son écran et son sens.
  `GET /admin/pricing/rules/archived` et le panneau `ArchivesPanel` fonctionnent
  comme avant. _(Une version du plan les vidait sans le savoir — cf. §8.)_
- **Les gardes de cycle de vie.** `assertNotArchived` conserve son sens sur ses
  huit sites, et `assertOpenFor(at)` refuse toujours de reprendre une règle dont
  la fenêtre est close, **avec son message dédié**. _(Une version du plan les
  remplaçait par un prédicat unique qui rendait ce message inatteignable, et qui
  aurait fait payer une faute de frappe au prix d'une décision close.)_
- **Le chemin qui facture.** Cinq lecteurs inchangés, cache inchangé, purge
  inchangée. Tout le lot vit dans l'écriture et dans la relecture datée.

## 6. Ce qui l'éprouve

| Suite                      | Ce qu'elle couvre                                                                |
| -------------------------- | -------------------------------------------------------------------------------- |
| `rule-lifecycle.spec`      | **6 cas** — les quatre branches de `closingWindowAt`, plus le rangement terminal |
| `volume-commitment.spec`   | le bornage, et le refus de borner ce qui n'a pas commencé                        |
| `pricer.e2e-spec`          | **2 cas** — une mercuriale **rangée** retrouvée à sa date, et pas après          |
| `company-pricing.e2e-spec` | les **deux côtés** du refus, avec une commande réellement passée par la caisse   |
| `admin-pricing.e2e-spec`   | règle et barème : « ranger et recommencer » survit                               |

Comptes au 2026-09-09 : `src/b2b/pricing` **2 546** cas, `admin-pricing.e2e`
**101**, `company-pricing.e2e` **31**, `pricer.e2e` **13**.

🔴 **La fixture du catalogue e2e fabriquait un état impossible.** Elle semait
`catalog_items` sans la trace du tarif, alors que la production écrit les deux
dans **une seule transaction** — « le seul point par lequel ils passent ». Tant
que rien ne relisait le passé, ça ne se voyait pas ; dès que la porte rescelle
les articles au tarif de la date demandée, une relecture datée n'y trouve rien
et refuse. Le code avait raison, la donnée était impossible. C'est la forme
exacte que `CLAUDE.md` §5 décrit : _une donnée de test impossible à produire par
le domaine est une donnée que la prod ne verra jamais — le test ne prouve alors
rien._

## 7. Ce qui manque

### 🟠 Le refus n'a son e2e « refusé » que sur la mercuriale

Les trois autres familles n'ont que le côté « autorisé ». Le mécanisme est le
même port, le même appel, la même erreur — mais le dire n'est pas le prouver, et
le faire demanderait de faire facturer chacune par une vraie commande.

### La porte qui empêche la prochaine famille de manquer sa date

`lint:dated-decisions` lit les champs de `PricingMaterials` et exige que le
fichier déclarant chaque famille prononce `validFrom`. Elle échoue **le jour où
on ajoute une sixième famille sans fenêtre**, pas six mois plus tard en
cherchant autre chose.

Elle existe parce que le plancher a coûté exactement ça : une migration de
schéma, un changement de modèle d'identité et une réécriture du dépôt, pour un
défaut qui ne se voyait pas.

⚠️ Elle s'arrête au **fichier**, délibérément — suivre les `extends` demanderait
de refaire `tsc` en moins bien, et une porte qu'on ne lit pas d'un coup d'œil
finit désactivée plutôt que corrigée. Ce qu'elle laisse passer est écrit dans son
propre JSDoc : une famille dont un type voisin porte la fenêtre sans qu'elle-même
l'ait.

### ✅ Les cinq entrées de la reconstitution sont datées

Une reconstitution complète a **cinq entrées**, et c'est le tableau de bord de
R17. Les cinq y sont :

| #   | Entrée                                   | État                                                                        |
| --- | ---------------------------------------- | --------------------------------------------------------------------------- |
| 1   | règles, barèmes, engagements, mercuriale | ✅                                                                          |
| 2   | suspension                               | ✅                                                                          |
| 3   | planchers                                | ✅ fenêtre, contrainte d'exclusion, et versionnage                          |
| 4   | **tarif canonique à la date**            | ✅ la porte rescelle sur une relecture, et **refuse** un article sans trace |
| 5   | **preuves mesurées**                     | ✅ le cumul est borné à `earliest(validTo, at)`                             |

La cinquième était la dangereuse — une lecture du 3 mars appliquait un palier
atteint en novembre, et **rien ne le signalait**. Elle est fermée : la fenêtre de
l'engagement est aussi sa fenêtre de **mesure**, et elle s'arrête désormais à
l'instant de la question.

⚠️ La borne s'applique **aussi au présent**, à l'instant courant plutôt qu'au
terme de l'engagement. Ce qui ne change pas, c'est le **résultat** : le cumul se
compte sur `order.createdAt`, et aucune commande n'est créée dans le futur. Dire
« sans effet au présent » serait vrai du résultat et faux de la fenêtre.

⚠️ **Ce paragraphe annonçait la quatrième comme restante** — « `catalogueArticle`
scelle au prix d'aujourd'hui, donc une relecture datée combine les décisions
d'alors avec le tarif d'entrée du jour ». C'était vrai à l'heure où il a été
écrit, et le tableau au-dessus l'a démenti sans que la phrase soit relue : la
porte **rescelle** les articles au tarif de la date demandée (`sealedAt`), et
**refuse** l'article dont l'histoire ne remonte pas jusque-là plutôt que de lui
prêter le prix du jour. La cinquième, elle, était la dangereuse — une lecture du
3 mars appliquait un palier atteint en novembre, et rien ne le signalait.

**R17 est donc close**, et le registre le porte :
[`ce-qui-reste-a-faire.md`](ce-qui-reste-a-faire.md). Ce qui ne l'est pas, et
qu'il ne faut pas confondre avec elle, c'est **R21** : le tableau de
tarification garde sa propre séquence de chargement. Il lit juste — c'est le
chargeur qui a rejoint sa sémantique, pas l'inverse — mais il la lit **à côté**
de la porte.

### Et la migration qui n'a pas eu lieu

Le plan en prévoyait une : borner les lignes déjà rangées. **Mesurée, puis
abandonnée.** Pour une ligne rangée en mars avec une fenêtre ouverte, la
relecture datée applique déjà `archived_at > at` — après mars la ligne est
exclue, avant mars sa fenêtre dit vrai. L'horodatage du rangement fait déjà le
travail de la borne.

Et le comptage en base a montré qu'une règle porte un `valid_to` planifié
**au-delà** de son archivage : le `LEAST` prévu l'aurait **écrasé**, sans trace
récupérable — le journal ne garde qu'une phrase, pas les valeurs.

## 8. Ce que les quatre démolitions ont renversé

À relire avant de « simplifier » quoi que ce soit ci-dessus.

| Version | Ce qu'elle proposait                        | Pourquoi c'était faux                                                                                                                                                                                                   |
| ------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **v1**  | garder l'archivage, dater la lecture        | `archived_at IS NULL` est ce qui rend la contrainte **partielle**. Lire les rangées, c'est lire un intervalle que plus rien ne garde — deux lignes concurrentes, et un `findFirst` sans `orderBy` en rend une au hasard |
| **v2**  | borner sans désarchiver, lecteurs inchangés | incompatible : **tous** les lecteurs filtrent `archived_at IS NULL`. R17 serait resté ouvert pour exactement l'historique repris — et les tests, posant par le nouveau chemin, auraient été **verts**                   |
| **v3**  | abolir l'archivage                          | cassait le **rangement**, que le JSDoc d'`archive()` appelle « le cas le plus courant de tous », et vidait un panneau du back-office **en service**                                                                     |
| **v4**  | clore ≠ ranger, deux routes                 | clore et ranger sont **la même route** pour les règles et les barèmes ; le refus exigeait une commande, une route et un bouton que le plan ne chiffrait pas                                                             |

Ce qui a survécu aux quatre : **le domaine filtre déjà par fenêtre, à l'instant
demandé**. C'est le pilier, et c'est pourquoi le chemin de lecture n'a pas bougé.

⚠️ Deux détails viennent directement de ces passes, et se retireraient sans eux :

- l'**`orderBy` explicite** sur la relecture datée de la mercuriale. Au présent,
  la contrainte d'exclusion garantit l'unicité ; au passé, **non**. Sans ordre,
  « que payait-il le 3 mars ? » serait un tirage ;
- l'**`AND` explicite** dans la même clause : `unarchivedAt` rend un `OR`, et la
  clause en portait déjà un. Les fondre par étalement aurait fait perdre le
  filtre de fenêtre, sans que TypeScript ne bronche.
