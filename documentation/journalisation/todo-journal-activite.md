# TODO — le journal d'activité

> **Rangé dans `journalisation/` le 2026-09-18** (Hugo : « tous les points en
> rapport avec la journalisation dans `documentation/journalisation` »). Ce
> fichier réunit désormais les points ouverts sur **tous** les journaux — le
> journal d'activité, celui de l'annuaire staff, celui du référentiel, le
> journal tarifaire —, chacun avec un renvoi vers le doc d'où il vient. Le
> bug de l'idempotence — un doublon qui annulait la transaction qu'il devait
> épargner — avait son propre fichier ; il est **corrigé le 2026-09-18**, et
> le fichier supprimé.

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

⚠️ **Cette liste en comptait cinq et n'en vaut qu'un.** Vérifiée le 2026-09-03,
handler par handler, contre `publishTraced` / `ActivityRecorder` :

| ce qui était listé            | état réel                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| la tarification               | **écrit** — `volume-commitment.handlers`. Et les règles et planchers ont leur PROPRE journal, servi par `GET /admin/pricing/journal` |
| les emplacements              | **écrit** — `pickup-address.handlers`                                                                                                |
| les réglages de plateforme    | **le contexte n'existe plus** — c'est la route morte que le runbook visait encore                                                    |
| les avenants de commande      | **aucun contexte de ce nom**                                                                                                         |
| les dérogations de permission | **écrit depuis le 2026-09-18** — `staff_user.overrides_changed`, avec l'avant et l'après (journal de l'annuaire)                     |

Écrire une liste de cinq où un seul item tient a un coût précis : le point qui
compte s'y noie. Celui-ci était même annoncé « le plus gênant » à la ligne
suivante, sous quatre items dont deux nomment du code disparu.

**Plus aucun, au 2026-09-18.** Le dernier — « qui a ouvert la compta à Marc, et
quand », répondable seulement pour l'écart **actuel** — est fermé par le journal
de l'annuaire
([`../staff/journalisation-staff/architecture-journal-de-l-annuaire.md`](../staff/journalisation-staff/architecture-journal-de-l-annuaire.md)) :
un droit retiré laisse désormais sa trace. Ce point reste ouvert pour une seule
raison, la règle ci-dessous, à appliquer au prochain module.

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

**Le port est promu depuis le 2026-08-25** (`9785f834`) : `Journal` vit dans
`platform/journal/`, et les blocs métier n'écrivent plus qu'à lui (vérifié le
2026-09-18). **Ce qui reste en `b2b/growth`** : l'implémentation
(`ActivityRecorder`, `PrismaActivityRecorder`, `ActorNamer`), la lecture de
l'écran, et la table dans le schéma `growth` — que quatre blocs écrivent
désormais (`b2b/`, `pim/`, `staff/`, la tarification). À deux, un port et un binding de racine coûtaient moins
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

### 7. La recherche du journal

_Venu de [`../staff/journalisation-staff/architecture-journal-de-l-annuaire.md`](../staff/journalisation-staff/architecture-journal-de-l-annuaire.md) §9, le 2026-09-18._

- **Sensible aux accents** : l'extension `unaccent` n'est pas installée, et
  « cecile » ne trouve pas « Cécile ».
- **Elle lit aussi les clés de la charge** : chercher « person », « label » ou
  « changes » ramène presque tout le journal. Chercher un nom, un numéro ou un
  libellé n'a pas ce défaut.
- **Aucun index ne la sert** : chaque recherche parcourt la table, paginée.
  Un index trigramme demanderait une migration — à faire le jour où le journal
  grossit assez pour que ça se sente.

### 8. Les phrases de l'équipe, à relire

_Venu du même §9._

- **Une fiche en attente ou invitée passée à « active » à la main** écrit
  `staff_user.reinstated` : l'écran dit « a rétabli l'accès », approximatif pour
  une première activation manuelle.
- **La fonction de l'auteur n'apparaît pas** sur une ligne de l'équipe : la
  phrase nomme l'auteur, la méta ne répète plus « par Hugo Heynard
  (Administrateur) ».
- **Les noms ne sont pas en gras** : la phrase est une chaîne simple.

### 9. L'historique d'une fiche produit

_Venu de [`../pim/journalisation-et-tracabilite.md`](../pim/journalisation-et-tracabilite.md) §13._

Les faits du référentiel sont écrits et lisibles (index
`[subject_type, subject_id, occurred_at]`), mais **l'onglet « Historique » de la
fiche produit n'existe pas**. C'est aussi le premier « lien entrant par sujet »
du §5.

### 10. Le journal tarifaire

_Venu de [`../pricing/architecture-resolution-de-prix.md`](../pricing/architecture-resolution-de-prix.md), « Reste ouvert »._

- **Il n'est pas paginé** : il rend les 200 derniers actes d'un sujet et les 50
  derniers tous sujets confondus (`prisma-pricing-journal.reader.ts`,
  `read-pricing-journal.handler.ts`, vérifié le 2026-09-18).
- **Une règle ne se modifie pas** : poser, suspendre, reprendre, archiver.
  Corriger une faute de frappe oblige à archiver et reposer, ce qui salit le
  journal pour rien.
- ~~L'auteur s'affiche par son `sub`~~ — **réglé le 2026-09-18** : le journal
  tarifaire sert le nom de l'auteur, et son `actor` est l'id de la fiche
  ([`../staff/plan-l-auteur-est-la-fiche.md`](../staff/plan-l-auteur-est-la-fiche.md)).
