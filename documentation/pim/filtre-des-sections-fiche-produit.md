# Le filtre des sections de la fiche produit

> **Doc d'architecture**, écrite le 2026-09-23 après lecture du code livré.
>
> Elle explique **pourquoi** la fiche produit se range en quatre familles, et
> pourquoi le filtre appartient à la personne plutôt qu'à l'écran.

---

## 1. Quatre familles, et elles ne sont pas un classement de confort

| Famille           | Sections                             |
| ----------------- | ------------------------------------ |
| **Identité**      | Identité                             |
| **Commerce**      | Tarif & logistique                   |
| **Réglementaire** | Allergènes · Valeurs nutritionnelles |
| **Communication** | Communication · Visuels              |

La famille vit **avec la section**, dans `SAVEABLE` (`product-form-store.ts`) —
une seule table, pas deux à tenir d'accord.

🔴 **Le découpage suit ce que chaque section FAIT à la fiche**, pas ce qui se
range joliment :

- le **réglementaire commande la publication** — l'invariant 7 refuse de mettre
  en vente une déclinaison active sans déclaration d'allergènes ;
- la **communication ne bloque rien** — aucun texte, aucune image n'empêche de
  publier.

➡️ Le badge n'organise pas l'écran, il **apprend le modèle à qui saisit.**
Quelqu'un qui voit « Réglementaire » d'un côté et « Communication » de l'autre
comprend sans qu'on le lui dise pourquoi l'un bloque et l'autre pas.

C'est aussi ce qui rend le regroupement défendable devant le prochain qui
trouvera un autre ordre « plus logique » : il faudra d'abord contredire le
modèle, pas le goût.

### ⚠️ Ce que les familles ne séparent qu'à moitié

La ligne de fracture est **plus nette à l'écran que dans le code**, et il faut
le savoir avant de s'appuyer dessus :

|               | Périme la signature de publiabilité ? | Dans l'empreinte de révision ? |
| ------------- | ------------------------------------- | ------------------------------ |
| Réglementaire | oui                                   | oui                            |
| **Visuels**   | **non** — depuis le 2026-09-23        | **oui**                        |
| **Textes**    | **oui** — décision en attente         | **oui**                        |

Les visuels sont sortis du critère de `content-facts.ts` le 2026-09-23 (Hugo :
« changement visuel et contenu ne créent pas de révision »). Les **textes** y
restent pour l'instant, et c'est une **décision en attente**, pas un oubli :
« pour l'instant on se concentre sur les médias, on ira sur contenu après ».

Un plan proposait de sortir les deux de l'**ancre de révision** ; il a été
contredit et abandonné — le critère de l'ancre n'est pas « ce qui change une
facture » mais « ce qu'un canal doit recevoir pour être autosuffisant », et la
projection B2B porte désormais la note et l'image.

🔴 **Le JSDoc qui porte cette incise a été faux DEUX FOIS le même jour** :
d'abord écrit au présent voulu plutôt qu'au présent réel, puis périmé quelques
heures plus tard par la bascule des visuels. C'est le « commentaire dangereux »
du `CLAUDE.md` §8 — une phrase qui justifie un mécanisme par l'état d'un autre
fichier, et qui ne se démasque jamais en relisant celui qu'elle surplombe.
**Rouvrir `content-facts.ts` et `revision.ts` avant de la croire.**

---

## 2. Neuf sections, six familiales

La page en affiche **neuf**, `SAVEABLE` n'en range que six. Les trois autres ne
sont pas un oubli :

- **Limite de commande** et **Ingrédients** sont rendues _dans_ la boucle,
  ancrées sous Tarif et Nutrition. Elles suivent le filtre de leur ancre **par
  position**, sans famille recopiée — un rattachement de moins à tenir d'accord.
- **Diffusion par canal** n'est ancrée à rien et ne se saisit pas. Elle n'a
  donc aucune famille et ne s'affiche que sur « Tout ». La ranger serait une
  **décision**, pas de la mécanique.

---

## 3. Le filtre appartient à la PERSONNE

> Hugo, 2026-09-23 : « si mon communicant veut passer d'un produit à un autre
> avec le même réglage, ça correspond à un flow de travail ».

Quelqu'un qui relit les textes de dix produits choisit « Communication » **une
fois**, pas dix. Le réglage ne peut donc pas vivre dans le composant de page,
qui meurt à chaque navigation — d'où `SectionFamilyFilterStore`, fourni à la
racine, et rangé dans `nav_prefs` du staff (`PATCH /admin/me/prefs`).

### Une seule porte

`family` est **en lecture seule** au-dehors ; `choose()` pose le réglage **et**
le retient. Écrire le signal directement ferait le demi-geste : l'écran
basculerait, et le prochain repartirait de « Tout » sans que rien ne le dise.
Une API qui permet le demi-geste finit par le produire.

⚠️ **`'all'` n'existe pas au contrat** — `productSectionFamily` vaut une des
quatre familles ou `null`. La traduction `'all' ↔ null` vit dans le magasin, et
nulle part ailleurs.

### 🔴 Le choix présent gagne sur le choix mémorisé

L'hydratation attend le chargement de l'identité : elle arrive **après** le
premier rendu, et parfois après un clic. Sans garde, la préférence d'hier
écraserait le choix d'il y a deux secondes et **l'écran changerait tout seul
sous les doigts**.

Un drapeau `chosen` tient ce cas, et un test de régression l'éprouve — vérifié
rouge sans la garde avant d'être gardé.

---

## 4. Le sac de préférences, et ce qu'il a fallu ouvrir

Le contrat sépare **deux** schémas, et le JSDoc dit pourquoi :

> Une clé absente y vaudrait « remets le défaut », c'est-à-dire qu'une future
> préférence envoyée seule **effacerait** la catégorie. Ici, une clé absente
> vaut « n'y touche pas », et le serveur fusionne.

C'est la même faute que la fiche réglementaire a passé une nuit à fermer
ailleurs — quelqu'un l'avait déjà vue venir ici.

⚠️ **Mais l'anticipation s'arrêtait au contrat.** Le domaine, lui, énumérait ses
clés **deux fois** : `parseStaffNavPreferences` ne relisait que
`worksheetCategory`, et `mergeStaffNavPreferences` ne fusionnait que celle-là.
Une préférence neuve aurait été jetée à la relecture **et** ignorée à
l'écriture, en silence.

Ce qui a sauvé la mise : les deux sites construisent un littéral **typé par le
contrat**. Ajouter la clé aux seuls schémas fait échouer la compilation
(`TS2741`) au lieu de passer sans rien faire.

### Ce que le lot a changé

|           | Avant              | Après                                                   |
| --------- | ------------------ | ------------------------------------------------------- |
| Fusion    | énumérait ses clés | **générique** — parcourt les clés _présentes_ du patch  |
| Relecture | énumérait ses clés | **registre typé** — une clé sans lecteur ne compile pas |

🔴 La fusion générique **naïve** aurait été pire que l'énumération : boucler sur
les clés _connues_ écrirait `null` partout, donc effacerait la préférence
voisine. Ce sont les clés **présentes** qu'il faut parcourir — c'est exactement
ce que le `.partial()` achète.

---

## 5. 🔴 Le filtre range, il ne cache jamais en silence

Ce dépôt s'est déjà brûlé là, et le commentaire au-dessus de `SAVEABLE` le
raconte :

> Les visuels s'enregistraient… nulle part. Le panneau ajoutait, retirait et
> réordonnait dans le vide, et le garde « modifications non enregistrées » ne
> les comptait pas — on pouvait donc les perdre sans le moindre avertissement.

Un filtre qui masque une section portant des modifications non enregistrées
rejouerait cette perte par un autre chemin. Deux mécanismes l'empêchent :

- une section **non enregistrée reste visible**, quelle que soit la famille
  choisie, et porte alors sa pastille en alerte — elle dit d'où elle vient ;
- chaque onglet de famille porte en badge le **nombre** de ses sections non
  enregistrées : même filtré ailleurs, l'écran **nomme** la famille qui en
  porte.

Un test l'éprouve nommément : « ne fait pas disparaître une section modifiée
d'une famille non choisie ».

---

## 6. Ce qui reste ouvert

| Sujet                                               | État                                                                                                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Les **textes** périment encore la signature         | décision **en attente**, à trancher après les médias                                                                                                         |
| **Diffusion par canal** sans famille                | décision, pas mécanique                                                                                                                                      |
| **Deux tables de libellés** pour les mêmes sections | le magasin dit « Tarif & logistique » et « Communication », l'écran dit « Tarif & TVA » et « Contenu ». Deux tables pour six sections finissent par diverger |
| `product-form-store.ts` à **2113+ lignes**          | plafond ≲300 ; la découpe évidente reste la machinerie de brouillon par déclinaison                                                                          |
