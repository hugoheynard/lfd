# TODO — le journal d'activité

> **État au 2026-08-21** : le journal **existe et se lit**. Le référentiel y
> écrit sept faits avec leur portée, `GET /admin/activity` l'expose filtré et
> paginé, et l'écran Admin › Journal le rend en phrases françaises.
>
> Le modèle et les décisions : [`../b2b/architecture-journal-activite.md`](../b2b/architecture-journal-activite.md).

## Pourquoi on y reviendra

La tranche livrée prouve la chaîne de bout en bout — émettre, figer, filtrer,
lire — sur un seul module. **Elle ne la généralise pas**, et c'est délibéré :
étendre un journal à tous les modules avant d'avoir vu le premier se lire en
vrai, c'est figer un vocabulaire et un budget de lectures sur des suppositions.

Ce qui suit attend donc un usage réel, pas un créneau.

## Ce qui reste

### 1. Les modules qui n'écrivent rien

Le référentiel a ses sept faits, la croissance les siens (leads, rendez-vous,
commandes, comptes). **N'écrivent encore rien** : les avenants de commande, la
tarification, les emplacements, les réglages de plateforme, les dérogations de
permission.

Le dernier est le plus gênant : « qui a ouvert la compta à Marc, et quand »
n'est répondable que par `granted_by` / `granted_at` sur la ligne de dérogation
— donc seulement pour l'écart **actuel**, jamais pour celui qui a été retiré.

**Règle en ajoutant un émetteur** : un fait mérite le journal quand il change ce
qui est vendu, facturé, ou ce que quelqu'un a le droit de voir. Le reste est du
bruit qu'il faudra filtrer plus tard.

### 2. La profondeur à la lecture

Le journal fige des **comptes directs** (`familiesEmporter`, `variants`) et
refuse le rayon transitif — cf. §3 du doc d'architecture, la décision ne se
rejoue pas. Ce qui manque est l'autre moitié : ouvrir un événement et demander
« **et aujourd'hui, ça touche quoi ?** », qui est une requête, pas un nombre
stocké.

L'écran affiche pour l'instant la portée figée, sans savoir répondre à la
seconde question.

### 3. La promotion du journal en `platform/`

Le port du référentiel (`pim/journal/pim-journal.ts`) est branché par la racine
sur `ActivityRecorder`, qui vit dans `b2b/growth`. **Seuil déclencheur : le
troisième bloc émetteur.** À deux, un port et un binding de racine coûtent moins
qu'un déménagement de quarante-trois fichiers ; à trois, la fiction « la
croissance possède le journal » ne tient plus — et le schéma Postgres `growth`
devient un nom trompeur pour une table que tout le monde écrit.

Le renommage du schéma est une migration à part, plus coûteuse que le
déménagement du code : à décider séparément.

### 4. Rétention et volume

Prévu à la pose du journal, toujours pas fait : **partitionnement mensuel** et
politique de rétention, en SQL brut (non exprimable en Prisma déclaratif). Sans
volume réel, tout choix de fenêtre serait arbitraire.

À surveiller d'abord : la table n'a pas d'index sur `actor_id`, alors que le
filtre par acteur est exposé par l'API. Tant que le volume est faible, le scan
passe ; c'est le premier index à poser quand il ne passera plus.

### 5. Filtres non exposés à l'écran

L'API accepte `type`, `subjectType`, `subjectId`, `actorId` et `until` ; l'écran
n'offre que le module et la période. Les deux qui manqueront en premier :

- **par sujet** — « l'histoire de ce taux », depuis la fiche elle-même plutôt
  que depuis le journal ;
- **par acteur** — « qu'a fait cette personne », depuis l'annuaire staff.

Les deux sont des **liens entrants** vers le journal, pas des champs de plus
dans sa barre de filtres. C'est ce qui décidera de leur forme.

### 6. Le mur, à réexaminer

`activity:read` est réservé à `admin`. La question qui reviendra : ouvrir la
**tranche fiscale** à `comptabilite`, qui écrit les taux sans pouvoir relire
qui les a changés. Ça suppose un filtrage par module **côté serveur imposé**, et
non un filtre d'écran — sinon c'est le journal entier qui s'ouvre.
