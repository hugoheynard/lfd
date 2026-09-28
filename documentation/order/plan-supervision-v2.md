> **État : ✅ bâti le 2026-09-28** (`cc76512f7`). Le handoff de design, recopié tel
> quel ; la maquette vit hors dépôt
> (`OneDrive…/00 Boulangerie/design_handoff_supervision_v2/design/Supervision v2.dc.html`).
> Hugo : « colle à l'identique » — les libellés _(à valider)_ sont pris tels
> quels, et les rayons finis sont **repliés** (A6), ce qui remplace « déplié
> d'office ».
>
> **Découpage** (lots parallèles, fichiers disjoints) :
> S1 coque — A1–A5 et la coque mobile (B1–B5, B8) : `supervision-page/*`,
> `supervision-column/*`, `supervision-tabs.ts`, `supervision-search.ts`,
> `supervision-day.ts`, `supervision-refresh.ts` · S2 Préparation — A6 ·
> S3 Colisage — A7, B7 · S4 Retrait — A8 · S5 Contrôler — A9, B9.
>
> **Données « manquantes » (§ State)** : vérifiées le 2026-09-28, aucune ne
> demande le serveur. Le point de vente est déjà servi (`pickupLabel` dans la
> file, `destination` sur la fiche de colis) ; les SKU attendus se lisent sur
> les lignes des fiches de colis (`awaitingProduction`).
>
> L'interface commune est `SupervisionMatches` (`supervision-search.ts`) :
> `mode`, `awaitedBy`, `current` s'ajoutent à `references` / `skus`.

# Handoff : Supervision v2

## Overview

Évolution de la **Supervision du jour** (`apps/lfd-backoffice-frontend/src/app/supervision/*`, branche `dev`). La page reste en lecture — « on voit, on n'agit pas », hors contrôle qualité — et garde ses trois colonnes dont l'unité change (produit → commande → créneau). Le lot porte sur la **lisibilité** : moins de hauteur perdue, des états qui se distinguent, des colonnes reliées entre elles, une vue mobile au niveau du poste fixe, un panneau Contrôler plus clair.

## About the Design Files

`design/Supervision v2.dc.html` est une **référence de design en HTML** (s'ouvre seule dans un navigateur, données fictives), pas du code à reprendre. Le travail consiste à **refaire ces écrans dans l'app Angular existante**, avec fold-ng et ses tokens, en modifiant les composants listés ci-dessous. Toutes les couleurs de la maquette sont des valeurs de tokens fold (voir _Design Tokens_) : n'utilisez jamais les hex en dur.

## Fidelity

**Haute fidélité.** Couleurs, typo, tailles, états et comportements sont définitifs. Les libellés marqués _(à valider)_ sont des propositions.

> ⚠️ **Ne pas intégrer les repères numérotés.** Les ronds graphite numérotés 1 à 9 (dans le masthead, les en-têtes de colonne, le corps des colonnes, la bande bleue « Plus de cartes compteurs… » en mobile) et la colonne « Ce qui change » à droite sont **des annotations de revue**, pas de l'interface. Ils se masquent avec le réglage _Revue → showPins_. Les intitulés « A · Poste fixe · 1440 » / « B · Téléphone · 390 » et le texte d'introduction au-dessus des cadres sont aussi hors produit. Seul ce qui est **dans** les cadres, hors repères, est à construire.
>
> À ne pas confondre : les numéros **dans les titres de colonne** (« 1 · Préparation », « 2 · Colisage », « 3 · Retrait / livraison ») existent déjà dans le dépôt (`heading` de `supervision-column`) et restent.

---

## Screens / Views

### A. Poste fixe (≥ 900 px — `BOARD_NARROW` inchangé)

Pile verticale pleine hauteur, la page ne défile pas (inchangé, `:host { position:absolute; inset:0 }`).

```
header de l'app (48)
[bandeau « autre jour »]            ← seulement si jour ≠ jour serveur
masthead (≈ 52)                      ← une seule rangée
┌ col 1 ─────────┬ col 2 ─────────┬ col 3 ─────────┐
│ en-tête  88 px │ en-tête  88 px │ en-tête  88 px │
│ bande    42 px │ bande    42 px │ bande    42 px │
│ corps (défile) │ corps (défile) │ corps (défile) │
└────────────────┴────────────────┴────────────────┘
```

#### A1. Masthead — `supervision-page.html`

**Changement majeur : les trois `fold-card.chiffre` disparaissent au bureau** ; leur chiffre et leurs pastilles passent dans l'en-tête de colonne (A3). Le masthead devient une rangée : `padding: 10px 18px`, fond `bg-rail-secondary` (graphite-800 `#2d3a56` quand on regarde un autre jour, sinon graphite-850 `#243049`).

De gauche à droite :

1. **Jour** — `fold-view-toggle` à 3 options **« Hier · Aujourd'hui · Demain »** (remplace « Veille / Lendemain »). Option active = fond `#f2f5fb`, texte `#1a2336`. L'actif se calcule par écart au jour serveur (−1 / 0 / +1), donc un jour choisi au calendrier qui tombe sur hier allume « Hier ».
2. **Calendrier** — bouton icône (calendrier 15 px) qui ouvre un popover (272 px, `radius-sm`, `shadow-lg`) : titre mois + ‹ ›, grille lun → dim, aujourd'hui cerclé `primary`, jour choisi plein graphite-950, pied « Aujourd'hui » / « Fermer ». Pour une date hors ±1, le bouton affiche la date en toutes lettres (« mardi 16 septembre ») sur fond graphite-800. Réutilise `?date=` et `goTo()` existants.
3. **Recherche** — `fold-search` (max 560 px). **Nouveau** : quand il y a des résultats, `‹ n / m › ✕` à droite du champ (Mono 11.5). ‹ › passe au résultat suivant (ordre : col 1, col 2, col 3) et le fait défiler dans sa colonne ; ✕ efface la recherche _et_ toute mise en avant (A5).
4. **Fraîcheur** — `stampOf()` avec une pastille de 7 px devant : vert `#3fbf7f` à jour, ambre `amber-500` en retard. **Nouveau** : quand la dernière relecture a échoué (`day.stale`) ou date de plus d'un cycle, le stamp passe sur fond `warning-surface` : « à jour à 7 h 51 · relecture en retard de 4 min ».

Les `fold-callout` existants (qualité illisible, plan pas arrêté) restent sous la rangée.

#### A2. Bandeau « autre jour » (nouveau)

Pleine largeur, au-dessus du masthead, `padding 8px 18px`, 12.5 px.

- Passé : fond `warning-surface`, texte `#6b4c06`, puce `amber-700` pleine « Hier · relecture » (ou « Relecture ») + « Vous relisez mercredi 24 septembre. La journée est close, les colonnes ne bougent plus. »
- Futur : fond `primary-surface` `#eaeef8`, texte `#1f3a99`, puce `primary` « Demain · à venir » (ou « À venir ») + « Vous regardez vendredi 26 septembre. Plan pas encore arrêté : la journée se lit sans se préparer. »
- À droite, lien souligné « Revenir à aujourd'hui ».

#### A3. En-tête de colonne — `supervision-column`

**Hauteur fixe 88 px** (`box-sizing:border-box; padding:12px 18px; justify-content:space-between`), fond `surface-band` `#e6e9ef`, filet bas `border`. Identique pour les trois colonnes, pour que les corps soient alignés.

- **Rangée 1** : titre (14/700, `white-space:nowrap`) + unité (Mono 10/700 caps, `text-muted`) + `fold-info` (17 px, `flex:none`) — à droite **le chiffre de la colonne** (Mono 22/700 tabulaire) + unité (12, `text-secondary`) : « 5 lignes ouvertes », « 5 à coliser », « 14 attendues ». Pendant une recherche ou une mise en avant, le chiffre laisse la place à une puce « n trouvées » (`primary-surface`, bord `#c5d0f0`, Mono 10.5/700) ou « rien ici » (transparent, `text-muted`).
- **Rangée 2** (30 px, `nowrap`) : sous-titre à gauche (12, `text-secondary`, ellipse) — pastille(s) de blocage calée(s) à droite (`margin-left:auto`).
  - Col 1 : « 4 rayons · 2 terminés » — pastille warning « 2 commandes attendent le four ».
  - Col 2 : « 3 colisées · 2 attendent le four » — pastille warning « 4 commandes attendent le colisage ».
  - Col 3 : « 12 retraits · 2 livraisons » — **une seule pastille alert « 3 blocages ▾ »** qui ouvre un menu listant les trois causes (`overdueKitchen`, `held`, `overdueCustomer` — libellés existants de `blockersOf`). Une cause choisie → la pastille dit « Dépassé · 1 », « Retenue · 1 » ou « Pas venu · 1 ».

Pastille de blocage : `fold-badge radius="square"`, 22 px, Mono 10.5/700. **Cliquable** (A5) ; active = fond plein (`amber-700` / `#8f2c1f`) + texte blanc.

#### A4. Bande sous l'en-tête (nouveau, 42 px, fond `surface-card`, filet bas)

Même structure dans les trois colonnes : repère à gauche, filtre `fold-select` compact à droite (30 px, texte 12/600 ; filtre actif = fond `primary-surface`, texte `#1f3a99`). Menu : 220 px min, lignes 32 px, compte Mono à droite.

- Col 1 : « À sortir d'abord » — menu **« Tous les rayons ▾ »** _(filtre proposé)_.
- Col 2 : « Par heure de remise » — menu **« Tous les points ▾ »** _(filtre proposé : même `SHOP_OF` que col 3, état indépendant)_.
- Col 3 : **onglets « Retrait 12 » / « Livraison 2 »** (remplacent le `fold-view-toggle` du `columnTools`) — onglet actif souligné 2 px graphite-950, compteur en pastille graphite ; à droite, sur Retrait seulement, **« Tous les points ▾ »** (filtre par point de vente, demandé).

#### A5. Mise en avant (nouveau, sur la mécanique `supervisionMatches`)

Trois sources, une seule à la fois : la recherche, **une pastille de blocage cliquée**, **une commande « attend le four » dépliée** (clic sur « n produits attendus du four » ou double-clic sur la carte).

- Recherche / pastille : contour `2px solid primary`, offset 1 px (déjà là). Le résultat courant de ‹ › reçoit en plus un halo `0 0 0 5px rgba(43,79,201,.2)`.
- **Quand la mise en avant vise des produits** (pastille du four ou commande dépliée) :
  - lignes du four concernées : fond blanc, liseré intérieur gauche 3 px `amber-500`, ombre `0 2px 8px -3px rgba(143,101,8,.35)`, étiquette **« Attendu · Chalet Marmotte »** (`amber-500` plein, texte `#2b1d00`, Mono 10/700). Plusieurs commandes : noms séparés par des virgules ;
  - le reste recule : lignes non concernées `opacity:.35`, rayons sans ligne concernée `.4`, autres commandes `.45` (transition 200 ms) ;
  - la carte source : fond `#fffaf0`, bord `#ecd9a4`, ombre `0 6px 18px -8px rgba(143,101,8,.45)`, pas de contour bleu ; l'indice « ← en colonne 1 » à droite du bouton déplié.
- Chaque colonne défile jusqu'à sa première occurrence ; un rayon replié ou une tranche repliée qui contient une occurrence s'ouvre.

#### A6. Colonne 1 · Préparation — `preparation-column`

- **Trois fonds, un par état** (le bug actuel : `is-waiting` couvre tout ce qui n'est pas fini) :
  - pas commencé : `surface-card` blanc, bord `border`, compteur `text-muted` « 0 / 2 lignes · pas commencé » ;
  - en cours : `warning-surface` + `warning-border`, compteur `warning-text` ;
  - fini : `success-surface` + `success-border`, sans ombre.
- Ligne : grille `minmax(0,1fr) auto auto` → [nom + barre 4 px] [produit / prévu, Mono] [**Contrôler**]. Rangée de notes dessous (`grid-column:1/-1`) : étiquette « Attendu · … », pastille qualité, détail de péremption.
- **Rayons finis** : sous le séparateur « Terminés · 2 · à 6 h 10 », **repliés** par défaut (en-tête seul, ▸/▾). Replié, l'en-tête porte **« Contrôle n/m · pire verdict »** — n lignes contrôlées sur m, avec la pastille du pire verdict (`worstBadge`) : « Contrôle 1/3 · OK », « Contrôle 1/2 · Réserve » ; aucun contrôle → « Contrôle 0/m » neutre. _Compromis avec « déplié d'office » : à arbitrer._

#### A7. Colonne 2 · Colisage — `packing-column`

- Pastille d'état à droite de chaque carte, Mono 10/700 caps : **« À coliser »** (fond page, `text-secondary`), **« En cours »** (`primary-surface`, `#1f3a99`) + barre `primary`, **« Attend le four »** (`warning-surface`, `warning-text`) + liseré gauche 3 px `amber-500`. Fond de carte blanc pour les trois (fin du tout-ambre).
- « n produits attendus du four » = bouton de dépliage qui déclenche A5.
- Méta `CMD-4812 · retrait 8 h` en `nowrap` (espaces insécables dans les heures).
- Colisées : cartes `success`, « Déclarée prête à 6 h 32 », pastille qualité + **Contrôler** (outline, 26 px) calé à droite.

#### A8. Colonne 3 · Retrait / livraison — `handover-column`

- **Repère « Maintenant · 7 h 55 »** entre les tranches : puce `primary` pleine (Mono 10.5/700 caps) + filet 2 px `primary`. La colonne s'y place au chargement.
- **Tranches terminées en bas** : une tranche passée où tout est remis descend sous « Terminées · n », repliée en une ligne `success` (« 6 h – 7 h · 5 remises sur 5 · tout est parti ▸ Déplier »). Dépliée, un lien « Replier » dans son en-tête.
- En « Tous les points », chaque ligne dit son point à côté de la référence.
- Liserés inchangés : alert pour `overdueCause === 'kitchen'` et `heldForQuality`, warning pour `customer` ; remise faite barrée.

#### A9. Panneau Contrôler — `quality-panel`

`fold-panel` à droite, **460 px**, voile `rgba(26,35,54,.32)` sur la page.

- **En-tête** : sur-titre Mono « Contrôler · ligne du four » / « … · commande » + ✕ ; titre 19/700 ; sous-titre Mono (« 180 pièces au compte », « Commande CMD-4810 ») ; à droite, **la même pastille que la cible** (`lineBadge` / `orderBadge`, préfixe « Actuel · ») : « Actuel · À revoir » si périmé, jamais un OK qui contredirait la ligne. Sans contrôle : « Jamais contrôlé » neutre.
- **Verdict** : trois cartes en grille 3 colonnes (min 92 px) au lieu du segmenté — rond 22 px (✓ / ! / ✕) + libellé 14/700 + conséquence 11.5 : **OK** « Rien à redire. », **Réserve** « On le note, ça part. », **Bloquant** « Ça ne part pas. » _(à valider)_. Choisie : fond `*-surface` du verdict, bord 2 px de sa teinte.
- **Bloquant** : encadré `alert-surface` « Retenu au retrait jusqu'à un nouveau verdict » + qui est touché — ligne : les commandes qui l'attendent (« Chalet Marmotte, et toute commande du jour qui contient Brioche tressée ») ; commande : « … ne pourra pas être remise : le scan du QR la refusera. »
- **Note** : « obligatoire » (rouge) dès la réserve, sinon « facultative ». Étiquettes rapides _(proposées)_ « Cuisson · Aspect · Quantité · Emballage · Température » (pilules 30 px) qui préremplissent. Champ vide obligatoire : bord `#b33a2a`, fond `#fffafa`.
- **Photos** : tuile sombre 92 × 72 « ◉ Prendre » (`capture="environment"`, déjà dans le code) + zone de dépôt « Ajouter depuis l'appareil · JPEG, PNG, WebP, HEIC · 10 Mo ».
- **Historique · aujourd'hui** : frise, point 10 px teinté du verdict (halo 3 px), pastille, « auteur · heure », note. Périmé : « · périmé : compte passé de 96 à 180 ».
- **Pied** : raison du blocage sur sa propre ligne en `warning-text` (« Choisissez un verdict. » / « Une note est nécessaire. ») ; Annuler (outline) ; bouton principal dont le libellé suit le verdict : « Enregistrer » / « Enregistrer la réserve » / **« Bloquer »** (fond `#8f2c1f`). Inactif : `#c5d0f0`.

### B. Téléphone (< 900 px)

Colonne unique, rien ne défile hors du corps.

1. **Barre** 46 px graphite-950 : « Supervision du jour » + stamp compact (« à jour 7 h 55 », ambre en retard).
2. **Bandeau autre jour** compact (puce + « Aujourd'hui »).
3. **Masthead** (`padding 10px 12px`, gap 8) : Hier / Aujourd'hui / Demain en grille 3 colonnes (36 px) + bouton calendrier 44 × 38 (popover ancré à droite) ; recherche 40 px (texte 15) avec ‹ n / m › ✕ en cibles 32 px ; **onglets** Prépa / Colis / Remise (44 px) avec chiffre Mono et pastille ronde : rouge = nombre de blocages, **bleue `#8fabff` = nombre de résultats** pendant une recherche.
4. **Pas de cartes compteurs.**
5. **Bande de colonne** blanche : rangée 1 (40 px) sous-titre + pastilles tactiles 30 px aux libellés courts — Prépa « 5 lignes · 2 finis » + « Four · 2 » ; Colis « 5 à coliser · 3 prêtes » + « Colisage · 4 » ; Remise : pas de sous-titre (les sous-onglets le disent), « Dépassé · 1 », « Retenue · 1 », « Pas venu · 1 ». Rangée 2 (48 px) : repère + filtre (boutons 38 px, menus en lignes de 44 px), ou sous-onglets Retrait / Livraison + points.
6. **Corps** : mêmes cartes, cibles relevées — lignes ≥ 52 px, Contrôler 40 px, en-têtes de rayon repliés ≥ 32 px, tranches repliées 44 px.
7. Commande qui attend le four dépliée : bouton pleine largeur **« Voir en Préparation → »** (44 px, graphite) → bascule sur Prépa avec A5 actif.
8. Changer d'onglet ou de mise en avant fait défiler jusqu'à la première occurrence ; Remise s'ouvre sur « Maintenant ».
9. **Contrôler** = feuille qui monte (`max-height 88%`, coins 18 px, poignée 40 × 4), même contenu que A9.

---

## Interactions & Behavior

| Geste                                       | Effet                                                                 |
| ------------------------------------------- | --------------------------------------------------------------------- |
| Hier / Aujourd'hui / Demain                 | `goTo(shiftServiceDay(serverDay, ±1))` ou `goTo(null)`                |
| Calendrier → jour                           | `goTo(date)` ; ferme le popover                                       |
| Clic sur le stamp (maquette)                | simule `stale` — en prod, dérivé de `day.stale` / âge de `asOf`       |
| Frappe dans la recherche                    | efface pastille et dépliage actifs ; `cur = 0`                        |
| ‹ ›                                         | `cur ± 1` modulo le nombre de résultats ; défile la colonne concernée |
| Pastille de blocage                         | bascule `focus` (re-clic = off) ; efface recherche et dépliage        |
| « n produits attendus » / double-clic carte | bascule `awaitedOpen = ref`                                           |
| ✕ recherche                                 | efface tout                                                           |
| Tranche terminée / rayon fini               | bascule son dépliage                                                  |
| Contrôler                                   | ouvre A9 (bureau) ou la feuille (mobile) sur la cible                 |
| Enregistrer / Bloquer                       | `quality.open()` → relecture (existant)                               |

Défilement : une colonne défile de sorte que l'élément soit à ~60 px du haut du corps. Pas d'animation de défilement exigée.

## State Management

À ajouter à `SupervisionPage` (signaux) :

- `focus: 'oven' | 'packing' | 'kitchen' | 'held' | 'customer' | null`
- `awaitedOpen: string | null` (référence de commande)
- `hitCursor: number`
- `shelfFilter: string | 'all'`, `packShop: string | 'all'`, `handoverShop: string | 'all'`
- `doneShelfOpen: Set<string>`, `pastSlotOpen: Set<string>`
- `calendarOpen`, `calendarMonth` (UI locale)

`matches` devient un `computed` à trois sources (recherche > focus > awaitedOpen) qui rend `{ references, skus, mode: 'search' | 'products' }`, et une liste ordonnée de clés pour ‹ ›. Les causes de `focus` se lisent dans `packingBoard` / `handoverBoard` (déjà calculés par `blockersOf`).

**Données qui manquent au contrat** :

- le **point de vente** d'une commande de retrait (`pickupPointId` / libellé) dans `HandoverQueueView` et `ProductionPackingView` — nécessaire aux filtres A4 ;
- le lien **ligne du four → commandes** pour l'étiquette « Attendu · … » et l'impact du Bloquant : aujourd'hui seules les commandes `awaiting_oven` portent `awaited[]` (noms) ; il faudrait le SKU.

## Design Tokens

Tous issus de `navi-2-handoff.md` / `01-tokens-fold.md`.

| Rôle                                  | Token                                                         | Valeur                                        |
| ------------------------------------- | ------------------------------------------------------------- | --------------------------------------------- |
| Header app                            | `bg-header` / graphite-950                                    | `#1a2336`                                     |
| Masthead                              | `bg-rail-secondary` / graphite-850                            | `#243049`                                     |
| Masthead autre jour, champ sur chrome | graphite-800                                                  | `#2d3a56`                                     |
| Bord sur chrome                       | graphite-700                                                  | `#3a4870`                                     |
| Texte chrome                          | navyink                                                       | `#f2f5fb` · `#b9c4da` · `#8290ae`             |
| Page                                  | `bg-page` / paper-100                                         | `#f3f5f8`                                     |
| Carte                                 | `surface-card` / paper-0                                      | `#ffffff`                                     |
| En-tête colonne                       | `surface-band` / paper-200                                    | `#e6e9ef`                                     |
| Bordure                               | `border` / paper-300                                          | `#d3d8e2`                                     |
| Texte                                 | `text` · `text-secondary` · `text-muted`                      | `#0f1523` · `#41506b` · `#5c6a80`             |
| Primaire                              | `primary` · `primary-strong` · `primary-surface`              | `#2b4fc9` · `#1f3a99` · `#eaeef8`             |
| Succès                                | `success-text` / green-700 · surface · bord                   | `#146b48` · `#e8f0e9` · `#b9d6c3`             |
| Attente                               | `warning-text` / amber-700 · barre amber-500 · surface · bord | `#8f6508` · `#d4a017` · `#fbf2dc` · `#ecd9a4` |
| Alerte                                | `alert-text` · liseré · surface · bord                        | `#8f2c1f` · `#b33a2a` · `#f8e7e3` · `#e9c1b8` |

Typo : IBM Plex Sans (400/500/600/700) et IBM Plex Mono (400/500/700), déjà chargées. Chiffres toujours `tabular-nums`. Rayons : 3 px (pastilles), 4–5 px (boutons, cartes), 6 px (menus), 18 px (feuille mobile). Ombres : carte `0 1px 2px rgba(14,20,32,.05)` (`shadow-sm`), menus `0 14px 30px -14px rgba(14,20,32,.4)`.

## Assets

Aucune image. Icône calendrier : utiliser l'icône `calendar` de fold (`fold-icon`). Glyphes ✓ ! ✕ ◉ ▸ ▾ ‹ › : remplacer par les icônes fold équivalentes.

## Files

- `design/Supervision v2.dc.html` — la maquette (poste fixe 1440, téléphone 390, légende numérotée 1–9 qui renvoie aux fichiers du dépôt). Ouvrir dans un navigateur ; `support.js` à côté.

Correspondance avec le dépôt :

| Maquette | Fichier(s) à modifier                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------- |
| A1, A2   | `supervision-page/supervision-page.{html,scss,ts}`, `supervision-tabs.ts` (`stampOf`), `supervision-day.ts` |
| A3, A4   | `supervision-column/*` (hauteur fixe, slot de bande), `supervision-tabs.ts` (`blockersOf`, sous-titres)     |
| A5       | `supervision-search.ts` (trois sources), les trois colonnes (styles `is-match` / mode produits)             |
| A6       | `preparation-column/*`, `preparation-shelves.ts`, `quality-badges.ts` (`worstBadge` + compte n/m)           |
| A7       | `packing-column/*`, `packing-cards.ts`                                                                      |
| A8       | `handover-column/*`, `handover-slots.ts` (ordre des tranches, repère maintenant, filtre point)              |
| A9       | `quality-panel/*`, `quality-draft.ts`                                                                       |
| B        | les mêmes, branche `narrow()` ; `supervisionTabs()` pour les pastilles d'onglet                             |

---

## Écarts à la maquette, au 2026-09-28

**Dus à fold** (à régler dans fold, puis une version publiée) :

- le déclencheur de `fold-listbox` ne se teinte pas en « filtre actif » ;
- le point de `fold-timeline` ne prend pas la teinte du verdict ;
- l'intent `danger` et l'état inactif du bouton suivent fold, pas `#8f2c1f` / `#c5d0f0` ;
- le champ de note vide en alerte suit le rendu `errors` de fold ;
- la feuille mobile du panneau ne règle ni `max-height 88 %` ni ses coins ;
- `FoldViewNavItem.badge` n'a pas de teinte : la pastille des résultats n'est pas bleue ;
- `fold-listbox` prend le TEXTE d'une option pour libeller son bouton : les
  comptes du menu passent par `::after`.

**Décidés dans l'app** :

- B1 : pas de titre « Supervision du jour » dans la barre mobile, l'en-tête
  de l'app le dit déjà ;
- les rayons finis sont repliés (Hugo : « colle à l'identique ») ;
- enseigne partout (`tradeName ?? customerLabel`), dans la voix du Retrait ;
- « Prête à … » du colisage est une pastille alignée comme « Attend le four » ;
- retard au-delà de 60 min en heures (« 1 h 42 », « 15 h ») ;
- chiffre d'en-tête en `text-xl` (20 px) au lieu de 22 px ; tailles 10,5 /
  11,5 / 12,5 arrondies aux tokens `2xs` / `xs` / `sm`.
