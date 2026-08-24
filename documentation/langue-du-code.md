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
| **Valeurs `AddressKind`** — `facturation` / `livraison`         | le code, le fil, la base             | ✅ la seule qui vaille — 3 déploiements  |
| **Clés `jsonb`** — `emporter` / `surPlace`                      | le code, la base                     | ❌ C0-d les supprime — travail jetable   |
| **Valeurs du journal** — `category.tva_changed`                 | l'historique                         | ❌ jamais — exception nommée             |

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

**Les valeurs du journal.** `"category.tva_changed"` est ce qui a été **écrit à
l'époque**. Réécrire un journal pour qu'il parle la langue d'aujourd'hui lui
retire ce qui en fait un journal. C'est une exception au même titre que
`mercuriale`, et pour une raison plus forte : ce n'est pas un nom, c'est un fait.
Les **clés** de `PIM_EVENTS` sont anglaises depuis P3 ; leurs valeurs ne
bougeront pas.

**Les valeurs `AddressKind`.** La seule famille qui porte encore des
identifiants français dans le code — les 10 que le gate compte
(`AddressKind.livraison`). Elle vit à trois endroits à la fois : l'enum Postgres,
`addressKindSchema` dans `@lfd/contracts` (donc le fil), et le dépôt d'adresses.
Recette, un déploiement par étage :

1. **Étendre** — `ALTER TYPE "AddressKind" ADD VALUE 'billing'`, idem `delivery`.
   Additif, l'ancien container ne voit rien. Le contrat accepte les quatre
   valeurs ; les lectures normalisent ancien → nouveau, les écritures
   continuent d'écrire l'ancien (pour qu'un retour en arrière fonctionne).
2. **Basculer** — les écritures passent au nouveau, puis
   `UPDATE company_address SET kind = 'billing' WHERE kind = 'facturation'`.
3. **Resserrer** — le type est recréé sans les deux anciennes valeurs (Postgres
   ne sait pas retirer une valeur d'enum), et le contrat se referme sur deux.

⚠️ Entre 1 et 3, le code porte du **transitoire** : un `in: [ancien, nouveau]`
dans les `where`, un normaliseur à la frontière. C'est le prix, et c'est aussi
le risque — un palier laissé au milieu est pire que pas commencé. Ne lancer
l'étape 1 qu'en s'engageant sur les trois.

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
4. **P4** — décomposé en §4 quater. Trois de ses quatre familles sont
   **classées** : les noms physiques (invisibles au code), les clés `jsonb` (que
   C0-d supprime), les valeurs du journal (des faits, pas des noms). Reste
   `AddressKind`, et c'est une décision à prendre en connaissance du prix :
   trois déploiements et du code transitoire entre les deux bouts.

Le gate compte **10** identifiants restants. Ce sont exactement les
`AddressKind.livraison` du dépôt d'adresses — le compteur ne tombera donc à zéro
qu'au troisième déploiement de cette famille, et pas avant.

### Ce que le compteur a montré

| Étape    | Identifiants comptés |
| -------- | -------------------- |
| Avant P1 | 2076                 |
| Après P2 | 271                  |
| Après P3 | **10**               |

Le saut de 271 à 10 tient à trois symboles seulement (`tvaIntracom`,
`vatByContext`, `AdresseLivraison`) : la dette de langue se concentre sur peu de
noms très employés, pas sur beaucoup de noms rares. C'est ce qui rend les
paliers courts — et ce qui rend le dernier disproportionné.
