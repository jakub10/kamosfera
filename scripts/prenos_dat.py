#!/usr/bin/env python3
"""
Z exportu starej Kamosféry (Lovable Cloud) vyrobí jeden SQL súbor pre nový
Supabase projekt.

Prečo skript a nie hotové SQL v repozitári: to SQL obsahuje e-maily detí
a obsah ich súkromných správ. Do gitu nepatrí. Tu je len postup — dáta si
každý vygeneruje zo svojho exportu a súbor po použití zmaže.

Použitie:
    python3 scripts/prenos_dat.py <adresár s CSV> <súbor s účtami> > import.sql

Súbor s účtami je zoznam `e-mail` na riadok (zo záložky Users). Účty sa
k profilom priradia podľa toho, že stará Kamosféra odvodzovala prezývku
z e-mailu — kto sa hlásil ako `karel.vomacka@…`, mal prezývku
`karel.vomacka`. Bola to
diera do súkromia a je zalepená; tu sa naposledy hodí.

Čo skript rieši, a čo by bez neho padlo:

* **Odznaky.** Staré `achievement_id` v novej databáze neexistujú — migrácie
  zakladajú osemnásť základných odznakov s novými náhodnými id. Prepája ich
  preto cez názov, ktorý je jednoznačný.
* **Triggery.** Vloženie príspevkov a komentárov by prepočítavalo štatistiky
  a vyrábalo oznámenia s dnešným dátumom. Deti by otvorili appku a našli
  v nej stotridsať oznámení o veciach spred pol roka. Preto sú na čas
  importu vypnuté a štatistiky sa berú z exportu.
* **Heslá.** Z Lovable sa preniesť nedajú, nie sú v exporte. Každý dostane
  rovnaké dočasné heslo (iná soľ pre každého, nech to zo súboru nevyzerá
  ako jedna a tá istá vec) a hneď si ho zmení.

  Hash má zámerne predponu `$2a$`, nie novšiu `$2b$`. Prihlasovanie v
  Supabase zvládne obe, ale `$2a$` vie overiť aj `crypt()` z pgcrypto —
  takže sa dá priamo v databáze skontrolovať, že heslo naozaj sedí,
  namiesto dúfania, že sa deti prihlásia.
"""

import csv
import pathlib
import sys
import unicodedata

import bcrypt

HESLO = "HuraDoKamosfery"


def q(v, empty_is_null=True):
    """
    Hodnota do SQL.

    Prázdna bunka v CSV znamená obvykle NULL — chýbajúci avatar, prázdne bio.
    Nie však vždy: príspevok, ktorý je iba obrázok, má prázdny text a stĺpec
    `content` je NOT NULL. Tam prázdno znamená prázdno, nie „nič".
    """
    if v is None or v == "":
        return "NULL" if empty_is_null else "''"
    return "'" + str(v).replace("'", "''") + "'"


def load(folder: pathlib.Path, name: str):
    matches = sorted(folder.glob(name + "*.csv"))
    if not matches:
        return []
    with matches[-1].open(encoding="utf-8-sig") as fh:
        return list(csv.DictReader(fh, delimiter=";"))


def copy_block(table, cols, rows, transform=None, not_null=(), on_conflict=None):
    """
    INSERT s pevným zoznamom stĺpcov; prázdny vstup nevypíše nič.

    `not_null` sú stĺpce, kde prázdna bunka znamená prázdny reťazec, nie NULL.
    `on_conflict` prepíše štandardné DO NOTHING — hodí sa tam, kde riadok už
    vyrobil trigger a treba ho opraviť, nie preskočiť.
    """
    if not rows:
        return f"-- {table}: v exporte nič nebolo\n"
    out = [f"INSERT INTO {table} ({', '.join(cols)}) VALUES"]
    body = []
    for r in rows:
        vals = transform(r) if transform else [
            q(r.get(c), empty_is_null=c not in not_null) for c in cols
        ]
        body.append("  (" + ", ".join(vals) + ")")
    out.append(",\n".join(body))
    out.append((on_conflict or "ON CONFLICT DO NOTHING") + ";\n")
    return "\n".join(out)


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    folder = pathlib.Path(sys.argv[1])
    emails = [
        line.strip().split()[0]
        for line in pathlib.Path(sys.argv[2]).read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]

    t = lambda n: load(folder, n)
    profiles = t("profiles")
    by_local = {e.split("@")[0].lower(): e for e in emails}

    users = []
    for p in profiles:
        local = unicodedata.normalize("NFC", p["username"]).lower()
        email = by_local.get(local)
        if not email:
            sys.exit(
                f"CHYBA: k profilu '{p['username']}' sa nenašiel e-mail.\n"
                "Doplň ho do súboru s účtami, inak by sa to dieťa neprihlásilo."
            )
        users.append((p["user_id"], email))

    print(f"-- Prenos starej Kamosféry do nového Supabase projektu.")
    print(f"-- {len(users)} účtov. Dočasné heslo pre všetkých: {HESLO}")
    print("--")
    print("-- Spustiť v SQL editore CELÉ naraz. Je to jedna transakcia —")
    print("-- keď čokoľvek zlyhá, nezostane po tom polovičný stav.")
    print("--")
    print("-- POZOR: tento súbor obsahuje e-maily detí a obsah ich súkromných")
    print("-- správ. Po použití ho zmaž a nikam ho neukladaj.")
    print()
    print("BEGIN;")
    print()

    # --- účty -------------------------------------------------------------
    print("-- 1. Účty. Pôvodné id, aby staré príspevky sadli na správne deti.")
    print("CREATE TEMP TABLE kamo_users (id uuid PRIMARY KEY, email text, pass text) ON COMMIT DROP;")
    print("INSERT INTO kamo_users (id, email, pass) VALUES")
    print(",\n".join(
        f"  ({q(uid)}, {q(email)}, "
        f"{q(bcrypt.hashpw(HESLO.encode(), bcrypt.gensalt(rounds=10, prefix=b'2a')).decode())})"
        for uid, email in users
    ) + ";")
    print("""
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
SELECT
  u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  u.email, u.pass, now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
FROM kamo_users u
ON CONFLICT (id) DO NOTHING;

-- Prihlasovanie v Supabase číta tieto stĺpce ako text a na NULL padne
-- s „Database error querying schema". Keď účet zakladá Supabase sám,
-- vyplní ich prázdnym textom; tu to treba spraviť ručne. Nie každá verzia
-- má všetky, tak podľa toho, čo tam je.
DO $kamo$
DECLARE stlpec text;
BEGIN
  FOREACH stlpec IN ARRAY ARRAY[
    'confirmation_token', 'recovery_token',
    'email_change_token_new', 'email_change_token_current', 'email_change',
    'phone_change', 'phone_change_token', 'reauthentication_token'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = stlpec
    ) THEN
      EXECUTE format(
        'UPDATE auth.users SET %I = '''' WHERE %I IS NULL AND id IN (SELECT id FROM kamo_users)',
        stlpec, stlpec);
    END IF;
  END LOOP;
END $kamo$;

-- Bez záznamu v `identities` sa prihlásenie heslom neuchytí. Tvar tejto
-- tabuľky sa medzi verziami Supabase líšil, tak podľa toho, čo tam je.
DO $kamo$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'auth' AND table_name = 'identities'
       AND column_name = 'provider_id'
  ) THEN
    INSERT INTO auth.identities (provider_id, user_id, identity_data, provider,
                                 last_sign_in_at, created_at, updated_at)
    SELECT u.id::text, u.id,
           jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
           'email', now(), now(), now()
    FROM kamo_users u
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO auth.identities (id, user_id, identity_data, provider,
                                 last_sign_in_at, created_at, updated_at)
    SELECT u.id, u.id,
           jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
           'email', now(), now(), now()
    FROM kamo_users u
    ON CONFLICT DO NOTHING;
  END IF;
END $kamo$;
""")

    # --- triggery ---------------------------------------------------------
    trigger_tables = [
        "public.posts", "public.comments", "public.likes", "public.friendships",
        "public.messages", "public.user_stats", "public.user_game_stats",
        "public.profiles", "public.group_messages",
    ]
    print("-- 2. Triggery na čas importu preč. Inak by prepočítavali štatistiky")
    print("--    a vyrábali oznámenia s dnešným dátumom o veciach spred pol roka.")
    for tbl in trigger_tables:
        print(f"ALTER TABLE {tbl} DISABLE TRIGGER USER;")
    print()

    print("-- 3. Dáta, v poradí podľa závislostí.")
    # Vloženie účtov spustilo `handle_new_user`, ktorá každému hneď založila
    # profil s prezývkou `kamos_NNNN`. Tieto riadky ho teda neprekladajú
    # vedľa, ale prepisujú — inak by sa deti navzájom nespoznali.
    # `id` sa nechává tak, jak ho vyrobil trigger: neodkazuje na něj nic.
    print(copy_block(
        "public.profiles",
        ["user_id", "username", "full_name", "avatar_url", "bio", "location",
         "website", "created_at", "updated_at", "avatar_config"],
        profiles,
        not_null=("username", "full_name"),
        on_conflict=(
            "ON CONFLICT (user_id) DO UPDATE SET\n"
            "  username = EXCLUDED.username,\n"
            "  full_name = EXCLUDED.full_name,\n"
            "  avatar_url = EXCLUDED.avatar_url,\n"
            "  bio = EXCLUDED.bio,\n"
            "  location = EXCLUDED.location,\n"
            "  website = EXCLUDED.website,\n"
            "  created_at = EXCLUDED.created_at,\n"
            "  updated_at = EXCLUDED.updated_at,\n"
            "  avatar_config = COALESCE(EXCLUDED.avatar_config, public.profiles.avatar_config)"
        ),
    ))
    print(copy_block(
        "public.posts",
        ["id", "user_id", "content", "image_url", "created_at", "updated_at",
         "background_style"],
        t("posts"),
        not_null=("content",),
    ))
    print(copy_block(
        "public.comments",
        ["id", "user_id", "post_id", "content", "created_at"],
        t("comments"),
        not_null=("content",),
    ))

    # Staré lajky boli jedno srdiečko. V novej schéme je to reakcia „To je super".
    likes = t("likes")
    print(copy_block(
        "public.likes", ["id", "user_id", "post_id", "created_at", "kind"], likes,
        transform=lambda r: [q(r["id"]), q(r["user_id"]), q(r["post_id"]),
                             q(r["created_at"]), "'super'"],
    ))

    # Konverzácie, ktoré už bežia, sú prijaté. Nikto nebude musieť žiadať
    # o povolenie písať kamarátovi, s ktorým si píše od januára.
    print(copy_block(
        "public.conversations",
        ["id", "participant_1", "participant_2", "created_at", "updated_at",
         "status", "initiator_id"],
        t("conversations"),
        transform=lambda r: [q(r["id"]), q(r["participant_1"]), q(r["participant_2"]),
                             q(r["created_at"]), q(r["updated_at"]),
                             "'accepted'", q(r["participant_1"])],
    ))
    print(copy_block(
        "public.messages",
        ["id", "conversation_id", "sender_id", "content", "read", "created_at"],
        t("messages"),
        not_null=("content",),
    ))
    print(copy_block(
        "public.groups",
        ["id", "name", "description", "avatar_url", "owner_id", "is_private",
         "created_at", "updated_at"],
        t("groups"),
        not_null=("name",),
    ))
    print(copy_block(
        "public.group_members", ["id", "group_id", "user_id", "role", "joined_at"],
        t("group_members"),
    ))
    print(copy_block(
        "public.group_messages", ["id", "group_id", "sender_id", "content", "created_at"],
        t("group_messages"),
    ))
    print(copy_block(
        "public.friendships",
        ["id", "requester_id", "addressee_id", "status", "created_at"],
        t("friendships"),
        not_null=("status",),
    ))
    print(copy_block(
        "public.user_roles", ["id", "user_id", "role", "activated_at"],
        t("user_roles"),
        transform=lambda r: [q(r["id"]), q(r["user_id"]),
                             q(r["role"]) + "::public.app_role", q(r["activated_at"])],
    ))
    print(copy_block(
        "public.user_stats",
        ["user_id", "posts_count", "likes_received", "likes_given", "comments_count",
         "friends_count", "messages_sent", "total_points", "updated_at"],
        t("user_stats"),
    ))
    print(copy_block(
        "public.user_game_stats",
        ["user_id", "snake_best", "tower_defense_best", "memory_best", "clicker_best",
         "updated_at"],
        t("user_game_stats"),
    ))

    # Odznaky sa prepájajú cez názov: migrácie ich zakladajú s novými id.
    ach_names = {r["id"]: r["name"] for r in t("achievements")}
    ua = [r for r in t("user_achievements") if r["achievement_id"] in ach_names]
    if ua:
        print("-- Získané odznaky. Staré achievement_id v novej databáze nie sú —")
        print("-- migrácie ich zakladajú s novými id — tak sa párujú cez názov.")
        print("INSERT INTO public.user_achievements (id, user_id, achievement_id, unlocked_at)")
        print("SELECT v.id, v.user_id, a.id, v.unlocked_at")
        print("FROM (VALUES")
        print(",\n".join(
            f"  ({q(r['id'])}::uuid, {q(r['user_id'])}::uuid, "
            f"{q(ach_names[r['achievement_id']])}, {q(r['unlocked_at'])}::timestamptz)"
            for r in ua
        ))
        print(") AS v(id, user_id, ach_name, unlocked_at)")
        print("JOIN public.achievements a ON a.name = v.ach_name")
        print("ON CONFLICT DO NOTHING;\n")

    print("-- 4. Triggery späť.")
    for tbl in trigger_tables:
        print(f"ALTER TABLE {tbl} ENABLE TRIGGER USER;")
    print()
    print("""-- Oznámenia sa nepreniesli zámerne — boli by to staré veci s dnešným
-- dátumom. Toto je poistka, keby nejaké predsa vznikli.
DELETE FROM public.notifications;
""")

    print("-- 5. Kontrola. Keď niektorý riadok nesedí, COMMIT nedávaj a napíš.")
    checks = [
        ("účty", "SELECT count(*) FROM auth.users", len(users)),
        ("účty s prázdnym tokenom (prihlásenie by padlo)",
         "SELECT count(*) FROM auth.users WHERE confirmation_token IS NULL "
         "OR recovery_token IS NULL OR email_change_token_new IS NULL "
         "OR email_change IS NULL", 0),
        ("profily", "SELECT count(*) FROM public.profiles", len(profiles)),
        ("príspevky", "SELECT count(*) FROM public.posts", len(t("posts"))),
        ("komentáre", "SELECT count(*) FROM public.comments", len(t("comments"))),
        ("reakcie", "SELECT count(*) FROM public.likes", len(likes)),
        ("konverzácie", "SELECT count(*) FROM public.conversations", len(t("conversations"))),
        ("správy", "SELECT count(*) FROM public.messages", len(t("messages"))),
        ("skupinové správy", "SELECT count(*) FROM public.group_messages", len(t("group_messages"))),
        ("priateľstvá", "SELECT count(*) FROM public.friendships", len(t("friendships"))),
        ("role", "SELECT count(*) FROM public.user_roles", len(t("user_roles"))),
        ("získané odznaky", "SELECT count(*) FROM public.user_achievements", len(ua)),
    ]
    print("SELECT * FROM (VALUES")
    print(",\n".join(
        f"  ({q(name)}, ({sql}), {want})" for name, sql, want in checks
    ))
    print(") AS kontrola(co, je, ma_byt)")
    print("WHERE je <> ma_byt;")
    print()
    print("-- Prázdny výsledok znamená, že sedí všetko.")
    print()
    print("COMMIT;")


if __name__ == "__main__":
    main()
