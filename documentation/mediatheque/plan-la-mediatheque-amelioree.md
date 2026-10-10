# La médiathèque améliorée — le plan

> **Plan, écrit le 2026-10-10.** Rien n'est bâti. L'état de départ est
> [`mediatheque.md`](mediatheque.md), dont la dette a été soldée le même jour ;
> chaque affirmation ci-dessous sur l'existant a été rouverte dans le dépôt ce
> jour-là.
>
> Pas de `vitruve` : ni argent, ni migration de données (les migrations ne font
> qu'ajouter), ni frontière de sécurité, ni runbook.

---

## Les décisions de Hugo (2026-10-10)

| #   | Question                          | Décision                                                                                                              |
| --- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| D1  | Retirer un tag depuis une tuile   | **immédiat**, avec « Annuler » quelques secondes                                                                      |
| D2  | Un redépôt dans une autre série   | l'image garde **sa série d'origine** ; le compte rendu du lot le dit                                                  |
| D3  | La série au dépôt                 | **facultative**                                                                                                       |
| D4  | « Triable par tag »               | **filtrer** par tag ; **regrouper** par série et par date — jamais par tag (doublons)                                 |
| D5  | Remplacer une image : l'ancienne  | reste au fonds ; le ramassage l'emporte après 7 jours sans porteur                                                    |
| D6  | La fenêtre de course du retrait   | **assumée et écrite** ; le remède est de redéposer                                                                    |
| D7  | La porte « fournil » de l'accueil | un **objet de la vitrine**, réglable à l'écran                                                                        |
| D8  | Le format de l'ouverture de fiche | **4/3**, celui que la boutique applique (`product-sheet.scss`) ; le libellé « 3/2 » était faux (relevé le 2026-10-10) |
| D9  | Les formats larges                | **21/9** pour les grandes bannières et les opérations ; **16/9** reste celui des cartes d'info de la vitrine          |

---

## ~~L1 — Les tags~~ ✅ bâti le 2026-10-10 (`9e0f9f93e`, `cddc296ff`)

**Ce qui est vrai aujourd'hui** (`mediatheque-page`, `tag-palette.ts`) :

- la bande dérive son vocabulaire des images **chargées** — un tag porté
  seulement par une image hors de la page n'y figure pas, et rien ne le dit ;
- un tag se retire d'une tuile d'un clic (`strip`), sans annulation ;
- aucun geste ne renomme ni ne retire un tag dans tout le fonds ;
- le panneau de l'image (`image-panel`) ne porte pas les tags.

**À bâtir :**

1. `GET /media/tags` → `[{ tag, count }]`, lu au serveur sur tout le fonds.
   La bande l'affiche (« croissant · 12 ») et garde les tags inventés dans
   l'onglet tant qu'ils ne sont posés nulle part.
2. `PUT /media/tags/rename { from, to }` — sur toutes les images qui portent
   `from`, dans **une** unité de travail ; `to` normalisé comme à l'écriture.
   Si `to` existe déjà, c'est une **fusion**, et la confirmation le dit avec
   les deux comptes.
3. `DELETE /media/tags?tag=` — retire le mot de toutes les images, confirmation
   avec le compte.
4. Deux faits : `media_tag.renamed` et `media_tag.removed`, sujet le mot,
   charge le nombre d'images. Un fait par geste, pas un par image : la question
   qu'on pose au journal est « qui a renommé ce mot ».
5. Le panneau de l'image : une section « Mots-clés », pastilles avec ×, champ
   qui complète depuis le vocabulaire.
6. Le retrait sur tuile : immédiat, puis « « croissant » retiré · Annuler »
   (D1). L'annulation repose le mot par le même `PUT /media`.

⚠️ Le renommage passe par le port d'écriture du fonds, qui exige un
`WriteTicket` : `lint:journal-tracked` l'auditera d'office.

## ~~L2 — Le feed~~ ✅ bâti le 2026-10-10 (`a92ccbdd1`, `7596e4448`) — « inutilisées » garde un total exact (classé en mémoire comme le tri par emplois), au lieu de pages courtes

**Ce qui est vrai aujourd'hui** : pages par décalage (`limit`/`offset`, 60 par
défaut, 100 au plus), « charger plus », un seul ordre (dépôt décroissant).

**À bâtir :**

1. **Curseur** au lieu du décalage : `?after=<curseur opaque>`. Un dépôt pendant
   qu'on défile ne décale plus rien.
2. **Tris serveur** : dépôt, prise de vue (L3), étiquette, emplois. Le curseur
   encode la clé du tri plus l'URL qui départage.
3. **Filtres cumulables** : tags (tous), série (L3), période, « non taguées »,
   « inutilisées ».
   - ⚠️ « Inutilisées » ne se filtre pas en base : les emplois viennent des
     porteurs, par le canal. Le filtre lit les candidats par page et demande
     leurs emplois — il peut rendre une page courte, et l'écran continue.
4. **Défilement continu** et **intercalaires** (mois, série) quand le tri est
   par date.
5. **L'adresse porte le tri et les filtres**, comme le journal.

## ~~L3 — L'import~~ ✅ bâti le 2026-10-10 (`9fd59fc65`, `77a4183b2`) — et le redépôt devient vraiment idempotent

1. **Vérifier avant d'envoyer** : type, poids et dimensions lus par le
   navigateur, contre `MEDIA_LIMITS` du contrat. Le serveur reste l'autorité.
2. **Les séries.**
   - Migration additive : `media.media_series { id, title, shot_on date?,
note?, created_at }`, et `media_asset.series_id` nullable. Aucune image
     existante n'est touchée.
   - Au dépôt : choisir ou créer une série (D3 : facultatif). L'identifiant
     part avec chaque fichier du lot.
   - Un redépôt d'une image déjà au fonds ne change pas sa série (D2) ; la
     réponse le dit, et le compte rendu du lot l'affiche.
   - Corriger une série ; rattacher ou détacher une image dans son panneau.
   - Faits : `media_series.created`, `media_series.described`, et la série
     dans `media_asset.described`.

## ~~L4 — Le point focal lu~~ ✅ bâti le 2026-10-10 (`9b02731ba`) — et la médiathèque fait suivre la boutique sans republier (fait durable `media.asset_described`)

Le fait durable des visuels porte `focal` (facultatif), la projection le range
dans deux colonnes nullables de `catalog_items` (migration additive), le push
le porte aussi. La boutique pose `object-position`. ⚠️ Facultatif sur le fil :
une livraison en attente sans lui doit rester lisible.

## ~~L5 — Les formats signalés~~ ✅ bâti le 2026-10-10 (`d685de778`) — tolérance 8 %

1. Le libellé et les aperçus disent les formats **réels** (D8, D9) : ouverture
   et vignette 4/3, carré 1/1, carte d'info 16/9, bannière 21/9. Les aperçus
   du panneau de l'image les montrent tous.
2. Au choix d'un usage, si les dimensions de l'image s'écartent du ratio de
   l'usage : une phrase, jamais un refus — « cette image est en 4/3, une
   bannière attend du 21/9 : une grande partie sera coupée ; vérifiez le
   point focal ».

## ~~L6 — L'accueil~~ ✅ bâti le 2026-10-10 (`e5b2125b2`, `b87305f07`, `4f516b0f6`, `7bdc95198`) — rendu 21/9 à regarder sur une vraie photo

- L'opération mise en avant lit les vraies opérations datées (fin de
  `MOCK_EVENT`) et s'affiche en **bannière 21/9** (D9).
- Une **grande bannière 21/9** de l'accueil devient un objet de la vitrine,
  réglable à l'écran.
- La porte « fournil » devient un objet de la vitrine (D7).
- Toutes leurs images viennent du fonds, cadrées par le point focal.

## ~~L7 — Remplacer une image~~ ✅ bâti le 2026-10-10 (`d6938861c`, `27ca59dbf`, `ce35113e4`)

Déposer (octets hors transaction), puis repointer **tous** les porteurs dans
une unité : une méthode de plus sur le canal des porteurs, qui exige un
`WriteTicket`. Le repointage fusionne les doublons. L'ancienne image reste au
fonds (D5). La projection fait suivre la boutique.

## ~~L8 — La fenêtre du retrait, écrite~~ ✅ 2026-10-10 (`mediatheque.md` §8)

`mediatheque.md` dit la fenêtre et son remède (D6). Rien à bâtir.

---

## Ordre et règles de chantier

L1 → L8, un lot à la fois, un commit par geste, la doc d'état mise à jour au
fil de l'eau ; ce plan se raye lot par lot et disparaît quand le dernier est
bâti.

---

## Décisions prises sans Hugo, à revoir ensemble

> Hugo, 2026-10-10 : « continue tous les sujets, prends les décisions et note
> les, on review à la fin ». Chaque ligne dit ce qui a été tranché, pourquoi,
> et comment revenir dessus.

| #   | Sujet                                                                        | Décision                                                                                                                               | Pourquoi                                                                                                                                                                                   | Pour revenir dessus                                                               |
| --- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| R1  | Filtre « inutilisées » (L2)                                                  | total EXACT, classé en mémoire comme le tri par emplois, plutôt que des pages courtes                                                  | un total faux ferait promettre des pages qui n'existent pas                                                                                                                                | repasser `unused` au filtrage par page dans `prisma-media-library-reader.ts`      |
| R2  | Tri par emplois (L2)                                                         | borné à 5 000 images filtrées, 409 au-delà avec « restreignez d'abord »                                                                | les emplois viennent des porteurs, pas de la base : pas de keyset SQL                                                                                                                      | relever la borne, ou projeter un compteur d'emplois                               |
| R3  | Prise de vue future (L3)                                                     | refusée                                                                                                                                | une date future est une faute de frappe et tiendrait la tête du tri pour toujours                                                                                                          | retirer le refus dans `MediaSeries`                                               |
| R4  | Le dépôt mentionne la série au journal (L3)                                  | oui, en `named` facultatif                                                                                                             | savoir qui a rangé quelle image dans quelle série                                                                                                                                          | retirer le champ du fait `media_asset.deposited`                                  |
| R5  | Tolérance d'écart de format (L5)                                             | 8 % (≈ 4 % rognés par bord)                                                                                                            | en dessous, `cover` ne se voit pas ; un 3/2 en 4/3 (12,5 %) est signalé                                                                                                                    | `media-formats.ts`                                                                |
| R6  | Opération mise en avant à l'accueil (L6)                                     | ouvertes, puis annoncées, puis closes ; à égalité, l'échéance la plus proche                                                           | la plus utile au client d'abord                                                                                                                                                            | `featuredOperation` dans `operation-event.ts`                                     |
| R7  | Décompte de l'opération (L6)                                                 | J-n jusqu'à la clôture (ouverte) ou l'ouverture (annoncée), « Dernier jour » le jour même, jours de Paris                              | ce qui presse le client                                                                                                                                                                    | `datedEventOf`                                                                    |
| R8  | Recadrage automatique Cloudflare (`gravity=auto`) pour les images sans point | **pas fait** : le centre reste le défaut                                                                                               | changer `fit` côté serveur d'images touche toutes les tuiles et le compte des transformations ; à mesurer avant                                                                            | à décider                                                                         |
| R9  | Pousser `dev`                                                                | après L8 et une batterie complète verte, sans redemander ; `main` jamais sans Hugo                                                     | Hugo : « continue tous les sujets »                                                                                                                                                        | —                                                                                 |
| R10 | La porte « fournil » (L6)                                                    | un **réglage de la page Accueil** de la vitrine (`pickupDoorImage`), pas un objet posé sur la grille                                   | la porte n'est pas dans la grille de l'accueil ; un objet aurait demandé une position et une règle « une seule porte » pour rien. Même éditeur, même enregistrement, comptée comme porteur | en faire un objet de forme `door`                                                 |
| R11 | Où poser une bannière 21/9 (L6)                                              | **partout**, accueil et rayons                                                                                                         | rien ne s'y oppose qui ne s'opposerait déjà à la bande double, de même emprise                                                                                                             | une règle de composition dans `composition-rules.ts`                              |
| R12 | Le point focal des images de vitrine (L6)                                    | **non porté** : bannière et porte se recadrent au centre                                                                               | la vitrine ne lit pas la médiathèque (`b2b → media` interdit) ; il faudrait une projection comme en L4                                                                                     | projeter le point focal dans les tables de la vitrine sur `media.asset_described` |
| R13 | La carte d'opération de l'accueil (L6)                                       | mène au rayon de l'opération (`/boutique?rayon=op:<key>`) ; tout rayon s'ouvre désormais depuis l'adresse                              | demande de Hugo                                                                                                                                                                            | —                                                                                 |
| R14 | Où l'accueil pose la grille de vitrine (L6)                                  | juste avant « En ce moment », après les portes, raccourcis, contact et suivis                                                          | la grille complète l'accueil sans pousser les portes, qui sont le geste principal                                                                                                          | `accueil-public.html`                                                             |
| R15 | Aperçu de la porte dans l'éditeur (L6)                                       | 2/1, sans mesure                                                                                                                       | la porte n'a pas de ratio fixe (bandeau dimensionné par son contenu)                                                                                                                       | `storefront-door-panel`                                                           |
| R16 | Image du bandeau visiteur (L6)                                               | la MÊME que la porte « Je passe la prendre »                                                                                           | les deux utilisaient déjà la même photo du fournil                                                                                                                                         | séparer en deux réglages de page                                                  |
| R17 | Texte alternatif de la porte d'un pro (L6)                                   | non porté (image en fond CSS) ; porté sur le bandeau visiteur                                                                          | la porte pro est décorative à côté de son libellé                                                                                                                                          | passer l'image en `<img>`                                                         |
| R18 | Les copies d'image du commerce (L7)                                          | comptent comme **porteurs** : tant qu'une opération poussée affiche A, A n'est ni retirable ni ramassable ; le prochain push la libère | l'image d'une opération n'est copiée au commerce qu'au push ; sans ça, le ramassage pouvait effacer une image encore affichée en boutique (trou antérieur à L7, élargi par lui)            | une projection vive des opérations vers le commerce                               |
| R19 | Fusion au remplacement (L7)                                                  | un porteur qui affichait déjà B sous le même rôle garde UNE ligne, celle de A, à son rang ; sous deux rôles, les deux restent          | « remplacer » garde la place de A                                                                                                                                                          | `prisma-media-carriers.ts`                                                        |
| R20 | Signature du repointage (L7)                                                 | `repoint({ from, to, staffId, at }, ticket)`                                                                                           | la vitrine signe sa révision : un éditeur ouvert avant le remplacement est refusé (409) au lieu de réécrire A                                                                              | —                                                                                 |
| R21 | La boutique suit le remplacement (L7)                                        | par le fait durable `media.asset_described` sur B, sans code nouveau au référentiel                                                    | un adaptateur qui appellerait l'application inverserait les couches                                                                                                                        | —                                                                                 |
| R22 | Route « déposer et remplacer » (L7)                                          | **non** : deux appels                                                                                                                  | une route combinée échouerait à moitié (B entrée, remplacement refusé)                                                                                                                     | —                                                                                 |
| R23 | Opérations finies ou masquées (R18)                                          | comptent comme porteurs tant qu'un envoi ne les a pas retirées                                                                         | ne pas faire dépendre un effacement d'un calcul de date ; l'envoi suivant les libère                                                                                                       | filtrer sur `pickupUntil`                                                         |
| R24 | Copies d'image des articles (R18)                                            | ne comptent PAS                                                                                                                        | la projection vive les réécrit ; un article retiré n'est pas servi                                                                                                                         | —                                                                                 |
| R25 | Le panneau de l'image pendant un remplacement (L7)                           | se ferme ; « Remplacer… » est inactif tant que la description a des modifications                                                      | fold n'ouvre qu'un panneau à la fois ; ne pas perdre une saisie                                                                                                                            | panneaux empilés                                                                  |
| R26 | Reprendre la description de l'ancienne image (L7)                            | proposée, cochée d'office seulement si la nouvelle n'en a aucune                                                                       | ne jamais écraser une description existante sans geste                                                                                                                                     | —                                                                                 |
