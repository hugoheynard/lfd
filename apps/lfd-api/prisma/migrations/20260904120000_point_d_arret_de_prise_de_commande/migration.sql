-- **Le point d'arrêt de prise de commande, déclaré par le référentiel.**
--
-- La limite existait déjà côté commerce, accrochée à un **point de retrait**.
-- Un point de retrait n'est ni un lieu de production ni un lieu de livraison :
-- c'est l'endroit où un client vient chercher. La conséquence se voyait dans le
-- code — une commande LIVRÉE ne pouvait matcher aucune règle de point, donc
-- toute la moitié livrée du commerce n'avait qu'une seule limite possible.
--
-- Ce qui fait vraiment varier une limite, c'est **ce qu'on produit** : la
-- viennoiserie et le pain n'ont pas la même charge, et un entremets à inserts
-- gelés démarre la veille du montage. D'où une échelle de catalogue —
-- `global → famille → produit → déclinaison` —, la même que celle des prix.
--
-- **Les trois valeurs sont nullables**, et c'est la décision structurante :
-- l'héritage se fait CHAMP PAR CHAMP. Un rang pose ce qu'il change et hérite du
-- reste. Le jour où le labo passe de 18 h à 16 h, tout ce qui n'a pas d'heure
-- propre suit. Une règle recopiée entière serait restée figée, en silence, sur
-- chaque article qui l'avait dupliquée.
--
-- **Additif et sans effet à la pose** : la table naît vide, et une table vide ne
-- résout aucune limite — le comportement d'avant, à l'identique. Retour arrière :
-- `DROP TABLE`, aucune autre colonne n'est lue ni réécrite.
CREATE TABLE "pim"."order_time_limit" (
    "id"            TEXT NOT NULL,
    "scope_type"    TEXT NOT NULL,
    "scope_id"      TEXT,
    "days_before"   INTEGER,
    "time"          TEXT,
    "grace_minutes" INTEGER,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL,
    "updated_by"    TEXT,

    CONSTRAINT "order_time_limit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_time_limit_scope_type_idx" ON "pim"."order_time_limit" ("scope_type");

-- **Une seule règle par portée — refusé par la base.**
--
-- Un `UNIQUE (scope_type, scope_id)` nu laisserait passer DEUX règles globales :
-- Postgres tient chaque `NULL` pour distinct. `coalesce` referme le trou, et la
-- résolution cesse de dépendre de l'ordre de lecture. Même leçon que
-- `price_floors_one_per_scope`.
CREATE UNIQUE INDEX "order_time_limit_one_per_scope"
    ON "pim"."order_time_limit" ("scope_type", coalesce("scope_id", ''));

-- **Une portée nomme sa cible, ou ne nomme rien — jamais l'un et l'autre.**
--
-- `global` avec une famille dirait deux choses contradictoires ; `category` sans
-- famille ne viserait rien. La règle vit déjà dans le value object, mais un
-- `UPDATE` manuel ou un futur adaptateur passeraient à côté de lui.
ALTER TABLE "pim"."order_time_limit"
    ADD CONSTRAINT "order_time_limit_scope_id_iff_not_global"
    CHECK (("scope_type" = 'global') = ("scope_id" IS NULL));
