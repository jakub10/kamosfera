#!/bin/bash
# Zlepí všetky migrácie do jedného súboru, ktorý sa dá vložiť do SQL editora
# Supabase. Kto nemá terminál ani Supabase CLI, postaví databázu jedným
# vložením namiesto `supabase db push`.
#
#   bash scripts/schema_do_jedneho_suboru.sh > 1-schema.sql
set -e
cd "$(dirname "$0")/.."
echo "-- Kompletná schéma Kamosféry — všetky migrácie v jednom súbore."
echo "-- Vlož CELÉ do SQL editora nového Supabase projektu a spusti."
echo ""
for f in supabase/migrations/*.sql; do
  echo ""
  echo "-- ==================================================================="
  echo "-- $(basename "$f")"
  echo "-- ==================================================================="
  cat "$f"
  echo ""
done
