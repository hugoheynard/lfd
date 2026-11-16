# Plan — les postes du fournil

**État : 📝 plan, rien n'est bâti.** Demande de Hugo, le 2026-11-16 : un
article rangé en « Traiteur salé » à la boutique peut être fait par la
pâtisserie au fournil. Aujourd'hui, la fiche d'atelier et le dossier de
production le rangent quand même sous « Traiteur salé ». Il faut pouvoir
ranger chaque article au poste qui le fait, sans toucher au rangement de la
boutique et sans rien apprendre du référentiel.

Forme retenue avec Hugo le même jour : **un poste par article**, réglé par le
fournil, sans règle par rayon. Ni argent, ni migration de données (deux tables
neuves), ni frontière de sécurité, ni runbook : ce plan ne passe pas par
`vitruve`. Ses affirmations sur l'existant ont été vérifiées en ouvrant le
code le 2026-11-16 (§ 2).

---

## 1. En simple

La boutique range ses articles en **rayons**, pour le client. Le fournil
s'organise en **postes**, pour l'équipe. La quiche est au rayon « Traiteur
salé », et c'est la pâtisserie qui la fait.

Le fournil tient donc deux choses, et rien d'autre :

- **sa liste de postes** : Tourière, Pâtisserie, Traiteur… un nom et un ordre ;
- **le poste de chaque article** qu'il fabrique.

La fiche d'atelier et le dossier du jour rangent alors par poste. Un article
qui n'a pas encore de poste reste sous son rayon de boutique, marqué « à
ranger ».

```mermaid
flowchart LR
    A["Un article du jour"] --> B{"A-t-il un poste ?"}
    B -- oui --> P["Fiche de son poste"]
    B -- non --> R["Sous son rayon de boutique,<br/>marqué « à ranger »"]
```

- **Rien ne change le premier jour.** Sans poste, tout est rangé comme
  aujourd'hui.
- **La boutique et le référentiel n'en savent rien.** Le fournil ne range que
  des SKU, qu'il connaît déjà.
- **Un nouvel article** arrive « à ranger ». Quelqu'un le range une fois, et
  c'est le fournil qui sait qui le fait.

### Ce qui protège d'un article oublié

1. **Il ne peut pas disparaître, par construction.** Le rangement place chaque
   ligne quelque part : son poste, sinon son rayon, sinon « Hors catalogue ».
   Un test vérifie que toutes les lignes qui entrent ressortent dans un groupe.
2. **Il se voit.** Son groupe porte « à ranger ». La page Postes compte les
   articles sans poste, et la couverture du dossier du jour les nomme.
3. **Il se voit à temps.** Le Prod manager signale, avant l'arrêt, les articles
   de la journée qui n'ont pas de poste.

Il n'y a **pas d'événement « article publié »** à écouter : « ce qui reste à
ranger » se calcule au moment de la lecture, sur les articles que le fournil
a réellement à produire. Un événement peut se perdre, ou concerner un article
que le fournil ne fera jamais. Un état calculé ne ment pas.

---

## 2. Ce qui existe (vérifié le 2026-11-16)

- **Le fournil ne connaît un article que par son SKU.** Il demande le rayon au
  commerce par un port qu'il déclare :
  `production/channels/commerce/workshop-shelves.reader.ts`
  (`WorkshopShelvesReader.shelvesOf(skus)`). Le commerce l'implémente sur son
  miroir des familles
  (`lafoliecoffee/catalog/infrastructure/catalog-workshop-shelves.reader.ts`).
  Ce plan n'y touche pas.
- **Deux lecteurs rangent par rayon côté serveur**, tous deux par
  `rootShelvesOf` de l'imprimerie (`production/shared/print/`) :
  - la fiche d'atelier : `atelier/domain/services/production-worksheet-groups.ts`
    (`worksheetGroupsOf`) ;
  - le dossier du jour : `plan/domain/services/day-dossier.ts`, lu par
    `plan/application/services/production-paper.service.ts`, figé et archivé
    à l'arrêt.
- **Le réglage `showSubcategories`** appartient à l'imprimerie
  (`shared/print/infrastructure/prisma-production-display-settings.*`), lue
  par la fiche comme par le dossier ; seule sa route vit dans `atelier/http/`.
  Le mode boutique / mode prod la rejoint là, et non dans `workstations/` :
  c'est une règle de rangement, que les deux métiers lisent déjà.
- **Les articles vendables, nommés et rangés**, arrivent déjà au fournil par
  `production/channels/commerce/sellable-articles.reader.ts`
  (`SellableArticlesReader`, la table des raccourcis). La page Postes les
  liste par ce port.
- **La porte `production-subcontexts`** n'admet entre métiers que
  `atelier → quality` et `plan → resupply`
  (`dev-toolbox/gates/production-subcontexts.mjs`).
- **Le mot « station »** est déjà pris (`PackingStation`, `StationContext`).
  Le poste s'appelle `Workstation` dans le code.

---

## 3. La conception

### 3.1 Le métier `workstations/`

Les postes sont le vocabulaire du fournil. Ils vivent dans le schéma
`production`, dans un nouveau métier `src/production/workstations/`, avec son
`index.ts` et son module Nest. Ni dans `day/`, qui ne connaît aucun métier, ni
dans `atelier/`, que `plan/` n'a pas le droit de lire.

Il publie **une lecture nommée** :

```ts
/** Le poste de chaque SKU ; un SKU absent n'a pas de poste. */
export abstract class WorkstationOfArticles {
  abstract workstationsOf(skus: readonly string[]): Promise<ReadonlyMap<string, WorkstationView>>;
}
```

La porte gagne deux arêtes, avec leur raison : `atelier → workstations` et
`plan → workstations`.

### 3.2 Les tables

```
production.workstation
  id           text pk            (ULID)
  name         text not null      unique parmi les postes vivants
  position     int  not null      l'ordre des fiches
  archived_at  timestamptz null   pas de DELETE physique
  updated_at, updated_by

production.workstation_article
  sku             text pk         un article, un poste
  workstation_id  text not null → production.workstation (RESTRICT)
  updated_at, updated_by
```

- **Aucune clé ne sort du schéma `production`.** Le SKU y est déjà opaque,
  comme dans `ProductionOrderLine`.
- **Archiver un poste** est refusé tant qu'il porte des articles : on les
  déplace d'abord. Un poste vide part sans laisser d'article orphelin.
- `updated_by` entre au registre RGPD (`lint:rgpd-staff`).

### 3.3 L'agrégat et les gestes

Trois règles peuvent refuser une écriture : deux postes vivants ne portent
pas le même nom, un poste qui porte des articles ne s'archive pas, et aucun
article ne va à un poste archivé. Selon la question de tri de CLAUDE.md
(§ 3.1), c'est donc un **agrégat**, et non un CRUD.

**`WorkstationMap`**, la carte entière du fournil, c'est-à-dire ses postes et
le poste de chaque article. Les trois règles portent sur l'ensemble : l'unicité
d'un nom se vérifie contre les autres postes, et l'archivage contre les
articles. Elle reste petite, avec une dizaine de postes et quelques centaines
d'articles au plus.

- La factory `WorkstationMap.empty()`, puis les méthodes métier, qui refusent
  chacune la transition illégale (`BusinessError`, avec un message qui nomme le
  poste et le geste de sortie) :
  - `declare(name)` ;
  - `rename(id, name)` ;
  - `reorder(ids)` ;
  - `archive(id)` ;
  - `place(skus, workstationId | null)`, où `null` remet les articles « à
    ranger ».
- Les value objects : `WorkstationName` (nom non vide, borné, comparé sans
  casse ni espaces de bord) et `Sku`, celui du fournil.
- Le port d'écriture `WorkstationMapRepository` : `load(): Promise<WorkstationMap>`
  et `save(map)`. L'adaptateur Prisma porte `toDomain` et `toPersistence`, et
  un verrou consultatif sérialise deux gestes simultanés.
- Les commandes : `DeclareWorkstation`, `RenameWorkstation`,
  `ReorderWorkstations`, `ArchiveWorkstation`, `PlaceArticles`. Chacune charge
  la carte, appelle une méthode, puis sauve. Le geste « tout ce rayon → ce
  poste » de l'écran appelle `PlaceArticles` avec les SKU du rayon, sans
  laisser de règle derrière lui.
- La lecture `ListWorkstations`, et la lecture publiée `WorkstationOfArticles`,
  passent par un port de **lecture** distinct (ISP), qui ne charge pas
  l'agrégat.

### 3.4 Le rangement

`rootShelvesOf` reste tel quel. Une fonction voisine de l'imprimerie,
`workstationGroupsOf(lines, workstationOf, shelfOf)`, rend :

1. un groupe par poste qui a des lignes, dans l'ordre des postes ;
2. puis, pour ce qui n'a pas de poste, un groupe par rayon de boutique marqué
   `unplaced: true` (« à ranger »), dans l'ordre d'aujourd'hui ;
3. puis « Hors catalogue » ou « Rayon inconnu », comme aujourd'hui.

**Invariant testé :** toutes les lignes qui entrent ressortent, une seule
fois. Une **panne** de la lecture des postes se traite comme la panne des
rayons aujourd'hui : on journalise, et tout est rangé par rayon. Un poste
n'empêche jamais de produire.

Avec `showSubcategories`, les sections d'un groupe-poste sont les rayons de
boutique d'où viennent ses articles. On y retrouve la quiche en lisant le
site.

Le contrat `WorkshopGroup` gagne `workstation: { id, name } | null` et
`unplaced: boolean`.

#### La même découpe de page (décidé par Hugo le 2026-11-16)

Le dossier du jour et la fiche d'atelier gardent **exactement** leur
découpe : un poste prend la place d'un rayon, et rien d'autre ne bouge.

- **Une section par groupe.** Le titre est le nom du poste au lieu du nom du
  rayon. Le calendrier par tranche, l'ordre des lignes (le plus gros d'abord),
  les sauts de page et les annexes restent les mêmes.
- **Les intertitres** (avec `showSubcategories`) deviennent les rayons de
  boutique à l'intérieur du poste, à la place des sous-catégories. Le
  mécanisme est le même.
- **Un groupe « à ranger »** a la forme d'un groupe de rayon. Seul son titre
  porte la mention : « Traiteur salé — à ranger ».

C'est tenu par la construction : `recapOf` (`plan/domain/services/day-dossier.ts`)
et `worksheetGroupsOf` rendent déjà des groupes `{ titre, lignes,
intertitres }`, et la mise en page ne lit que ces groupes (vérifié le
2026-11-16). Le changement se fait **en amont**, dans le choix des groupes ;
le gabarit du PDF n'est pas touché.

**Test (W2) :** une journée où chaque rayon a exactement un poste du même nom
rend un dossier dont les groupes sont identiques, titres compris, à ceux du
mode boutique.

#### Les fiches d'atelier deviennent des fiches de poste (décidé par Hugo le 2026-11-16)

En mode prod, la fiche d'atelier (`/fournil`) montre **une fiche par poste** :
l'onglet sur tablette et le sélecteur sur téléphone listent les postes, avec
leur avancement, à la place des rayons. L'en-tête dit « Fiche de poste —
Pâtisserie · fiche 2 sur 5 ». La fiche elle-même (lignes, tranches, fournées,
pavé numérique) ne change pas.

- **Ouvrir directement sa fiche :** `/fournil?poste=<id>` ouvre la fiche d'un
  poste. La tablette de la pâtisserie peut garder ce lien en favori. Le dernier
  poste ouvert est retenu sur l'appareil (stockage local, simple confort).
- **Un poste sans ligne ce jour-là n'a pas de fiche,** comme un rayon vide
  aujourd'hui.
- **Les messages suivent le mode.** « Les rayons n'ont pas pu être lus »
  devient, en mode prod, « Les postes n'ont pas pu être lus — les fiches sont
  rangées par rayon ».
- **Le mot.** Le front appelle aujourd'hui « poste fixe » la tablette posée à
  l'atelier, par opposition au téléphone (`fiche-atelier.html`, vérifié le
  2026-11-16). Avec les postes du fournil, ce mot désignerait deux choses. Il
  devient « tablette » dans les commentaires et les libellés (W3), et
  « poste » ne désigne plus que le métier de l'atelier.

### 3.5 Le figement

Le dossier du jour est figé à l'arrêt : il garde les postes du moment, sans
rien de plus. La fiche d'atelier est vivante : un changement de poste se voit
au rafraîchissement suivant.

### 3.6 L'écran

Prod manager → **Postes** :

- en tête, les postes : ajouter, renommer, monter ou descendre, archiver ;
- dessous, **les articles fabriqués**, chacun avec son rayon de boutique et un
  `fold-listbox` « Poste ». Un filtre « à ranger » avec son compte, un filtre
  par rayon, et le geste « tout ce rayon → ce poste » ;
- le bouton **« Simuler le catalogue en production »** (§ 3.7) ;
- le réglage **mode boutique / mode prod** y est rappelé, avec un lien vers les réglages du fournil ;
- en mode prod, le Prod manager affiche « N articles du jour à ranger » avec un lien vers ce
  filtre, tant qu'il en reste.

Une ressource `production_workstations` est créée par migration et accordée
**à l'écran** (règle des droits, CLAUDE.md § 3).

### 3.7 Simuler le catalogue en production

Demande de Hugo, le 2026-11-16 : un bouton **« Simuler le catalogue en
production »** sur la page Postes, qui sort un dossier de production avec
**tous** les articles fabricables, rangés comme ils le seraient, pour contrôler
la répartition avant de basculer en mode prod.

- **La source :** tous les articles vendables, que le fournil lit déjà par
  `SellableArticlesReader`, une pièce de chacun, dans une seule commande
  fictive.
- **Le rendu :** la partie « un rayon et son calendrier » du **vrai** dossier
  du jour (`plan/domain/services/day-dossier.ts`), avec les postes et le mode
  du moment. Le code est le même, donc ce qu'on contrôle est ce qu'on
  imprimera. Ni fiche par commande, ni BL, ni réassorts : une commande fictive
  n'a rien à y montrer.
- **Le choix du mode :** « Simuler en mode prod » et « Simuler en mode
  boutique », quel que soit le réglage en cours. On compare les deux avant de
  basculer.
- **La couverture** compte les articles par poste et nomme ceux qui sont « à
  ranger ». C'est la liste de contrôle.
- **Jamais persistée,** comme la journée d'exemple de la planche des
  documents (`plan/application/document-specimens/specimen-day.ts`, même
  principe) : aucune journée, aucun archivage, aucun envoi. Chaque page porte
  « SIMULATION — ne pas produire ».
- **La route :** `GET /admin/production/workstations/simulation.pdf?mode=workstation|shelf`,
  une requête qui n'écrit rien, sous la ressource `production_workstations`.

---

## 4. Les lots

| Lot     | Contenu                                                                                                                                                                                            | Tests                                                                                                         |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **W0**  | La porte `production-subcontexts` connaît `workstations/`, ses deux modèles et ses deux arêtes, avant que le dossier existe.                                                                       | un import hors `index.ts` échoue                                                                              |
| **W1**  | Migration (deux tables, ressource), gestes et requête, dépôt Prisma, `WorkstationOfArticles`, routes `/admin/production/workstations`. `lecteur-de-migrations`.                                    | domaine : les trois refus et `place` à `null`, sans Nest ; handlers à ports doublés ; e2e                     |
| **W2**  | `workstationGroupsOf` ; la fiche d'atelier et le dossier l'appellent ; la couverture du dossier nomme les articles à ranger ; le contrat.                                                          | **sans poste, sortie identique à aujourd'hui** ; toutes les lignes ressortent ; la panne                      |
| **W2b** | La simulation du catalogue en production : requête, route, couverture de contrôle, filigrane.                                                                                                      | tous les articles vendables ressortent une seule fois ; mode prod et mode boutique ; rien n'est écrit en base |
| **W3**  | La page Postes, l'option mode boutique / mode prod, et l'alerte du Prod manager (`pablo`), le rail et les tuiles ; le prévisionnel, les filtres des réassorts et le récapitulatif suivent le mode. | spec de l'écran ; essai dans Chrome sur le scénario de commandes                                              |
| **W4**  | Doc d'état des postes du fournil (dans `fournil/`) ; `la-fiche-d-atelier.md` et `dossier-prod-du-jour.md` à jour ; le spécimen du dossier montre un poste. Le plan est supprimé.                   | —                                                                                                             |

---

## 5. Décisions et question ouverte

- **Q1 — tranchée par Hugo le 2026-11-16 : un article, un poste.** Les postes
  sont des métiers de l'atelier : boulangerie, tourier, pâtisserie… Un article
  fait par deux postes n'est pas traité ici ; il demanderait la recette.
- **Q2 — tranchée par Hugo le 2026-11-16 : une option du fournil, « mode
  boutique » ou « mode prod ».** Un réglage `grouping: "shelf" | "workstation"`
  rejoint `ProductionDisplaySettings` (imprimerie), à côté de `showSubcategories`, et vaut
  pour **tous** les rangements du fournil : la fiche d'atelier, le dossier du
  jour, le prévisionnel, les filtres des réassorts et le récapitulatif. En mode
  boutique, tout est rangé par rayon, comme aujourd'hui, même si des postes
  sont déclarés. En mode prod, tout est rangé par poste, et ce qui n'en a pas
  reste sous son rayon, marqué « à ranger ». Défaut : mode boutique. Le
  dossier figé garde le mode de l'arrêt.
- **Q3 — tranchée par Hugo le 2026-11-16 : tout ce qui est commandé est « à
  produire », au sens « doit exister pour la commande ».** Peu importe qu'on le
  fabrique ou qu'on le sorte de la réserve : une bouteille de jus ou un pot de
  confiture revendus tels quels sont des articles comme les autres. Ils
  prennent un poste comme les autres (par exemple « Revente » ou « Réserve »),
  et un article sans poste reste « à ranger ». Il n'y a donc **aucune notion
  d'article de revente** à bâtir aujourd'hui (aucune n'existe, vérifié le
  2026-11-16).
  **Limite assumée :** le fournil ne distingue pas ce qu'il fabrique de ce
  qu'il sort tel quel. Le jour où il faudra le distinguer (coût de revient,
  capacité du four, traçabilité d'un lot acheté), ce sera une propriété de
  l'article, pas un poste, et un autre chantier.
