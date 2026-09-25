# Plan — les limites de prix passent à la comptabilité, pour le pro et le public

> Ouvert le 2026-09-25, à la demande de Hugo : « dans la page tarification
> B2B il y a la colonne limites, je voudrais qu'on la déplace en comptabilité,
> limite de prix, avec un droit à part — étendre le concept à pro / public ;
> dans la table tarification B2B, sous la ligne avec la ref et le prix, une
> ligne limite avec les mêmes infos, en lecture seule ». Décidé ensuite :
> le droit s'appelle `price_limits` ; la porte dynamique passe aussi en
> comptabilité ; la limite publique **existe dès maintenant** mais ne borne
> rien tant que le moteur de promotions public n'est pas bâti (« c'est juste
> pas implémenté pour le moment »). État : **doc-first**, contredit par vitruve
> le 2026-09-25 (trois objections bloquantes, corrigées : §3, §4, §5).

## 1. Ce qui existe (vérifié le 2026-09-25)

- **Le modèle** : `PriceFloor` (`prisma/schema/public/pricing.prisma`, table
  `price_floors`, contexte `b2b/pricing`). Un mur (`mode` : pourcentage du
  canonique en points de base, ou montant en **millicentimes** ; `value`), une
  **porte dynamique** facultative (`dynamic_mode`/`dynamic_value`, ouverte par
  `unlock_min_quantity` et `unlock_min_volume_ratio_bp`), une portée
  (`global | category | product | variant`), une référence de dérive
  (`reference_canonical_millicents` — le signal « à confirmer »), une
  fenêtre (`valid_from`/`valid_to`), l'archivage (jamais de DELETE).
- **La contrainte** `price_floors_no_overlap` (migration
  `20260909190000_plancher_date`) : une limite par portée **à tout instant**,
  `EXCLUDE USING gist` sur `(scope_type, coalesce(scope_id,''), tstzrange)`,
  hors archivées.
- **Les gestes** : `admin-price-floors.controller.ts`, trois routes (poser
  `PUT /admin/pricing/floors`, confirmer, retirer), `@AdminSurface("b2b_pricing")`.
  Handlers `SetPriceFloor`, `ConfirmPriceFloor`, `ArchivePriceFloor`.
- **L'effet** : `resolve-floor.ts` — une **post-condition** après les quatre
  étages (mercuriale, volume, promotion, geste) : le prix est **relevé** à la
  limite, jamais refusé (`floored: true` dans la vue).
  (`documentation/pricing/architecture-resolution-de-prix.md`.)
- **Les lecteurs** : `pricing-materials.loader.ts` (la résolution) et
  `prisma-pricing-decisions.reader.ts` (le tableau de la Tarification B2B),
  qui lisent tous deux **toutes** les limites.
- **Le public** : le particulier paie le canonique du miroir, sans règle ni
  limite (`documentation/pricing/architecture-prix-boutique.md`).
- **L'écran** : la colonne « Limites » de
  `b2b/tarification/shelf-table/shelf-table.html` (étiquette, héritée ou
  propre, « a relevé », « à confirmer », boutons poser / modifier).

## 2. Ce qui change

1. **Un droit `price_limits`** gouverne les trois gestes, porte dynamique
   comprise. Il n'est **plus** couvert par `b2b_pricing` : le commercial ne
   pose plus ses propres limites. Lecture : `price_limits:read`.
2. **Chaque limite vise un public** : `pro` ou `public`.
3. **Une vue « Limites de prix »** dans l'espace Comptabilité, qui reprend
   tout ce que fait la colonne aujourd'hui, pour les deux publics.
4. **La Tarification B2B** perd la colonne éditable ; sous chaque ligne
   (référence, prix), une **ligne « limite »** en lecture seule avec les mêmes
   informations — la limite **pro** qui s'applique à cet article.
5. **La limite publique ne borne rien** tant que le moteur de promotions
   public n'existe pas. Elle se pose, se date, se journalise ; l'écran le dit.

## 3. La clientèle d'une limite — migration de données

⚠️ **Le mot n'est pas « audience »** : dans ce contexte, `audience_type` /
`audience_id` (`all | segment | company`) disent déjà **à quel client** une
règle ou un palier s'applique, et `audienceClause()` s'en sert. Le mot est
**`clientele`**, celui de `Order.clientele`, et le type est **l'enum Postgres
existant** `OrderClientele` (`pro | public`) — pas un second typage des mêmes
valeurs.

Migration additive (**étendre**), un seul déploiement, rien n'est retiré :

- `price_floors.clientele "OrderClientele" NOT NULL DEFAULT 'pro'` — toutes
  les limites existantes sont **pro**, et c'est leur sens réel : elles ne se
  sont jamais appliquées au public.
- La contrainte d'exclusion **gagne la clientèle** : créer
  `price_floors_no_overlap_by_clientele` (`clientele WITH =` en plus),
  **puis** supprimer `price_floors_no_overlap` (posée par
  `20260909190000_plancher_date`, la dernière à toucher la contrainte). Dans
  cet ordre, la table n'est à aucun instant sans garantie.
- `dev/seeding/reset.seed.ts` lit `price_floors` : il suit.

## 4. Ce qui lit et écrit quoi — la clientèle partout où la portée est

🔴 **La contrainte ne suffit pas** : l'application clôt elle-même la limite
précédente. `prisma-pricing-floor.repository.ts` — `pose()` borne « la
précédente » par un `updateMany` sur la portée et la fenêtre, et
`inForceFor(scope, at)` (appelé par Set et Confirm) rend la première ligne
venue. Sans la clientèle, **poser une limite publique fermerait la limite
pro de la même portée**, sans que la base y voie un chevauchement. Donc :

- **Écriture** : l'entité `PricingFloor`, le dépôt (`pose`, `inForceFor`,
  archivage) et les commandes Set / Confirm / Archive portent la clientèle ;
  toute requête qui cible une limite par sa portée cible **portée +
  clientèle**.
- **Résolution** : `PrismaPriceFloorReader` — le vrai lecteur, avec son cache
  de toute la table et `listAll(at)` pour la relecture datée — ne rend que
  `clientele = 'pro'`. La commande (`order-line-pricing.service` → loader)
  passe par lui. Aucun autre chemin de résolution ne contourne
  `PricingMaterialsLoader` / `pricerOver` (vérifié par vitruve le
  2026-09-25).
- **Écrans pro** : `prisma-pricing-decisions.reader.ts` alimente **trois**
  écrans — le tableau de la Tarification B2B, le tarif d'un client
  (`company-pricing.query`) et les prix affichés (`boardMaterials`,
  `pricer-over`, `board-item`) ; il ne lit que les limites **pro**. Le
  `globalFloor` du tableau (`find(scope.type === "global")`) redevient alors
  univoque.
- **Aucun lecteur public** aujourd'hui. Le futur moteur de promotions public
  lira `clientele = 'public'` par la même post-condition (`resolve-floor.ts`),
  qui n'a pas à connaître la clientèle.
- **Le journal tarifaire** (`PricingEvent` : `subjectType`, `subjectId`, `act`,
  `actor`, `reason`, `summary` — **pas de charge**). Aujourd'hui `subjectId =
floorScopeKey(scope)`. Décision, irréversible dès le premier fait publié :
  **la clé des limites pro ne change pas** (leur historique reste continu), et
  celle d'une limite publique est `public:` + `floorScopeKey(scope)`. Le
  `summary` nomme la clientèle (« Limite publique posée… »).

## 5. Le droit et les routes

- Ressource `price_limits`, libellé « Limites de prix ». Valeur d'enum dans sa
  migration seule, puis octroi.
- **L'octroi suit le modèle de `20260926120100_les_droits_jamais_ecrits`** : la
  table des rôles peut diverger du contrat en production, donc on **ajoute** la
  ressource à la définition du rôle si elle est absente, sans jamais écraser
  `grants`, et `ROLE_GRANTS` dit la même chose (e2e de parité). Migrations
  datées **après** `20260926120100`.
- Octroi : `admin` `write` (invariant), `comptabilite` `write`.
- **Qui a le droit de pricer voit la limite — dans la Tarification, pas dans
  la Comptabilité** (Hugo, 2026-09-25 : « si tu as le droit de pricer, tu
  devrais pouvoir voir la limite au moins », puis « mes commerciaux n'ont pas
  à accéder au bloc comptabilité »). La ligne en lecture seule sous chaque
  article vient du tableau, sous `b2b_pricing:read` : **aucun droit de plus**.
  `price_limits:read` n'est accordé à **aucun** rôle de pricing ; la vue
  Comptabilité reste à la comptabilité et à l'administration. Le commercial
  perd le geste de poser une limite — c'est l'objet de la demande — et garde
  la lecture là où il travaille.
- **Les routes changent de garde, pas d'adresse.** Le contrôleur compte **sept**
  routes (poser ; confirmer global et par portée ; archiver global et par
  portée ; deux `DELETE`). Elles passent dans un contrôleur à elles,
  `@AdminSurface("price_limits")`, **mêmes chemins** : l'action se déduit du
  verbe comme partout, `admin-surface-coverage.spec` les couvre, et une route
  ajoutée plus tard ne retombera pas sur `b2b_pricing`. (Un
  `@RequirePermission` par route aurait marché — il **remplace** la ressource
  de surface, `staff-access.guard.ts` — mais laisse ce piège ouvert.)
- **La clientèle entre dans le contrat, avec `pro` par défaut** : dans la
  charge de `PUT floors`, et en paramètre `?clientele=` sur confirmer et
  archiver. Le front en ligne, qui n'envoie rien, continue de viser le pro —
  le contrat servi ne casse pas (`CLAUDE.md` §0).
- Une lecture `GET /admin/pricing/floors?clientele=` (liste en vigueur, pour
  la vue Comptabilité), `price_limits:read`. La ligne sous la Tarification B2B
  passe par le tableau existant (`b2b_pricing:read`), qui porte déjà la limite
  pro.

## 6. Écrans

**Comptabilité › Limites de prix** (`/comptabilite/limites-de-prix`, garde
`price_limits:read`, entrée du rail de la Comptabilité) :

- Un segmenté **Pro · Public**. Sous Public, une bannière : « Les limites
  publiques s'appliqueront aux promotions de la boutique. Elles ne bornent
  encore aucun prix : il n'y a pas de promotion publique aujourd'hui. »
- La liste des limites en vigueur, par portée : global, puis catégories,
  puis produits — la même lecture que la colonne d'aujourd'hui (valeur,
  porte dynamique, « a relevé », « à confirmer »).
- Les gestes (poser, modifier, confirmer, retirer) : les dialogues **existants**
  de la Tarification B2B. Visibles avec `price_limits:write` seulement.
- **Le coût, chiffré** : 17 fichiers de `b2b/tarification` parlent de limite.
  Le dialogue propre à la limite (`floor-panel`) déménage dans
  `comptabilite/` ; ce qui est **partagé avec les règles** (`archive-panel`,
  `tarification.service.ts`) ne déménage pas — la partie limite en est
  extraite dans un service à elle, que les deux écrans lisent. `summary-bar`
  (compteurs « a relevé » / « à confirmer »), `price-path`, `final-price`,
  `journal-panel` et le simulateur **gardent** la lecture de la limite pro :
  c'est l'explication d'un prix, pas un geste.

**Tarification B2B** : la colonne « Limites » disparaît. Sous chaque ligne
d'article, une ligne « Limite » en lecture seule : valeur, héritée ou propre,
porte dynamique si elle existe, « a relevé », « à confirmer ». Un lien « Gérer
les limites » vers la Comptabilité, affiché avec `price_limits:read`.

## 7. Tests

- Migration : toute limite existante devient `pro` ; deux pro qui se
  chevauchent sont toujours refusées.
- 🔴 **Par l'application, pas en SQL** : poser une limite publique sur une
  portée qui a une limite pro **laisse la limite pro en vigueur** (e2e par la
  route) ; confirmer / archiver avec `?clientele=public` ne touche pas la pro ;
  sans paramètre, c'est la pro.
- Journal : l'historique d'une portée pro ne montre aucun fait public.
- Résolution : une limite **publique** ne relève **aucun** prix pro (e2e :
  limite publique posée à un montant élevé, prix pro inchangé).
- Droit : poser une limite sans `price_limits:write` → 403, **y compris avec
  `b2b_pricing:write`** (le commercial) ; avec, 200.
- Parité des rôles : `ROLE_GRANTS` ↔ table.
- Front : la Tarification B2B n'a plus aucun bouton de limite ; la ligne en
  lecture seule reprend l'étiquette ; la vue Comptabilité montre ses gestes
  selon le droit, et la bannière sous Public.

## 8. Hors périmètre

- Le moteur de promotions public, qui lira les limites publiques.
- Une limite qui **refuse** au lieu de relever.
