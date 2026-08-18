# La résolution de prix — un empilement d'étages datés

**État : 🟢 la chaîne prix est complète de bout en bout.** Les trois forks sont
tranchés ; **S1 à S4 sont livrés** — le domaine pur, la persistance branchée sur
le checkout, l'écran de saisie, et la trace figée à la fois **écrite** (S4a),
**affichée** sur la commande client et la fiche staff (S4b), et **annoncée avant
la validation** dans le panier du staff (S4c). Reste **S5**, la mercuriale par
client. Dates : 2026-08-15, forks et S1→S3 le 2026-08-17, S4 et la bascule du
catalogue le 2026-08-18.

Voisins :

- [`architecture-conditionnements-pricing.md`](architecture-conditionnements-pricing.md)
  — la **frontière PIM / B2B**, tranchée le 2026-08-04 : le PIM porte le prix
  canonique par variante, le B2B porte les altérations. **Ce document ne la
  rediscute pas**, il traite ce que celui-là renvoyait à plus tard : « forme du
  dégressif B2B, à trancher au moment de coder » ;
- [`architecture-commande-immuable-avenants.md`](architecture-commande-immuable-avenants.md)
  — une commande est un fait clos. C'est de là que vient la règle de gel
  ci-dessous.

---

## Le problème

On veut un prix **granulaire** — par produit, par client, par quantité — et
**daté**, donc surchargeable dans le temps. Le mot qui manque est celui qui fait
tomber tout le reste :

> Deux règles visent le même produit. Elles **s'additionnent**, ou la plus
> spécifique **remplace** l'autre ?

Répondre « ça dépend » condamne le système : personne ne saura prédire un prix,
et le premier litige client sera invérifiable. Répondre « tout cumule » rend
impossible un tarif négocié qui _écrase_ le barème. Répondre « le plus
spécifique gagne » interdit d'appliquer une promo par-dessus une mercuriale.

Les deux réponses sont nécessaires. Elles ne peuvent simplement pas s'appliquer
au **même niveau**.

---

## La réponse : des étages ordonnés

- **À l'intérieur d'un étage** : une seule règle gagne, la plus spécifique. Elle
  **remplace** les autres candidates du même étage.
- **Entre étages** : ça **cumule**, dans un ordre déclaré une fois pour toutes…
- …**sauf après une mercuriale**, qui **scelle** la chaîne (cf. plus bas).
- Un étage sans gagnante est **transparent** — il laisse passer le prix entrant.

```mermaid
flowchart LR
    A["Prix canonique<br/>(PIM, par variante)"] --> B["1 · Mercuriale<br/><i>replace</i>"]
    B --> C["2 · Volume<br/><i>alter</i>"]
    C --> D["3 · Promotion<br/><i>alter</i>"]
    D --> E["4 · Geste ponctuel<br/><i>alter</i>"]
    E --> F["Prix unitaire<br/>de la ligne"]
    F --> G["× quantité → sous-total"]
    G --> H["Plan PANIER :<br/>remise retrait / frais de zone"]
```

| Étage          | Nature    | Porté par                       | Ce que c'est                                   |
| -------------- | --------- | ------------------------------- | ---------------------------------------------- |
| _(entrée)_     | —         | PIM                             | Le prix de liste de la variante                |
| 1 · Mercuriale | `replace` | Commercial, par client          | Le tarif négocié : **un prix**, pas une remise |
| 2 · Volume     | `alter`   | Réglages, barème global         | Paliers de quantité (100+ → −5 %)              |
| 3 · Promotion  | `alter`   | Commercial, datée par nature    | Opération temporaire                           |
| 4 · Geste      | `alter`   | Staff, sur une commande précise | Cas particulier, tracé                         |

L'intérêt de cette forme : le prix devient **explicable ligne à ligne**.

> Base 2,40 € → palier 100+ −5 % → promotion de rentrée −10 % → **2,05 €**

C'est cette trace qu'il faut savoir rendre, pas seulement le nombre final.

Cet exemple portait une mercuriale jusqu'au 2026-08-18, et il était faux :
depuis le scellement, un tarif négocié rend les étages suivants transparents.

---

## Deux natures, pas une

**`replace`** pose un prix. **`alter`** modifie le prix entrant.

Cette distinction n'est pas cosmétique, et c'est le piège principal du modèle.
Une mercuriale saisie en « −13 % » **suit le prix de base** : le jour où le
tarif de liste augmente, le prix négocié augmente avec lui. Ce n'est pas ce
qu'on a promis au client. Un tarif négocié est un **engagement en euros**, il
doit être stocké en euros.

L'inverse est vrai aussi : un dégressif de volume saisi en euros deviendrait
absurde si le prix de base doublait. Le volume est bien une altération.

`replace` n'a donc qu'une forme : un montant. `alter` porte une
[`PriceAlteration`](../../packages/b2b-ui/src/pricing/price-alteration.model.ts)
— sens, unité, grandeur.

---

### ✅ Décidé le 2026-08-18 — la mercuriale scelle

Jusqu'à cette date, la chaîne traversait les quatre étages **sans condition**.
Une mercuriale posait donc un prix négocié, puis le barème de volume, la
promotion et le geste composaient par-dessus. Personne n'avait décidé ce cumul :
il tombait de la composition, ne se lisait sur aucun écran, et ne se découvrait
qu'en comparant deux factures.

Sur le volume, c'était plus qu'un cumul de trop — c'était le **même** cumul deux
fois. Un tarif négocié EST déjà le prix du volume négocié ; le barème public
par-dessus accordait une seconde fois la remise que la mercuriale avait
consentie en euros.

**Une mercuriale rend donc les étages suivants transparents.** La porte de
sortie est explicite : une règle portant `stacksOverMercuriale` agit malgré le
scellement — « cette promotion vise AUSSI les comptes au tarif négocié ». Le
défaut est `false`, y compris sur les règles antérieures à la décision : un
cumul non voulu coûte de la marge en silence, un cumul manquant se remarque au
premier appel d'un client.

Trois points qui sont des décisions, pas des détails d'implémentation :

- **le gagnant de l'étage se désigne d'abord, le scellement décide ensuite.**
  Filtrer les règles avant l'arbitrage ferait remonter une règle moins spécifique
  à la place qu'elle avait perdue — donc appliquerait une décision que l'éviction
  avait écartée ;
- **le scellement est consigné**, comme le plancher et le ramené-à-zéro :
  `sealedByRuleId` nomme la mercuriale, `sealedRuleIds` les règles écartées. Sans
  eux, un commercial voyant sa promotion absente ne pourrait pas dire si elle a
  expiré, si elle a été évincée par plus spécifique, ou si le tarif du client
  l'écarte — trois causes, trois réponses différentes au téléphone ;
- **un barème ne franchit jamais un scellement.** Le drapeau n'est pas exposé sur
  les échelles ; c'est le sens même de la décision.

L'agrégat refuse une mercuriale qui se déclarerait cumulable par-dessus une
mercuriale (`pricing.mercuriale.cannot_stack_over_itself`), et un `CHECK` en base
tient la même garantie pour les écritures qui ne passent pas par lui.

**Ce que le scellement ne fait pas** : il ne persiste pas sur la ligne de
commande. La trace figée dit ce qui a FAIT le prix ; le scellement est l'absence
d'un effet, et il se lit sur le devis et sur l'écran, là où la question se pose.
Le jour où un client contestera une promotion qu'il croyait avoir, il faudra
l'y figer aussi.

---

## La spécificité, à l'intérieur d'un étage

Deux axes croisés :

| Portée produit                           | Audience                |
| ---------------------------------------- | ----------------------- |
| globale < catégorie < produit < variante | tous < segment < client |

La gagnante est la plus spécifique sur les deux axes. **Deux règles également
spécifiques dans le même étage, valides au même moment, sont une erreur de
saisie, pas un cas à arbitrer** : le résultat dépendrait de l'ordre de tri SQL,
donc du hasard.

On l'interdit **en base**, pas en applicatif — une contrainte d'exclusion
Postgres sur `(stage, scope, audience, tstzrange(valid_from, valid_to))`. Un
doublon devient impossible à insérer, et l'écran de saisie le dit au lieu de le
laisser passer.

---

## Le temps

Chaque règle porte `valid_from` / `valid_to` (borne haute exclue, `null` =
ouverte). La résolution prend un **instant de référence**.

**Quel instant : la passation.** Le prix résolu est ensuite **figé sur la ligne**
— ce que le code fait déjà, `unitPriceCents` est un snapshot. Sans ce gel, une
hausse tarifaire réécrirait le prix d'une commande déjà facturée. C'est
exactement le défaut qu'on vient de corriger sur le bon de production, en pire :
là, c'est de l'argent.

### ✅ Décidé le 2026-08-17 — un gabarit ne gèle pas de prix

La question posée ici — « jour de commande ou jour de service ? » — supposait
que le prix flotte entre les deux. Il ne flotte pas : **le prix se fige à la
passation**, et c'est déjà la règle. Ce qui manquait, c'était de dire **combien
de passations** a un panier récurrent.

**Réponse : une par échéance.** Un gabarit dit **quoi** commander, jamais
**combien** ça coûte. Chaque échéance qui part est sa propre passation : elle
résout le prix du jour, et le fige sur ses lignes comme n'importe quelle
commande.

Ce qui a tranché : l'alternative crée un **engagement tarifaire sans terme que
personne n'a signé**. Un client s'abonne un mardi, la farine augmente six mois
plus tard, et la marge s'érode sans que rien ne le signale — il faudrait alors
rendre la date de fin obligatoire pour borner l'engagement, donc compliquer
l'abonnement pour réparer une décision de prix.

Un client qui veut un prix tenu n'est pas sans réponse : c'est exactement ce que
fait la **mercuriale** (étage 1), datée, explicite et signée. Deux mécaniques,
deux intentions — les confondre donnerait un engagement implicite qu'aucun écran
ne montre.

Corollaire pour l'écran : une échéance à venir affiche un prix **estimé**, pas
promis. L'annoncer comme ferme serait mentir de bonne foi.

Attention à ne pas généraliser au-delà : une **commande ponctuelle** passée
aujourd'hui pour dans trois semaines garde le prix du jour où le client l'a
acceptée. Là, il y a bien eu une passation, et une seule.

---

## Trois garde-fous

**Arrondir une seule fois, en fin de chaîne.** Un arrondi par étage accumule
l'erreur ; à quatre étages on décale d'un centime, et un centime sur une facture
se voit. La chaîne travaille en rationnel, l'arrondi est la dernière opération.

**Des entiers persistés, jamais de flottant.** Déjà la règle ailleurs (`bp`,
`cents`), à ne pas relâcher ici.

**Le plancher.** Aujourd'hui `max(0, subtotal − discount)` ne protège que la
remise de panier. Une chaîne de quatre altérations peut passer sous le prix de
revient sans que rien ne bronche.

### ✅ Décidé le 2026-08-17 — un plancher à deux formes

Le plancher s'exprime **soit en fraction du prix canonique, soit en montant**,
au choix — exactement comme une altération porte un `mode` percent/amount. Même
vocabulaire, même value object, rien de neuf à apprendre :

```
PriceFloor = { mode: 'percent', value: bp }   // ex. 5000 bp = 50 % du canonique
           | { mode: 'amount',  value: cents } // ex. 150 = jamais sous 1,50 €
```

La fraction suit le tarif : le jour où le PIM augmente, le plancher monte avec
lui, sans que personne ait à le rouvrir. Le montant, lui, dit une limite absolue
— utile quand un article a un coût fixe connu (un emballage, une pièce achetée)
que le pourcentage ne saurait pas exprimer.

**Ce que ce plancher est, et n'est pas.** C'est un **garde-fou**, pas une règle
de marge. Il attrape le vrai risque — quatre étages qui se composent par
accident, une saisie à côté, un barème recopié une fois de trop — et il ne
prétend pas connaître un coût de revient qui n'existe nulle part dans le modèle.

Le prix de revient reste le plancher **juste**, et il reste hors d'atteinte : il
suppose un coût matière et une main-d'œuvre par déclinaison, donc un chantier PIM
entier. Le jour où il existera, il deviendra une troisième forme de `PriceFloor`
— l'union est ouverte pour ça, et rien de ce qui est décidé ici ne sera à défaire.

**Toucher le plancher n'est pas un détail à avaler en silence.** La résolution le
consigne dans sa trace (`floored: true`) : un prix qui a été relevé est un prix
dont une règle n'a pas produit son effet, et c'est exactement ce qu'on veut voir
avant qu'un client ne le remarque.

---

## La composition de deux pourcentages

### ✅ Décidé le 2026-08-17 — composition

−20 % puis −10 % font **−28 %** (0,8 × 0,9), jamais −30 %. Chaque étage
s'applique au prix **sortant** du précédent.

Deux raisons, et la première est la vraie : c'est la seule règle qui reste
cohérente quand on **insère un étage au milieu**. Avec l'addition, ajouter un
cinquième étage change rétroactivement le sens des quatre autres — le même
barème donnerait deux prix selon l'année où on l'a écrit. La seconde : la
composition ne peut jamais franchir zéro par accumulation, là où quatre étages
additifs à −30 % rendraient un prix négatif.

Le coût assumé : ce n'est **pas** ce qu'un commercial calcule de tête. Un client
au téléphone qui entend « −20 et −10 » comprendra −30. C'est précisément pour ça
que la **trace** existe (plus bas) : le prix ne s'annonce pas comme un
pourcentage global, il se lit ligne à ligne.

Corollaire : **l'ordre des étages est une règle commerciale**, pas un détail
d'implémentation. −20 % puis −5 € ≠ −5 € puis −20 %. Le tableau plus haut _est_
la décision.

---

## Ce que ce plan ne touche pas

Le pipeline vit sur le plan **ligne** : produit × client × date × quantité.

Les `CartAdjustment` actuels — remise de retrait, frais de zone — vivent sur le
plan **panier** : ils dépendent de l'**acheminement**, pas du produit. Ils se
composent **après**, sur le sous-total, exactement comme aujourd'hui. Les fondre
dans le même pipeline ferait passer un frais de livraison pour une altération de
prix produit, et le premier écran qui afficherait « pourquoi ce prix ? » y
mélangerait deux choses sans rapport.

---

## Où le sens devient enfin une donnée

Sur les deux réglages actuels, la **direction** d'une altération est
**structurelle** : une remise de retrait baisse, un frais de zone monte, et
l'emplacement où la valeur est lue suffit à le dire. C'est pourquoi
`price-alteration-field` les verrouille (`lockedDirection`) et pourquoi
`toCartAdjustment` laisse tomber le sens.

Ici, c'est différent : un **supplément** produit existe (une préparation
spéciale, un conditionnement particulier), et il vit dans le même étage qu'une
remise. Le sens doit donc être **persisté** avec la règle. C'est le premier
usage réel de `PriceAlteration.direction` — et la raison pour laquelle il a été
modélisé comme un type distinct du `CartAdjustment` du contrat.

---

## Esquisse de schéma

```
price_rules
  id              text pk
  stage           enum(mercuriale, volume, promotion, geste)
  nature          enum(replace, alter)          -- contraint par l'étage
  scope_type      enum(global, category, product, variant)
  scope_id        text null                     -- null ssi scope_type = global
  audience_type   enum(all, segment, company)
  audience_id     text null
  min_quantity    int null                      -- étage volume : le palier
  -- replace : amount_cents. alter : direction + mode + value.
  amount_cents    int null
  direction       enum(increase, decrease) null
  mode            enum(percent, amount) null
  value           int null                      -- bp ou cents, toujours > 0
  valid_from      timestamptz not null
  valid_to        timestamptz null
  created_by      text not null                 -- qui a posé cette règle
  created_at      timestamptz not null

  -- Plancher, deux formes (fork 3). NULL = pas de plancher propre : celui de la
  -- plateforme s'applique. `floor_mode` contraint `floor_value` comme ailleurs.
  floor_mode      enum(percent, amount) null
  floor_value     int null                      -- bp du canonique, ou cents

  EXCLUDE USING gist (
    stage WITH =, scope_type WITH =, scope_id WITH =,
    audience_type WITH =, audience_id WITH =, min_quantity WITH =,
    tstzrange(valid_from, valid_to) WITH &&
  )
```

La contrainte d'exclusion **est** la règle « deux règles également spécifiques
au même moment n'existent pas ». Elle vit en base parce qu'un contrôle
applicatif se contourne par une insertion concurrente.

`created_by` n'est pas décoratif : sur un tarif négocié, la question posée six
mois plus tard est toujours « qui a accordé ça ? ».

---

## Ce qui est figé sur la ligne

À la passation, la ligne garde **la trace**, pas seulement le nombre :

```
{
  basePriceCents,
  steps: [{ stage, ruleId, label, resultCents }],
  floored: false,          // le plancher a-t-il relevé le prix ?
  finalCents
}
```

Même raison que la provenance de l'acheminement : un chiffre seul ne se défend
pas. Avec la trace, le panier peut afficher « pourquoi ce prix », le service
client peut répondre, et une facture contestée se relit.

---

## Chantier

**Les trois forks sont tranchés** (2026-08-17). S1 peut commencer : ce qui restait
à décider portait sur le contenu de la fonction pure, pas sur son emballage.

Ce que les décisions ajoutent au chantier, et qui n'y était pas :

- l'échéance d'un panier récurrent **résout son prix au moment où elle part**,
  donc `resolvePrice` sera appelée par le planificateur, pas à la souscription ;
- la fonction pure porte le **plancher** et rend `floored` dans sa trace ;
- l'écran d'une échéance à venir affiche un prix **estimé**, jamais promis.

- [x] **S1 — le domaine, pur.** ✅ 2026-08-17 — `src/pricing/domain/` :
      `resolvePrice(canonical, rules, context, floor)`, la spécificité, l'ordre
      des étages, la composition, l'arrondi unique et le plancher. Sans Nest,
      sans base, sans horloge. 32 tests.

      Deux choses décidées **en écrivant**, et qui manquaient au doc :

                                                                                              - **l'audience prime sur la portée produit.** « La plus spécifique sur les
                                                                                                deux axes » ne suffisait pas : une règle *produit / tous* et une règle
                                                                                                *globale / ce client* ne se dominent pas. Sans ordre entre les axes, le
                                                                                                gagnant dépendait du tri SQL. Une règle qui vise CE client gagne — sinon
                                                                                                une promotion générale écraserait un engagement négocié ;
                                                                                              - **le calcul traverse la chaîne en `bigint`.** « Arrondir une seule fois »
                                                                                                oblige à porter un rationnel ; en `number`, trois pourcentages sur un
                                                                                                article à 1 000 € dépassent `MAX_SAFE_INTEGER`, donc le calcul devient
                                                                                                faux exactement sur les articles chers.

- [x] **S2 — la persistance.** ✅ 2026-08-17 — table `price_rules`, contrainte
      d'exclusion GiST, port de lecture, branchement dans
      `OrderDrafting.resolveLines`. 10 tests e2e sur un vrai Postgres.

      Trois choses apprises en branchant :

                                                                                          - **`valid_from/to` sont en `timestamptz`.** Sur des `timestamp` sans
                                                                                            fuseau, `tstzrange()` dépend du réglage de session, n'est donc pas
                                                                                            `IMMUTABLE`, et Postgres **refuse** la contrainte d'exclusion. Le type
                                                                                            juste était aussi le seul possible ;
                                                                                          - **`coalesce` dans la contrainte n'est pas cosmétique.** NULL n'entre
                                                                                            jamais en conflit avec NULL : sans lui, deux règles globales / tous
                                                                                            clients aux fenêtres superposées passaient — le cas le plus courant ;
                                                                                          - **zéro est un prix canonique valide.** `resolvePrice` le refusait par
                                                                                            réflexe de rigueur ; ça cassait le chemin existant d'une commande sans
                                                                                            rien à encaisser. Seul le négatif est refusé.

- [x] **S3 — Réglages → Tarification.** ✅ 2026-08-17 — le plancher devient une
      donnée posée sur une portée, les deux agrégats d'écriture, l'API admin, et
      l'écran en cinq colonnes de nœuds. 23 tests unitaires + 20 e2e.

      Ce que la slice a ajouté au modèle, et qui n'était pas au doc :

                                                                                          - **le plancher est SCOPÉ**, résolu comme une règle (le plus spécifique
                                                                                            gagne), et il n'a ni étage, ni audience, ni fenêtre. Chacune de ces
                                                                                            trois absences est une décision : ce n'est pas une couche de prix
                                                                                            mais la limite que l'empilement ne franchit pas ; il protège la
                                                                                            maison contre son propre barème, pas un client contre un autre ; et
                                                                                            un garde-fou daté s'ouvrirait tout seul un matin. Un plancher
                                                                                            d'article REMPLACE celui de sa famille — il peut donc l'abaisser,
                                                                                            et c'est le geste « cet article est une exception » ;
                                                                                          - **l'identifiant d'un plancher dérive de sa portée.** Deux limites sur
                                                                                            la même cible ne peuvent pas porter deux noms : re-poser devient un
                                                                                            upsert sur la clé primaire, sans lecture préalable ni course ;
                                                                                          - **un seul invariant contraint la nature d'un étage**, et non quatre
                                                                                            par symétrie : la MERCURIALE pose un prix. Les autres étages peuvent
                                                                                            poser ou altérer — « 100+ à 1,80 € fixe » et « cet article offert »
                                                                                            sont des gestes réels. Un invariant sans raison finit contourné
                                                                                            plutôt que compris.

                                                                                      Trois choses apprises en branchant :

                                                                                          - **la contrainte d'exclusion ne remonte pas son SQLSTATE.**
                                                                                            L'adaptateur `pg` emballe la phrase de Postgres dans un
                                                                                            `DriverAdapterError` ; `23P01` n'apparaît ni dans le message ni dans
                                                                                            `meta`. On guette le NOM de la contrainte, qui est à nous et désigne
                                                                                            cette règle métier plutôt que n'importe quelle exclusion de la base ;
                                                                                          - **un segment de chemin vide ne s'apparie pas.** La limite globale a sa
                                                                                            propre route ; la supposition inverse rendait un 404 qui accusait la
                                                                                            donnée alors que c'était le routage ;
                                                                                          - **l'écran lit le catalogue qui FACTURE** (`ProductCatalogReader`), pas
                                                                                            la table du PIM. Les deux ne s'accordent pas encore (C5b) : un écran
                                                                                            de tarification bâti sur l'autre serait le simulateur d'un système
                                                                                            qu'on ne fait pas tourner.

                                                                                      Ce que l'écran refuse de laisser croire :

                                                                                          - la limite est en 2ᵉ colonne mais s'applique en FIN de chaîne : elle est
                                                                                            dessinée en garde-fou, pas en étage, et ne s'allume que lorsqu'elle a
                                                                                            réellement relevé un prix ;
                                                                                          - une règle de famille supplantée par une règle d'article est **barrée**
                                                                                            et non masquée — sinon le lecteur additionne deux remises dont une
                                                                                            seule agit ;
                                                                                          - le prix montré est celui d'**un** article pour quelqu'un **sans tarif
                                                                                            négocié**. Un encart le dit avant la grille.

                                                                                      **Reste ouvert** : la mercuriale n'est pas saisissable ici, faute de
                                                                                      sélecteur de client — c'est S5.

- [ ] **S4 — la trace.** Figée sur la ligne, affichée au panier et sur la fiche
      commande.
- [ ] **S5 — la mercuriale par client.** L'étage 1, une fois les quatre autres
      éprouvés.

**Dépendance amont** : S2 suppose que le prix canonique vient du PIM plutôt que
du seed B2B hardcodé — c'est la « Phase B2B » de
[`architecture-conditionnements-pricing.md`](architecture-conditionnements-pricing.md).
S1 n'en dépend pas et peut se faire tout de suite.

---

## L'élasticité : ce qu'une altération coûte en volume

**✅ Décidé le 2026-08-17.** Une remise ne se juge pas au pourcentage, elle se
juge à ce qu'elle **oblige à vendre**. Baisser de 20 % impose de vendre ×1,25
pour encaisser le même chiffre — et ce nombre-là est celui qu'un commercial doit
avoir sous les yeux au moment où il pose la règle, pas six mois plus tard.

### Iso-chiffre, pas iso-marge

Le ratio se calcule **à chiffre d'affaires constant** :

```
ratio = prix_avant / prix_après        (−20 % ⇒ 2,00 / 1,60 = ×1,25)
volume_requis = volume_de_référence × ratio
```

L'iso-**marge** serait plus juste commercialement et reste **hors d'atteinte** :
le prix de revient n'existe nulle part dans le modèle (cf. le plancher, plus
haut). Afficher une marge supposerait d'inventer un coût, et un chiffre inventé
dans un tableau de bord se lit comme une mesure. L'écran écrit donc « à chiffre
constant » en toutes lettres, et le calcul est structuré pour qu'un coût de
revient devienne une seconde base le jour où le PIM en portera un.

### Deux comparaisons, côte à côte

Elles répondent à deux questions différentes, et aucune ne remplace l'autre :

| Comparaison           | Ce qu'elle dit                                 | Sa limite                                         |
| --------------------- | ---------------------------------------------- | ------------------------------------------------- |
| **Avant / après**     | Est-ce que _cette règle_ a produit son effet ? | Sans recul, la fenêtre « après » ne prouve rien   |
| **Fenêtre glissante** | Où j'en suis aujourd'hui vs l'objectif         | Ne distingue pas la règle de ce qui bougeait déjà |

L'avant/après prend deux fenêtres de **même durée**, de part et d'autre de
`valid_from`. Quand la seconde est trop courte pour conclure, l'écran le dit
plutôt que d'afficher un écart qui n'a pas de sens.

---

## Ce que la limite EST — et ce qu'elle n'est pas

**✅ Décidé le 2026-08-17.** La limite exprime une **intention de performance**.
Ce n'est **pas** une marge calculée à partir de coûts opérationnels, et c'est un
choix, pas un manque.

### Une marge se dérive, une limite se décide

Calculer une marge oblige à trancher quinze arbitraires : matière seule ou
main-d'œuvre incluse, quelle clé pour l'amortissement du four, quel rendement,
quelles pertes, quelle moyenne mobile sur un beurre qui bouge chaque mois. Chacun
de ces arbitraires se propage ensuite **dans un prix**.

La limite court-circuite tout cela. Elle dit : « je ne descends pas sous 1,50 € ».
Un nombre, une intention, un auteur, une date.

### Le pire cas n'est pas l'absence de marge, c'est la marge FAUSSE

Un coût de revient à 15 % près — ce qui est optimiste sur du frais — affiché dans
un tableau de bord porte l'**autorité d'une mesure**. On prend alors des
décisions confiantes et fausses, et rien dans l'écran ne signale le problème.

Une limite ne prétend jamais être une mesure. C'est un **jugement**, donc elle se
conteste, se discute, et se change en un endroit.

Elle parle aussi la langue de celui qui décide. Personne ne dit « il me faut 62 %
de marge brute sur le croissant ». On dit « pas sous 1,50 ». Le modèle encode la
phrase réellement prononcée.

### Deux niveaux, deux intentions distinctes

| Niveau            | Nom dans le code | Ce qu'il exprime                                                           |
| ----------------- | ---------------- | -------------------------------------------------------------------------- |
| **Limite dure**   | `hard`           | la performance en dessous de laquelle on ne descend pas, quoi qu'il arrive |
| **Limite souple** | `dynamic`        | la performance qu'on **accepte de céder en échange** de volume             |

La limite souple n'est pas une exigence relâchée : c'est un **autre marché**.
Moins par unité contre plus d'unités. Les deux ensemble encodent une politique —
« ce que je veux par unité » et « ce que j'accepterais par unité si le volume
compense » — et cette politique se lit d'un coup d'œil, ce qu'une grille de coûts
ne permet jamais.

### La limite de ce choix, qu'il faut connaître

Une intention **date**. Le beurre prend 30 %, le tarif de liste bouge, et la
limite reste où elle était, en silence. Elle était juste en août, elle ne l'est
plus en février, et l'écran continue de l'afficher avec le même aplomb.

Le correctif n'est pas un coût de revient — ce serait revenir sur la décision. Il
tient en un **signal de dérive** : la limite porte déjà `createdBy` et
`updatedAt` ; comparer le canonique d'aujourd'hui à celui du jour où elle a été
posée suffit à demander « ton intention date de huit mois et le tarif a bougé de
12 %, tu la confirmes ? ». Ça ne calcule aucune marge et ne remplace aucune
décision : ça rappelle qu'une décision existe, et qu'elle a vieilli.

**✅ Livré le 2026-08-17.** La limite fige, à la pose, le tarif **représentatif**
des articles qu'elle vise — la **médiane** de leurs prix canoniques. Médiane et
non moyenne : une limite de famille ne doit pas se juger déplacée parce qu'une
pièce montée y côtoie des croissants.

Trois décisions y vivent :

- **une limite en FRACTION ne dérive pas.** « Jamais sous 50 % du tarif » suit le
  tarif par construction. Seule une limite en euros peut se retrouver décalée —
  et c'est ce qui rend ce signal petit plutôt qu'un tableau de bord de plus ;
- **l'âge seul n'alarme jamais.** Une limite posée il y a deux ans sur un tarif
  qui n'a pas bougé est aussi juste qu'au premier jour. Le seuil porte sur
  l'écart (5 %), pas sur l'ancienneté : alerter sur l'âge apprendrait au staff à
  ignorer l'alerte, ce qui est pire que ne pas l'avoir ;
- **confirmer est un geste à part** (`POST …/confirm`), pas un `PUT` déguisé. Sans
  lui, la seule façon d'éteindre le rappel serait de MODIFIER la limite — donc de
  changer une décision pour se débarrasser d'un signal.

Absence de référence ⇒ **silence**, jamais « 0 % d'écart » : ce serait faire
passer une absence de mesure pour une confirmation, et précisément sur les
limites les plus anciennes.

---

## Le plancher à deux étages

**✅ Décidé le 2026-08-17.** Un plancher unique force à choisir entre protéger et
laisser négocier. Il en faut donc deux, et une condition entre les deux :

- **le plancher dur** — jamais franchi, quoi qu'il arrive ;
- **le plancher dynamique** — plus bas, **déverrouillé** par le volume qui
  compense la baisse ;
- **la condition**, à deux termes, dont le défaut proposé par l'écran est
  exactement le ratio iso-chiffre calculé ci-dessus.

```
PriceFloorPolicy = {
  hard:    PriceFloor,                       // le mur
  dynamic: { floor: PriceFloor, unlock: {    // la porte, et sa clé
    minQuantity:      int | null,            // sur LA COMMANDE
    minVolumeRatioBp: int | null,            // sur une FENÊTRE observée
  }} | null,
}
```

**Les deux conditions doivent être remplies** — la plus stricte gagne. Une
condition `null` est réputée remplie ; les deux `null` feraient du plancher
dynamique un plancher tout court, et c'est refusé à la saisie.

### Le piège du volume observé, et ce qui le neutralise

Faire dépendre un prix de l'**historique** est dangereux : le même panier se
facturerait deux prix selon le mois, et le prix cesserait d'être explicable sans
rejouer l'historique. C'est la raison pour laquelle cette option a été signalée
avant d'être construite.

**Ce qui la rend tenable est la trace** (S4a, livrée le même jour). La décision
de déverrouillage est **évaluée une fois, à la passation, et figée avec le
prix** : quel étage de plancher a mordu, sur quel volume mesuré, contre quel
objectif. Une commande reste donc explicable à partir d'elle-même, même quand
l'historique a bougé — ce qui est exactement la propriété que le plancher
dynamique menaçait.

Corollaire, et il n'est pas négociable : **le volume observé ne se relit
jamais**. On ne recalcule pas le prix d'une commande passée.

### Faute de mesure, on protège

Si le volume de référence est absent (article neuf, aucun historique), la
condition de volume est **non remplie** : le plancher **dur** s'applique. Le
défaut penche du côté qui protège la maison — un déverrouillage par ignorance
serait une remise accordée par un trou dans les données.

## Le barème de volume : une échelle, pas N règles

_(2026-08-17 — implémenté)_

« 50+ à −10 % » et « 100+ à −5 % » sont **deux règles parfaitement
valides**, prises séparément. Ensemble, elles forment un barème que
personne n'a voulu : un client qui passe de 90 à 100 pièces voit sa remise
**fondre**. L'incohérence n'était exprimable nulle part — il n'existait
aucun objet d'où la voir.

L'échelle crée cet objet, et porte trois refus qui n'existaient pas :

| Refus                               | Pourquoi une règle isolée ne pouvait pas le porter |
| ----------------------------------- | -------------------------------------------------- |
| barème **régressif**                | chaque palier, seul, est valide                    |
| deux paliers **à la même quantité** | le gagnant dépendrait de l'ordre de saisie         |
| échelle **vide**                    | une règle vide n'existe pas, une échelle vide si   |

Deux décisions de modèle méritent leur ligne.

**Une seule unité pour toute l'échelle.** C'est ce qui rend la progression
_vérifiable_ : « 50+ à −5 %, 100+ à −0,20 € » ne se compare pas sans
connaître l'article. Un champ unique rend le mélange **impossible**, pas
interdit.

**Datée, et sans recouvrement.** Un barème a une fenêtre — on prépare
septembre au mois d'août — mais **deux barèmes ne se recouvrent jamais sur
la même cible**. Du coup l'identifiant ne dérive plus de la cible (deux
barèmes successifs coexistent), et l'unicité se déplace : elle n'est plus
absolue, elle vaut **à un instant donné**, tenue par une contrainte
d'exclusion GiST partielle. Un contrôle applicatif se contournerait par
une insertion concurrente ; l'agrégat, lui, ne voit qu'une échelle à la
fois.

**Le pipeline n'a pas bougé.** `ladderAsRule` rend l'échelle sous la forme
de la règle d'étage volume qu'elle est à cette quantité : la résolution
continue de ne connaître que des `PriceRule`, la spécificité continue
d'arbitrer (un barème de produit l'emporte sur celui de sa famille), et la
trace figée porte l'identifiant de l'échelle.

### Ce que l'écran en montre

La colonne du prix affiche la **grille** : le prix à chaque palier, sous le
prix unitaire. C'est la réponse à la question qu'un commercial pose au
téléphone — « à combien je lui fais les 100 ? » — et elle n'existait nulle
part, l'en-tête disant même que les paliers de volume ne s'y voyaient pas.

Chaque ligne est une **résolution complète** à la quantité du palier, pas
un « canonique × (1 − remise) » : ce dernier mentirait dès qu'une promotion
compose avec le palier, ou qu'un plancher le relève.

Le panneau saisit **tous les paliers ensemble**. Palier par palier, il
existerait un instant où « 50+ à −10 % » est posé et « 100+ à −5 % » pas
encore — un barème régressif, exactement ce que le modèle refuse.

### La porte fermée : l'étage volume ne se saisit plus

_(2026-08-17 — implémenté)_

Tant que le barème et la **règle volume libre** coexistaient, les trois
refus ci-dessus étaient contournables sans le vouloir : on posait « 100+ à
−5 % » comme une règle ordinaire, à côté d'un barème accordant −10 % dès
50, et le palier isolé l'emportait **par spécificité** — deux décisions au
même étage, dont aucune ne voyait l'autre.

L'étage est donc fermé à la saisie, sur trois épaisseurs :

| Où                              | Comment                                                     |
| ------------------------------- | ----------------------------------------------------------- |
| le fil (`@lfd/contracts`)       | `authoredPriceStageSchema` — `volume` hors de l'énumération |
| le domaine (`PricingRuleDraft`) | `AuthoredPriceStage` : l'étage est **inexprimable**         |
| l'écran (panneau Altération)    | l'option a disparu, le champ « à partir de » avec elle      |

Le type plutôt qu'un refus à l'exécution : un `throw` aurait laissé le code
appelant compiler puis échouer. Aucune erreur de domaine n'est née de ce
lot — il n'y a rien à refuser quand il n'y a rien à écrire.

**L'étage `volume` reste** dans `PRICE_STAGES`, et ce n'est pas une
inconséquence : `ladderAsRule` l'emprunte au moment du calcul, et toutes
les traces déjà figées le nomment. L'état persisté d'une règle l'accepte
donc toujours — les règles volume d'avant le barème existent, archivées, et
une facture les cite. Ce qui disparaît est la façon de l'écrire, pas
l'étage.

## Deux marqueurs : l'écran daté, et la comparaison

_(2026-08-17 — implémenté)_

Tout ce que l'écran montre est **déjà daté** : les fenêtres de validité, les
suspensions, les archivages, et `resolvePrice` qui prend un instant. Il ne
manquait qu'un paramètre — `GET /admin/pricing?at=<ISO>` — et **une clause à
corriger** :

> **« Archivée » se lit à l'instant demandé, pas au présent.**

La lecture excluait `archived_at IS NOT NULL`. Une règle rangée hier
s'appliquait pourtant le mois dernier : sans `OR archived_at > at`, le passé
s'appauvrissait à chaque rangement — silencieusement, ce qui est le pire des
deux. Même correction pour les limites et les barèmes, et les filtres de
suspension comparent désormais à l'instant lu plutôt qu'à `null`.

> **Corrigée à un endroit, pas à deux** — _revue adversariale du 2026-08-17_
>
> La correction n'avait atterri que dans la requête du tableau, écrite en ligne
> dans l'adaptateur. `PriceRuleReader.listAll()` et `PriceFloorReader.listAll()`
> gardaient l'ancienne clause `archived_at IS NULL` — et n'étaient **appelés par
> personne**, ce qui est la seule raison pour laquelle rien n'a cassé. Deux
> vérités sur « depuis quand cette décision a-t-elle disparu » ne se remarquent
> que le jour où elles divergent, et ce jour-là c'est un prix qu'on n'explique
> plus. La clause s'écrit maintenant **une fois**, dans
> `infrastructure/archived-at.ts`, et les deux ports prennent leur `at`.

### Où vit le montage de l'écran

_(2026-08-17 — revue adversariale)_

L'adaptateur Prisma faisait trois métiers en 397 lignes : lire des lignes, les
convertir, et **composer l'écran** — résoudre chaque prix, arbitrer les
planchers, calculer les paliers et les recouvrements. Il changeait donc aussi
bien parce que Postgres bougeait que parce qu'une colonne s'ajoutait à l'écran,
et la composition ne pouvait s'éprouver qu'en montant une application Nest et
une base : c'est-à-dire jamais.

| Couche                                   | Ce qu'elle fait maintenant                                   |
| ---------------------------------------- | ------------------------------------------------------------ |
| `application/board-item.ts`              | monte un nœud : prix résolu, trace, paliers, plancher, marge |
| `application/ports/pricing-board.reader` | le contrat de l'écran                                        |
| `infrastructure/prisma-…-board.reader`   | lit les lignes, les convertit, appelle la composition        |

Le **port a quitté `domain/`**. Il se contractualise en `PricingBoardView`,
c'est-à-dire en type de **fil** : c'était le seul fichier de domaine à importer
`@lfd/contracts`, et il y faisait entrer la forme d'un écran. Les ports du
domaine — règles, planchers, barèmes, volumes — ne parlent que de types de
domaine, et cette frontière doit rester lisible d'un coup d'œil sur les imports.

### La mesure des ventes ne se paie que là où on la regarde

`read()` rend le tableau ; `readForScreen()` y ajoute le rapport prix/volume.
Deux méthodes plutôt qu'un booléen : un drapeau aurait mis les deux appelants
dans la même méthode, et le jour où l'un change de besoin, c'est l'autre qui
casse.

La comparaison de deux marqueurs lit **deux tableaux** dont elle ne veut que les
prix — puis mesure elle-même les volumes sur la fenêtre qui les sépare. Tant que
l'élasticité était soudée à `read()`, elle payait donc quatre requêtes de ventes
(deux fenêtres × deux tableaux, plus deux par date de changement distincte)
qu'elle jetait aussitôt.

### Ce que la lecture datée dit, et ce qu'elle ne dit pas

| Elle répond à                                       | Elle ne répond PAS à                   |
| --------------------------------------------------- | -------------------------------------- |
| quelles **décisions** étaient en vigueur ce jour-là | quel prix a été **facturé** ce jour-là |

### ✅ 2026-08-18 — le canonique est historisé

Ce paragraphe disait « le tarif canonique vient du PIM au présent, il n'est pas
historisé ». Ce n'est plus vrai, et le blocage n'était pas celui qu'on croyait :
le canonique venait d'un **seed compilé**, donc historiser n'aurait rien
historisé. Une fois la bascule faite (Cat C5b), il devient une donnée vivante,
et la trace suit.

`catalog_price_history` : append-only, une ligne par **changement** de prix
effectif (décision B2B si elle existe, sinon le tarif du PIM).

> **Écrite au seul endroit par lequel les deux chemins passent.**
>
> `CatalogItemRepository.saveMany`, dans la MÊME transaction que le prix. Un
> push du PIM comme une décision du back-office y aboutissent ; aucun appelant
> ne peut l'esquiver. Il n'y a donc **pas** de port d'écriture — un port séparé
> aurait permis d'écrire un prix sans sa trace, au premier oubli ou au premier
> chemin de rattrapage. C'est la même discipline que l'acte obligatoire des
> règles tarifaires.

Une ligne n'est posée que si le prix **diffère** du dernier tracé : sans cette
garde, un push de quatre-vingt-douze articles inchangés en écrirait
quatre-vingt-douze à chaque synchronisation.

| La lecture datée vise… | Ce qu'elle rend                                  |
| ---------------------- | ------------------------------------------------ |
| **dans** l'historique  | le tarif de ce jour-là, et les décisions d'alors |
| **avant** l'historique | le tarif d'aujourd'hui, et les décisions d'alors |

Le second cas ne se cache pas : `canonicalHistoryStartsAt` traverse le fil, et
la frise change sa mise en garde — avec la date de début. L'histoire commence
quand on l'écrit, et un tableau qui aurait l'air complet avant est exactement le
mensonge que cette table existe pour supprimer.

Ce qui **n'a pas** changé : la vérité de ce qui a été facturé vit toujours là où
elle a toujours vécu — la **trace figée** sur la ligne de commande. L'historique
explique un prix ; il ne remplace pas une facture.

### La comparaison

`GET /admin/pricing/comparison?from=&to=` met les deux lectures côte à côte et
y ajoute ce qu'aucune des deux ne contient : le **volume vendu sur la fenêtre
qui les sépare**, comparé à la fenêtre **miroir** juste avant, de même durée —
comparer trente jours à quatre-vingt-dix ferait passer une saison pour un effet.

Par article : le prix aux deux instants, l'écart en points de base, les pièces
vendues et leur variation. Une variation depuis **zéro** rend `null` plutôt
qu'un chiffre : partir de rien n'est pas une variation, c'est une apparition, et
« +∞ % » sur une nouveauté ne dit rien de ce qu'on a décidé.

L'écran n'affiche que les articles **qui ont bougé**, du plus gros écart au plus
petit : quatre-vingt-douze lignes dont trois portent une information noieraient
exactement ce qu'on est venu chercher.

### La frise — `/reglages/tarification/frise`

_(2026-08-17 — implémenté)_

Deux façons de lire le même prix, et une route pour chacune : la **grille**
pour décider aujourd'hui, la **frise** pour comprendre ce qui s'est passé.

Un axe horizontal, une barre par décision — règles du catalogue, des familles,
et barèmes —, et des marqueurs qu'on pose **à la main** :

| Geste                         | Ce qui s'affiche                                                            |
| ----------------------------- | --------------------------------------------------------------------------- |
| un clic                       | le catalogue à cette date : prix par article, paliers de volume s'il y en a |
| un clic maintenu, puis glissé | deux catalogues, et entre eux l'écart de prix et le volume vendu            |

Poser le marqueur **sur l'axe** plutôt que dans deux champs de date est tout
l'intérêt : les barres restent visibles pendant le geste, donc on vise une
promotion, un barème, la veille d'un changement — sans lire une date pour la
recopier. Les deux champs de date restent là et pilotent la même sélection : un
axe qui ne s'atteindrait qu'à la souris fermerait l'écran à ceux qui n'en ont
pas, et rendrait la visée au jour près impossible à tout le monde.

Deux règles de géométrie méritent leur ligne, et vivent en fonctions pures
(`axis-model.ts`) parce qu'elles se testent sans pointeur :

- **l'axe couvre toujours aujourd'hui**, même si toutes les décisions sont
  anciennes — une frise qui s'arrêterait à la dernière laisserait croire que le
  temps s'est arrêté avec elle ;
- **un instant se pose au jour**, jamais à la milliseconde : le pointeur offre
  une précision que la donnée n'a pas, et deux lectures à trois heures d'écart
  rendraient le même catalogue en donnant l'illusion d'avoir mesuré quelque chose.

Un glissement de moins de 1,5 % de la largeur reste un **clic** : sans ce seuil,
une main qui tremble ouvrirait une période d'un jour, et l'écran répondrait à une
question que personne n'a posée.

> **L'étiquette sous le doigt dit le jour qui sera retenu** — _revue du 2026-08-17_
>
> Elle ne le disait pas. La sélection s'arrondissait au jour **UTC** pendant que
> l'étiquette formatait l'instant survolé dans le **fuseau du navigateur**. À
> Paris l'été, tout point tombant après 22 h UTC — environ 8 % de la largeur de
> l'axe — annonçait le lendemain, retenait la veille, et le titre du tableau
> juste dessous écrivait la veille : deux dates à l'écran pour un seul geste.
>
> L'étiquette dérive maintenant du **jour retenu**, rendu en UTC comme le titre :
> les deux ne peuvent plus diverger, c'est la même valeur. Le test balaie la
> piste pixel par pixel et compare **pendant le geste** — la première version
> comparait après le relâchement, donc après l'arrondi, et restait verte sur le
> bug.

## L'engagement de volume — le barème sur cumul

### ✅ Décidé le 2026-08-18 — le cumul, pas le prix fixe

Vendre un volume sur une durée admettait deux formes, et **au volume promis
elles donnent le même prix**. Elles ne divergent que lorsque la promesse n'est
pas tenue — c'est donc là, et nulle part ailleurs, que le choix se fait :

|                  | **Prix fixe daté**                                               | **Barème sur cumul**                          |
| ---------------- | ---------------------------------------------------------------- | --------------------------------------------- |
| Au volume promis | le prix négocié                                                  | le même prix                                  |
| Trajectoire      | le tarif de fin dès le 1er jour                                  | on monte les paliers en cours de route        |
| Sous-performance | **aucune réponse arithmétique** → clause + rattrapage rétroactif | le client reste au palier atteint             |
| Excédent         | livré au prix promis                                             | le palier suivant s'ouvre tout seul           |
| Sortie anticipée | à négocier, puis à facturer                                      | rien à régler : les factures sont déjà justes |

Le rattrapage rétroactif est ce qui tranche. Il suppose de réécrire
l'explication de factures **déjà payées**, alors que la trace figée sur la ligne
existe exactement pour l'empêcher — et que renommer une règle est déjà, pour
cette raison, la seule modification qu'une décision tarifaire accepte.

Le cumul, lui, rend chaque facture juste **au moment où elle est émise**. Aucune
n'est jamais révisée, et les conditions de sortie cessent d'être un texte pour
devenir de l'arithmétique.

### Le mécanisme, en une ligne du domaine

`applies` juge le seuil sur deux mesures différentes : le **cumul** pour l'étage
`volume`, la **quantité de la commande** pour tous les autres.

```ts
const measured = rule.stage === "volume" ? volumeQuantityOf(context) : context.quantity;
```

C'est une distinction, pas une exception. « À partir de 50 » posé sur une
promotion parle de CETTE commande ; le même nombre sur un palier de barème parle
du volume négocié. Les confondre aurait accordé, sur un engagement annuel, la
promotion dès la première livraison.

Le reste de la chaîne ne change pas : un barème continue de se présenter comme
la règle d'étage volume qu'il est, la spécificité arbitre comme d'habitude, et
`resolvePrice` n'apprend aucun cas de plus.

### Quatre décisions, et leurs refus

- **le cumul inclut la commande en cours.** Sans cela le palier arriverait avec
  une commande de retard, et un client prenant ses 6 000 pièces en une fois
  paierait le tarif d'entrée sur la totalité ;
- **la promesse ne calcule rien.** `promisedQuantity` sert au suivi ; un prix qui
  en dépendrait serait une remise accordée sur une **intention** ;
- **pas de pause**, seulement clore. Suspendre laisserait une période où le cumul
  grossit sans que le palier suive — un prix que personne n'a décidé ;
- **pas de modification.** Changer la période d'un engagement en cours
  déplacerait le palier de commandes déjà facturées, dont la trace ne bouge pas.
  Pour corriger : clore, et signer.

Une contrainte d'exclusion GiST interdit deux engagements vivants sur la même
cible pour un client : deux cumuls concurrents donneraient deux paliers, donc un
prix dépendant du tri.

### La mesure est figée avec le prix

`pricing_commitment` sur la ligne de commande porte `{ commitmentId,
promisedQuantity, cumulativeQuantity }`. Même principe que la décision de
plancher : un prix qui dépend de l'historique cesse d'être explicable dès que
l'historique bouge. Sans cette colonne, « pourquoi ce palier-là ? » n'a plus de
réponse dès la commande suivante — le cumul d'alors n'existe nulle part ailleurs.

### Ce que ça ne fait pas

Aucune **réservation** : rien n'est bloqué, rien n'est dû. Un engagement déclare
une période et un volume visé ; le prix ne dépend que de ce qui a été commandé.
C'est ce qui permet de laisser les conditions de sortie anticipée de côté sans
laisser un trou : il n'y a rien à régler.

---

## Le banc d'essai — `/reglages/tarification/simulateur`

**✅ 2026-08-18.** Trois écrans lisent le même prix, et chacun répond à une
question que les deux autres ne posent pas :

| Écran             | La question                                                 |
| ----------------- | ----------------------------------------------------------- |
| La **grille**     | qu'est-ce qui est décidé, aujourd'hui, sur le catalogue ?   |
| La **frise**      | qu'est-ce qui l'était, tel jour, et qu'est-ce qui a bougé ? |
| Le **simulateur** | pour CE client, à CETTE quantité, ça fait combien ?         |

Le simulateur est un **banc d'essai** : un article, un client (ou « de
passage »), et le prix à plusieurs quantités, côte à côte.

**Rien n'y est calculé.** Chaque ligne du tableau est un appel à
`POST /admin/orders/quote`, c'est-à-dire à la fonction qui **facture**. Un
simulateur qui referait l'arithmétique à sa façon finirait par annoncer autre
chose que la commande — soit exactement le défaut qu'il sert à détecter.

Deux décisions dans le choix des quantités sondées :

- **le barème n'est pas deviné, il est lu.** Un premier devis à 1 pièce dit quel
  barème vise l'article ; ses seuils donnent les quantités suivantes. Les
  inventer d'avance aurait produit un tableau qui rate les marches ;
- **on sonde chaque seuil ET le cran juste en dessous.** La marche entre 49 et 50
  est la seule chose qu'un client remarque ; n'afficher que les seuils atteints
  la cacherait. Le nombre de sondes est borné à huit — chacune est une requête, et
  un barème à douze paliers en ferait vingt-cinq sur un geste de curiosité.

L'écart au tarif y est **signé** : le banc sert aussi à voir qu'une règle a fait
**monter** un prix (un supplément de préparation, une mercuriale devenue plus
chère que le catalogue depuis que le PIM a baissé). L'écraser à zéro cacherait ce
qu'on vient chercher.

### Le mode temporel — l'engagement, et ses trois issues

Le mode ponctuel répond à « à cette quantité, combien ? ». Le mode temporel
répond à la question qui décide d'un engagement : **« et s'il n'en prend que
70 % ? »**. Trois scénarios sont projetés — 70 %, 100 %, 130 % de la promesse —
parce que le manque et l'excédent **encadrent** la promesse plutôt que de la
commenter. Un tableau qui n'afficherait que le nominal laisserait croire que la
question est le prix, alors qu'elle est le risque.

Il repose sur `POST /admin/pricing/projection` : ce que l'article coûterait à des
niveaux de cumul qui n'existent pas encore. Réappliquer côté écran la règle « le
plus haut palier atteint gagne » aurait suffi — c'est une ligne — et aurait créé
exactement la divergence que ce contexte évite. Un e2e l'interdit : projection et
commande réelle rendent le même prix au même cumul.

Trois décisions dans la projection :

- **une seule lecture de base** pour tous les niveaux — règles, barèmes et
  planchers ne dépendent pas du cumul ;
- **la porte du plancher dynamique reste fermée** : une projection ne peut pas
  prouver un volume observé, et l'ouvrir sur une hypothèse accorderait une remise
  que rien n'a établie ;
- **la borne dit non** au-delà de vingt-quatre niveaux plutôt que de tronquer en
  silence — une réponse amputée se lit comme une réponse.

Les trois scénarios partent en **un seul appel** : leurs niveaux sont mis en
commun avant d'être demandés. Trois appels résolus à trois instants pourraient
tomber de part et d'autre du basculement d'une promotion, et le tableau
comparerait alors des mondes différents.

La colonne qui porte la comparaison est le **prix moyen réellement payé** — les
volumes différant d'un scénario à l'autre, les totaux ne se comparent pas. Sur
l'exemple des tests : promesse tenue 1,60 €, promesse manquée 1,80 €. Le client
qui sous-performe paie plus cher, sans clause, sans rattrapage, et sans qu'aucune
facture soit révisée. **C'est tout l'argument du cumul, rendu lisible.**

Ce que le banc **ne dit pas**, et qu'il écrit en haut de page : les prix sont HT
et hors acheminement. Remise de retrait, frais de zone et TVA dépendent d'une
livraison qu'un devis ne connaît pas — les inventer donnerait un total que la
validation contredirait.

---

## La trace, écrite puis rendue

_(2026-08-18 — S4 complet)_

La trace figée sur la ligne répondait déjà à « pourquoi ce prix », et **personne
ne la lisait**. Elle traversait le fil depuis S4a sans qu'aucun écran ne
l'affiche : la seule réponse à un client qui conteste restait « c'était le prix ».

| Où                                             | Ce qui s'affiche                                                                   |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| détail de commande (client **et** fiche staff) | tarif d'entrée barré, étages dans l'ordre, pastille si une limite a relevé le prix |
| panier du staff, **avant** de valider          | le prix que la validation appliquera, tarif d'entrée barré à côté                  |

Deux décisions portent cette tranche.

> **Aucune porte entre le client et le staff.**
>
> Le libellé d'une règle est, par contrat, « ce que la trace affichera au client
> et au service client ». La décision était prise depuis S3 ; elle n'avait
> jamais été appliquée. Un composant unique — `lfd-order-detail` — sert les deux
> écrans, et c'est le point : au téléphone, les deux interlocuteurs regardent la
> même chose.

> **Le devis passe par la résolution qui facture.**
>
> `POST /admin/orders/quote` réutilise `resolveLines` et n'ajoute aucune
> arithmétique. Une seconde implémentation de l'estimation aurait fini par
> diverger d'un centime de celle qui facture, et l'écart se serait découvert
> devant le client. Le test qui garde cette propriété ne vérifie pas que le devis
> « a l'air juste » : il **compare le devis à la ligne de commande réellement
> écrite**.

Ce que le devis ne dit pas, et pourquoi : il s'arrête au **sous-total HT**.
Remise de retrait, frais de zone et TVA dépendent d'un acheminement qu'une
estimation ne connaît pas — les inventer donnerait un total que la validation
contredirait.

Enfin, une ligne **sans trace** ne comble rien. Les commandes antérieures au gel
en portent zéro, et inventer un tarif d'entrée y afficherait une remise que
personne n'a accordée, sur une facture déjà payée.

## Ce qu'une portée peut porter

_(2026-08-17 — implémenté)_

Une limite s'exprime de deux façons — une **fraction** du tarif, ou un
**montant** en euros — mais les deux n'ont pas la même portée d'emploi.

> **Un montant ne veut rien dire au-delà d'un article.**

« Jamais sous 1,50 € » sur tout le catalogue laisserait passer une pièce
montée à 1,50 € et relèverait un croissant qui se vend 2,00 € : le même
mur, deux effets opposés. Une fraction, elle, suit l'article — « jamais
sous 60 % du tarif » protège les deux à leur échelle.

| Portée                | Fraction (%) | Montant (€) |
| --------------------- | :----------: | :---------: |
| tout le catalogue     |      ✅      |     ❌      |
| famille               |      ✅      |     ❌      |
| produit / déclinaison |      ✅      |     ✅      |

Le refus vit dans l'**agrégat**, pas dans le schéma de fil : c'est une
règle du modèle, et l'import comme le seed doivent la rencontrer aussi.
Il vaut pour le mur **et** pour la porte — une porte est une limite, comme
lui. L'écran, de son côté, ne propose pas le choix au-delà d'un article et
écrit pourquoi : offrir une option pour la refuser ensuite est la façon la
plus sûre de faire saisir deux fois la même chose.

### Quand deux altérations se recouvrent

Une promotion du 1er au 20, un geste du 15 au 30 : **du 15 au 20, les
deux jouent**. Personne ne l'a décidé — chacune a été posée pour de bonnes
raisons, à des semaines d'intervalle — et le client, lui, paie le cumul.

Chaque famille porte donc une **frise** : une ligne par règle sur un axe de
dates commun, et sous les barres, les tranches où plusieurs règles sont en
vigueur. Le recouvrement se **voit** au lieu de se déduire en comparant
quatre dates de tête.

> **Elle porte la LIGNÉE — catalogue puis famille — et non le seul catalogue.**

_(déplacée là le 2026-08-17, après avoir vécu sur la bande du catalogue.)_
La raison est structurelle : deux règles de **même étage et même portée**
ne peuvent pas se recouvrir, la contrainte d'exclusion l'interdit. Une
frise du seul catalogue n'avait donc presque rien à montrer — au mieux une
promotion croisant un geste. C'est **entre niveaux** que le croisement
arrive, tout le temps : une promotion de famille recouvre la promotion du
catalogue, et **l'évince**.

Le tableau montrait déjà la règle barrée quand elle était supplantée. Il ne
disait ni **à partir de quand**, ni **jusqu'à quand** — les deux seules
choses qu'on veut savoir. La frise le dit en creusant la barre de
l'évincée sur la tranche exacte où elle perd : elle n'a pas disparu, elle
ne produit simplement rien.

Qui gagne se décide avec `compareSpecificity`, **la comparaison qui
facture** — la réimplémenter dans la frise aurait donné un écran qui
désigne un gagnant et une caisse qui en applique un autre.

Deux choses que cette frise ne confond pas :

- **le cumul n'est pas une somme.** −20 % puis −10 % font **−28 %**, parce
  que la seconde s'applique au prix sortant de la première. Le chiffre est
  calculé côté serveur, avec l'arithmétique exacte qui facture — un cumul
  recalculé dans le navigateur finirait par annoncer un prix que la caisse
  ne pratique pas ;
- **tout recouvrement n'est pas un cumul.** Dans un **même étage**, la
  règle la plus spécifique évince l'autre : elles ne s'additionnent pas.
  L'écran dit alors « la plus précise gagne » et ne montre aucun
  pourcentage. Confondre les deux ferait crier au danger là où il n'y a
  qu'une relève.

Le cumul se tait aussi dès qu'une des règles n'est pas une altération en
pourcentage : un montant en euros ne se compose pas en fraction sans
connaître l'article, et cette vue n'en connaît aucun.

Et le cumul ne compte **que les gagnantes** : une évincée ne produit rien,
et l'inclure afficherait un chiffre que la caisse ne facture pas. Sur une
tranche où la famille évince le catalogue puis compose avec un geste, c'est
la famille × le geste — jamais les trois.

Une règle **suspendue** ne recouvre rien — elle n'agit plus, et l'annoncer
ferait chercher un cumul qui n'existe pas.

### Le barème sur la frise

_(2026-08-17 — implémenté)_

Le barème a sa propre table, et la frise ne le voyait donc plus. Elle
disait **moins que la vérité**, ce qui est pire qu'en dire peu : une frise
sans barème se lit « rien d'autre ne joue », alors que « −20 % sur le
catalogue **et** −10 % dès 50 » est le cumul le plus banal du modèle.

Il y entre par `ladderAtTier`, qui rend l'échelle sous la forme de la règle
d'étage volume qu'elle est **à un palier donné**. Ni la résolution ni
l'arbitrage ne bougent : deux barèmes de niveaux différents s'évincent
comme deux règles, puisqu'ils partagent l'étage volume.

> **Un barème n'a pas un cumul — il en a autant que de paliers.**

Composer avec un seul chiffre obligerait à choisir un palier, donc à
afficher un pourcentage faux pour toutes les autres quantités. La frise
calcule les **deux bouts** — l'échelle à son premier palier, à son dernier
— et l'écran annonce « de −28 % à −36 % » quand ils diffèrent.

Les prix exacts, eux, restent dans la **colonne du prix** : là, chaque
palier est une résolution complète sur un article donné. Une frise couvre
une famille entière, elle ne peut pas être exacte au centime — et ne le
prétend pas.

### Les altérations du catalogue

Une règle de portée `global` existait dans le modèle depuis le premier
jour, et n'était visible nulle part : l'écran n'offrait de « + » que sur
les familles et les articles. La **bande du catalogue**, en tête de
l'écran, porte désormais les deux décisions les plus larges — la limite
dont chaque famille hérite, et les altérations que rien de plus précis n'a
évincées.

C'est le bon endroit pour la hausse de saison ou le geste de fin d'année :
un seul geste plutôt qu'un par famille, et une seule ligne à retirer quand
l'opération se termine.

## Le cycle de vie d'une décision, et le journal qui la raconte

_(2026-08-17 — implémenté)_

Une règle tarifaire cessait d'exister d'une seule façon : `DELETE`. C'est
un problème double. Le four tombe en panne un mardi après-midi et la
promotion doit s'arrêter aujourd'hui — la seule issue était de supprimer
la règle, ou de mentir sur sa fenêtre. Et une règle supprimée emporte
l'explication d'une facture qui, elle, reste.

### Trois états, deux sorties qui n'ont rien à voir

| État           | Elle agit ?             | Son créneau |
| -------------- | ----------------------- | ----------- |
| **en vigueur** | quand sa fenêtre le dit | occupé      |
| **en pause**   | non                     | **réservé** |
| **archivée**   | non, définitivement     | **libéré**  |

La différence entre les deux sorties **est** le sujet. Elle vit dans une
seule clause SQL :

```sql
ALTER TABLE price_rules
  ADD CONSTRAINT price_rules_no_overlap
  EXCLUDE USING gist (…)
  WHERE (archived_at IS NULL);
```

Archiver doit **libérer** le créneau : sinon une règle rangée l'an dernier
interdirait pour toujours d'en poser une semblable, et le staff n'aurait
d'autre issue que la suppression — donc l'effacement d'une explication.
Suspendre doit le **garder** : sans ça, quelqu'un poserait une jumelle
pendant la pause, et la reprise échouerait sur un chevauchement que
personne n'a vu venir. La promotion deviendrait irrécupérable le jour même
où l'on veut la rallumer.

### La pause ne touche pas la fenêtre

« Du 1er au 31 août » suspendue trois jours ne se prolonge pas jusqu'au
3 septembre. Elle a perdu trois jours, ce qui est exactement ce qui s'est
passé. Repousser la fin en douce réécrirait une décision commerciale pour
compenser un incident d'exploitation — et personne, en relisant la règle,
ne saurait plus quelle était l'intention d'origine. Le journal, lui, dit
que la promotion a été suspendue du 12 au 15, et pourquoi.

### Un seul champ pour le calcul

La résolution ne distingue pas la pause de l'archivage : `suspendedFrom`,
le plus tôt des deux. Les deux disent « cette règle n'agit plus », et ce
qui les sépare ne regarde que le staff et la base.

Il est comparé à l'instant **de résolution**, pas à « maintenant » : une
promotion suspendue le 12 s'appliquait encore le 10. Un booléen `paused`
aurait effacé cette distinction et fait mentir toute relecture d'une date
passée.

### Chaque refus protège d'un geste qui aurait eu l'apparence d'un effet

- **suspendre deux fois** → le second croirait avoir arrêté ce que le
  journal attribue au premier ;
- **suspendre une règle terminée** → l'écran afficherait « en pause » sur
  une promotion morte ;
- **toucher une règle archivée** → une décision close ne se rouvre pas ;
  on en pose une nouvelle, qui porte son auteur et sa date, ce qu'elle est
  réellement. C'est un `409`, pas un `404` : la règle existe, elle est
  scellée.

Une règle **pas encore commencée** se suspend très bien — c'est même le
cas le plus utile : désamorcer une promotion programmée avant qu'elle ne
parte.

### Le journal

`pricing_events` est **strictement additif** : aucune colonne mutable,
aucun `updated_at`, et aucun port applicatif n'expose de modification ni
d'effacement. Un journal réinscriptible ne prouve rien — le premier jour
où il servirait vraiment serait celui où quelqu'un aurait intérêt à le
corriger.

La garantie « aucun changement sans sa trace » est **structurelle** : les
ports d'écriture prennent l'acte en même temps que la mutation, et
l'adaptateur écrit les deux dans une seule transaction. Un argument
obligatoire ne s'oublie pas ; un second appel, si — au premier chemin
d'erreur, au premier rattrapage.

```
posed · paused · resumed · archived · confirmed · replaced
```

`confirmed` n'est pas un synonyme de `posed` : il dit « j'ai regardé
l'écart, et je maintiens ». Les confondre effacerait du journal la seule
chose qu'on y cherche — cette limite a-t-elle été **revue**, ou
traîne-t-elle depuis deux ans ?

Deux choix de forme méritent leur ligne. La **phrase** de chaque acte est
figée à l'écriture, avec un vocabulaire redéclaré : elle doit rester
lisible après l'archivage de la règle, et survivre au jour où l'écran
renommera « geste ». L'**auteur** n'est stocké que par son `sub`, sans
instantané du nom — contrairement aux traces client : l'annuaire staff est
à nous, un `sub` est stable, et afficher le nom d'aujourd'hui est la
réponse utile (on cherche qui aller voir, pas comment il s'appelait).

Il n'y a **pas** de clé étrangère vers `price_rules` : l'acte doit survivre
à son sujet, et une cascade emporterait exactement la trace qu'on gardait.

### Les limites suivent, sans versionnage

Une limite s'archive aussi. Mais son identifiant est **dérivé de la
portée** (`category:viennoiserie`), ce qui rend « une seule limite par
cible » structurel : il n'y a jamais qu'une ligne. Une limite retirée puis
re-posée reprend donc la sienne, et son histoire complète vit dans le
journal — l'endroit fait pour ça.

### À l'écran

Le journal se lit **là où la décision se voit** : un bouton sur le nœud de
la règle, un autre dans le panneau de la limite. Chercher qui a suspendu
une promo ne devrait pas demander d'ouvrir un autre écran.

« Retirer » ouvre un panneau qui **demande pourquoi**, plutôt qu'une
confirmation en ligne : « êtes-vous sûr ? » ne demande rien, alors que la
seule question utile six mois plus tard est celle-là. La décision qu'on
range reste sous les yeux pendant qu'on l'explique, et l'écran dit
**avant** que le geste ne se défait pas.

Côté fil, le motif voyage par `POST .../archive` et non par le `DELETE` :
un `DELETE` ne porte pas de corps de façon fiable à travers les
intermédiaires HTTP. Le `DELETE` reste, sans motif.

### Reste ouvert

_(mis à jour le 2026-08-17, après la revue adversariale)_

Sur le **journal et le cycle de vie** :

- le journal n'est pas paginé (il rend les 200 derniers actes d'un sujet,
  les 50 derniers tous sujets confondus) ;
- l'auteur s'affiche par son `sub`, pas par son nom : l'annuaire staff
  existe, la jointure n'est pas faite ;
- une règle ne se **modifie** pas : il n'y a que poser, suspendre, reprendre,
  archiver. Corriger une faute de frappe oblige à archiver et reposer, ce qui
  salit le journal pour rien ;
- ~~un barème ne se suspend que par l'agrégat~~ — **réglé** : `pause`,
  `resume` et `archive` existent sur `VolumeLadderAggregate`, avec leurs routes.

Sur la **structure**, ce que la revue a laissé volontairement en place :

- l'adaptateur du tableau interroge encore Prisma **directement** plutôt que par
  les ports `PriceRuleReader` / `PriceFloorReader`. Le blocage est réel et vaut
  d'être nommé : `PriceRuleView` porte la **provenance** (auteur, dates de
  pose, de pause, d'archivage, motif) que le `PriceRule` du domaine n'a pas.
  Passer par les ports suppose donc de séparer la décision de sa provenance —
  `{ rule, provenance }` — et de convertir la vue depuis ces deux morceaux.
  C'est le bon modèle ; c'est aussi une refonte des deux convertisseurs et de
  tout ce qui les appelle, qu'on ne fait pas dans la foulée d'une revue ;
- `resolvePrice` refiltre les règles par étage **à chaque appel**, donc autant
  de fois que d'articles × paliers. Les matériaux communs sont désormais
  calculés une fois par lecture (`boardMaterials`), mais indexer plus finement
  — par portée — obligerait à changer la signature de la fonction qui **facture**,
  partagée avec le checkout. À faire quand le catalogue dépassera le millier de
  SKU, pas avant, et avec une mesure à l'appui ;
- `$any($event.target).value` subsiste dans **sept** gabarits hors tarification
  (zones de livraison, panier staff, production, mandat SEPA). `nativeValue()`
  les absorbe tous ; le passage n'a pas été fait pour ne pas mêler des écrans
  sans rapport à cette revue.

Sur la **donnée**, la limite qui commande tout le reste :

- ~~le tarif canonique vient du seed~~ — **réglé le 2026-08-18** : la bascule
  (Cat C5b) est faite, le prix facturé vient de la base, et il est historisé.
  Reste **Cat C7** : le front client sur l'API, et la suppression des seeds.
  Deux points ouverts par la bascule, tous deux volontaires :
  - une famille du PIM sans rayon dans la boutique est **refusée** (le rayon est
    une union fermée dans les contrats) ; le jour où le PIM en ajoute une, il
    faut un déploiement, pas une devinette ;
  - les déclinaisons **non-défaut** (un carton, un conditionnement) restent
    invisibles : la boutique n'a jamais su les vendre, et c'est C7 qui les ouvre.
