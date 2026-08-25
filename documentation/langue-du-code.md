# La langue du code — audit et plan de sortie

> La règle existe depuis le début : **la prose en français, le code en anglais**
> (`CLAUDE.md` §8). Ce doc mesure l'écart réel, propose le lexique, et découpe la
> sortie en paliers dont le premier ne coûte rien et le dernier coûte des jours.
>
> Statut : **📐 audit + décisions à prendre.** Écrit le 2026-08-24.

---

## 1. Ce qui gêne vraiment

Ce n'est pas qu'un mot soit français. C'est qu'un **même symbole** parle deux
langues :

```ts
interface BoutiqueChannels {
  readonly emporter: boolean;
  readonly surPlace: boolean;
}
```

Un type anglais, des membres français. À la lecture, on ne sait plus quelle
langue attendre au champ suivant — et on finit par écrire `emporterTvaId`, qui
n'est ni l'une ni l'autre.

Le front, lui, **reste en français** : ce sont ses libellés, ils s'adressent à
des humains qui parlent français. Aucune couche de traduction n'est demandée ici.

## 2. L'écart, chiffré (2026-08-24)

| Où                                   | Occurrences                                                                                                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend `src` (identifiants)         | `emplacement` 255 · `tva` 246 · `palier` 147 · `tarif` 130 · `mercuriale` 104 · `remise` 103                                                                           |
| Contrats partagés (`packages/*/src`) | `livraison` 106 · `retrait` 82 · `remise` 57 · `palier` 47 · `gabarit` 38                                                                                              |
| Base : tables / colonnes             | `emplacement`, `emplacement_table`, `tva_rate`, `tva_intracom`, `emplacement_id`, `stacks_over_mercuriale`                                                             |
| Base : **valeurs**                   | `AddressKind { facturation, livraison }` · clés `emporter`/`surPlace` **dans le `jsonb`** `channel_preset` · `sales_context.key` · `"mercuriale"` comme genre de règle |
| ~100 types mixtes                    | `TvaRate*`, `Emplacement*`, `Mercuriale*`, `BoutiqueChannels`, `ContextTva`, `CategoryTvaDraft`…                                                                       |

La dernière ligne du tableau est la seule qui fasse mal : ces valeurs sont **des
données**, pas des noms. Les changer, c'est une migration par champ.

## 3. Le lexique

| Français        | Anglais          | Remarque                                                           |
| --------------- | ---------------- | ------------------------------------------------------------------ |
| emplacement     | `location`       | « site » est ambigu avec le site web                               |
| taux de TVA     | `vatRate`        | `TVA` → `VAT` partout, y compris `tvaIntracom` → `vatNumber`       |
| tarif           | `pricing`        | l'acte de tarifer ; `price` reste le montant                       |
| palier          | `tier`           | terme standard des grilles de prix                                 |
| remise          | `discount`       | —                                                                  |
| retrait         | `pickup`         | déjà utilisé par `FulfillmentMethod.pickup` — l'enum est en avance |
| livraison       | `delivery`       | idem                                                               |
| gabarit         | `template`       | —                                                                  |
| conditionnement | `packaging`      | la table s'appelle déjà `product_packaging`                        |
| boutique        | `shop`           | `boutiques` (la carte) → `shops`                                   |
| à emporter      | `takeaway`       | valeur de donnée — palier 3                                        |
| sur place       | `eatIn`          | valeur de donnée — palier 3                                        |
| **mercuriale**  | **`mercuriale`** | **on le garde** — voir ci-dessous                                  |

### Pourquoi `mercuriale` reste

C'est un mot du métier français sans équivalent anglais juste : ce n'est ni un
`priceList`, ni un `catalog`, ni un `quote`. Le traduire par approximation ferait
perdre ce que le mot dit — et le DDD demande de garder la langue du métier quand
elle est précise. C'est **l'exception nommée**, pas un oubli : une exception
écrite ne dérive pas, une exception tacite si.

## 4. Les paliers

| Palier                                                                                                                                                                             | Coût   | Risque                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------ |
| ~~**P1 — arrêter la dérive**~~ ✅ 2026-08-24 : lexique dans `CLAUDE.md`, gate `lint:code-language` en CI                                                                           | fait   | —                                                |
| ~~**P2 — l'intérieur**~~ ✅ 2026-08-24 : `TvaRate`→`VatRate`, `Emplacement`→`Location`, `BoutiqueChannels`→`ShopChannels`. **2076 → 271** identifiants comptés, 4 dossiers drainés | fait   | —                                                |
| ~~**P3 — le fil**~~ ✅ 2026-08-24 : `vatByContext`, `vatNumber`, `commerce/vat-rates`, `locations`. **271 → 10** — et les 10 sont P4                                               | fait   | —                                                |
| **P4 — la base** : tables, colonnes, **et valeurs** (`AddressKind`, clés `jsonb`)                                                                                                  | ~2–3 j | élevé — étendre / basculer / resserrer par champ |

**P1, P2 et P3 sont faits** (2026-08-24), sans rien casser en production. P4 est
le seul palier qui demande la discipline de C0 : `documentation/ops/pipelines.md`
la pose comme **non négociable** — « un déplacement de données sur une base
vivante se fait en trois déploiements, jamais en une migration qui `DROP` ce que
le code en ligne lit encore ». Un palier ne s'y compte donc pas en journées mais
en **déploiements**, et on ne peut en poser qu'un par mise en ligne.

## 4 bis. Ce que P2 a appris

Trois erreurs, toutes de la même famille : **un remplacement de chaîne ne sait
pas distinguer un nom d'une adresse**.

1. Des dossiers de **migrations** renommés. Prisma les suit par leur nom : une
   migration renommée est une migration inconnue, et elle se rejouerait.
2. `TVA_HANDLE_PREFIX = "tva-"` réécrit en `"vat-"`. C'est ce préfixe qui
   rattache une collection Shopify existante à son taux : le changer les aurait
   toutes orphelinées, sans erreur visible avant la poussée suivante.
3. `remplacement` contient `emplacement` : la prose s'est retrouvée pleine de
   « rlocation ».

Et deux **chemins d'API** ont bougé sans qu'on le décide (`commerce/tva-rates`,
`locations/emplacements`). Rétablis alors ; déplacés pour de bon en P3, back et
front dans le même commit.

La leçon opératoire : renommer par lots courts, **relire le diff des chaînes**
(`@map`, URL, valeurs), et faire tourner les trois suites entre chaque lot.

### La quatrième erreur, trouvée en P3

P2 avait aussi anglicisé la **prose française** — « Un location », « cet
location », « l'location » — et, deux fois, ce que l'utilisateur lit : le bouton
« + Nouvel location » de la page Emplacements, et le titre du panneau de
création.

Ce qui compte, c'est **pourquoi rien ne l'a vu**. Les tests vérifient qu'un
bouton existe, pas qu'il soit écrit en français. Le gate, lui, surveille les
identifiants — et la prose est précisément ce qu'il neutralise avant de compter.
Un renommage de mot touche donc trois matières (noms, prose, libellés) dont une
seule est gardée. La parade n'est pas un gate de plus : c'est de relire le diff
des lignes **non-code** au même titre que celui des chaînes.

## 4 ter. Ce que P3 a déplacé

| Ce qui a bougé                              | Portée                                                 |
| ------------------------------------------- | ------------------------------------------------------ |
| `tvaByContext` → `vatByContext`             | `@lfd/pim-contracts` + back + admin                    |
| `tvaIntracom` → `vatNumber`                 | `@lfd/contracts`, `@lfd/b2b-ui`, back, les deux fronts |
| `commerce/tva-rates` → `commerce/vat-rates` | back + admin                                           |
| `locations/emplacements` → `locations`      | back + admin                                           |

Chaque ligne est **un seul commit**, back et front ensemble. Un champ ou un
chemin renommé en deux temps ouvre une fenêtre où l'un écrit `vatByContext` et
l'autre lit `tvaByContext` : aucune erreur, juste des taux absents.

Aucune **colonne** n'a bougé. `vatNumber` garde `@map("tva_intracom")` :
renommer un champ Prisma qui porte un `@map` ne produit aucune migration, donc
aucun déploiement à ordonner. Le physique, c'est P4.

Le doublon `locations/locations` que P2 avait produit vient de là : le chemin est
un couple `contexte/ressource`, et angliciser la ressource l'a redoublé. Il est
aplati en `locations`.

## 4 quater. P4, famille par famille

P4 n'est pas un bloc. Ses quatre familles n'ont ni le même coût ni le même
bénéfice, et les mettre dans le même sac est ce qui le fait paraître infaisable.

| Famille                                                         | Qui la lit                           | Verdict                                  |
| --------------------------------------------------------------- | ------------------------------------ | ---------------------------------------- |
| **Noms physiques** — `tva_rate`, `emplacement`, `tva_intracom`… | **personne** : tout passe par `@map` | ❌ pas maintenant — bénéfice `psql` seul |
| ~~**Valeurs `AddressKind`**~~ — `facturation` / `livraison`     | le code et la base (pas le fil)      | ✅ **faite** 2026-08-25, 3 déploiements  |
| **Clés `jsonb`** — `emporter` / `surPlace`                      | le code, la base                     | ❌ C0-d les supprime — travail jetable   |
| ~~**Valeurs du journal**~~ — `category.tva_changed`             | l'historique                         | ✅ **faite** 2026-08-25, 1 migration     |

**Les noms physiques.** Aucun code ne les lit : `@map` les a découplés, et P3
vient d'en faire la démonstration en renommant `tvaIntracom` sans toucher à
`tva_intracom`. Le gain est qu'un humain en `psql` lise `vat_rate` ; le prix est
trois déploiements par objet sur une base de production. C'est le seul palier
dont le doc disait déjà « en dernier, **ou jamais** » — et la raison tient
toujours.

**Les clés `jsonb`.** `emporter` / `surPlace` sont les deux **modes** fixes de la
matrice de canaux. C0-d prévoit de les faire disparaître : la matrice devient
`Record<locationId, Record<contextKey, boolean>>`, les modes deviennent des
contextes, et `sales_context.channel_key` tombe avec eux. Les renommer
aujourd'hui, c'est écrire une migration de données que C0-d effacera. On attend
C0-d, qui règle le problème en le supprimant.

**Les valeurs du journal.** ✅ **Faites le 2026-08-25** — et ce doc disait
« ❌ jamais ». Le raisonnement d'alors : `"category.tva_changed"` est ce qui a
été **écrit à l'époque**, et réécrire un journal pour qu'il parle la langue
d'aujourd'hui lui retire ce qui en fait un journal.

Ce qui l'a renversé n'est pas la langue, c'est la **justesse**. `tax_rate.*` ne
parlait pas d'une taxe quelconque, il parlait de la TVA : le jour où une autre
taxe entre au référentiel, le même type désigne deux choses. Et `category.` ne
dit pas de quoi — un lead a aussi une catégorie. Un fait mal nommé ne vieillit
pas bien : plus on attend, plus il y a de lignes à traduire et de lecteurs à
qui enseigner deux orthographes.

Le renommage (`tax_rate.*` → `vat_rate.*`, `category.*` →
`product_category.*`, `tva_changed` → `vat_changed`) s'est fait en **une**
migration de données, clé d'idempotence comprise. Ce qu'on tient toujours :
réécrire une **graphie** n'altère ni le fait, ni son sujet, ni sa charge — c'est
une traduction. Réécrire ce qui s'est passé resterait interdit.

**Les valeurs `AddressKind`.** ✅ **Faite le 2026-08-25**, en trois
déploiements. C'était la seule famille qui portait encore des identifiants
français dans le code (`AddressKind.livraison`), et la seule dont le bénéfice
valait le prix.

Une découverte au passage, et c'est la plus utile de tout P4 : **le fil ne
portait pas ce champ**. `addressKindSchema` existait dans `@lfd/contracts` mais
n'avait aucun consommateur — l'API expose `billing` et `deliveries` comme deux
champs distincts, le discriminant est structurel. Aucun front n'était donc
concerné, et le chantier s'est réduit au backend et à la base.

| Palier        | Migration                                                          | Ce que le code fait                                             |
| ------------- | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| 1 · Étendre   | `ADD VALUE 'billing'`, `'delivery'` — additif, zéro ligne touchée  | les lectures acceptent les deux, les écritures gardent l'ancien |
| 2 · Basculer  | `UPDATE addresses SET kind = 'billing' WHERE kind = 'facturation'` | les écritures passent au nouveau                                |
| 3 · Resserrer | le type est recréé sans les anciennes valeurs                      | `address-kind-transition.ts` disparaît                          |

Le palier 1 est ce qui rend le 2 inoffensif : quand la migration réécrit les
lignes, le container encore en place lit déjà les deux encodages.

### Un seul garde, et pourquoi le second a été retiré

Le palier 3 **garde** : « reste-t-il une ligne dans l'ancien encodage ? ». Une
question sur les données a la même réponse partout, donc ce garde ne peut pas
se tromper. PostgreSQL refuserait la conversion de lui-même, mais avec un
message qui parle de types ; celui-ci parle du problème et donne le geste.

Le palier 2 en a porté un, puis l'a perdu — et c'est la leçon la plus utile de
tout P4. Il demandait « `étendre` a-t-il fini il y a moins de cinq minutes ? »,
faute de mieux : depuis SQL, on ne voit pas si un ancien container sert encore
le trafic. Il a mordu **à sa première utilisation**, sur une base de
développement, où les trois paliers arrivent forcément dans le même
`migrate deploy` et où aucun container ne sert quoi que ce soit.

Le défaut est de conception, pas de réglage : « dev rejoue toutes les
migrations » et « la prod a déployé les deux d'un coup » ont exactement la même
forme vue de la base. Seul l'appelant sait lequel des deux il est.

Et un garde qui se déclenche sur chaque machine de développement ne se corrige
pas, il se contourne — puis il ne protège plus rien le jour où il aurait servi.
**L'ordre des déploiements est le travail de la chaîne de livraison**
(`documentation/ops/pipelines.md`), pas d'une migration. Le palier 2 porte donc
un avertissement en tête de fichier, et rien d'autre.

### Ce que la bascule a révélé

Le gate comptait 10 occurrences. Il y en avait **15**. Trois lecteurs
filtraient sur la **chaîne** `"facturation"` — dans `growth`, dans la fiche
admin — et une chaîne, le gate la neutralise avant de compter : c'est
précisément la même cécité qui avait laissé passer la prose et les libellés de
P2. Au palier 2, chacun de ces filtres serait devenu une requête qui ne trouve
plus rien. Pas une erreur : une adresse absente.

Deux assertions de test avaient la même forme, et elles, elles sont bien
tombées au palier 2 — parce qu'elles vérifiaient une ligne en base, pas un
rendu.

## 5. Ce qu'on ne fera pas

- **Traduire le front.** Ses libellés parlent à des humains francophones. Une
  couche de traduction pour une app mono-langue ajoute un indirection et ne
  supprime aucun bug.
- **Renommer les URL.** `/pim/produits`, `/reglages` : elles sont dans des
  favoris. Le gain est cosmétique, le coût tombe sur celui qui a fait le favori.
- **Traduire `mercuriale`.** Cf. §3.

## 6. Où on en est

1. ~~**P1**~~ — le lexique dans `CLAUDE.md`, plus le gate. ✅
2. ~~**P2**~~ — l'intérieur, une passe par contexte. ✅
3. ~~**P3**~~ — le fil, chaque champ en un seul commit. ✅
4. ~~**P4**~~ — `AddressKind` en trois déploiements ✅ ; les trois autres
   familles classées avec leur raison (§4 quater).

Le gate compte **1** identifiant français, et il ne descendra pas plus bas :
c'est la clé `livraison` de la table des routes, dans `app.routes.spec.ts`.
C'est une **route**, donc une donnée — et les routes restent françaises par
décision (§5). Ses voisines (`'pim/emplacements'`) portent des guillemets et
sont donc ignorées ; celle-ci, qui est un identifiant valide, se les fait
retirer par Prettier. Une exception écrite ne dérive pas ; la contorsion pour
faire tomber un compteur à zéro, elle, aurait dérivé.

Il ne reste ensuite qu'à drainer les dossiers un à un dans le `SCOPE` du gate —
un dossier ajouté, c'est une promesse qu'on ne peut plus rompre sans casser la
CI.

### Ce que le compteur a montré

| Étape    | Identifiants comptés  |
| -------- | --------------------- |
| Avant P1 | 2076                  |
| Après P2 | 271                   |
| Après P3 | 10                    |
| Après P4 | **1** (cf. ci-dessus) |

Le saut de 271 à 10 tient à trois symboles seulement (`tvaIntracom`,
`vatByContext`, `AdresseLivraison`) : la dette de langue se concentre sur peu de
noms très employés, pas sur beaucoup de noms rares. C'est ce qui a rendu les
paliers courts — et ce qui rendait le dernier disproportionné, jusqu'à ce qu'on
le découpe en quatre familles dont trois ne valaient pas d'être faites.

⚠️ **Zéro ne veut pas dire tout vu.** Le gate compte des identifiants ; il
neutralise les chaînes et la prose avant de compter. P2 y a laissé deux
libellés d'écran et une centaine de lignes de prose, P4 cinq filtres sur la
chaîne `"facturation"`. Un renommage de mot touche trois matières, le gate n'en
garde qu'une — c'est sa limite, et elle est délibérée : compter les chaînes
lèverait un faux positif à chaque valeur de donnée.
