#!/bin/sh
# One database per service. Synapse requires C collation.
set -e
for db in synapse whatsapp signal discord; do
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres <<SQL
CREATE DATABASE $db ENCODING 'UTF8' LC_COLLATE='C' LC_CTYPE='C' TEMPLATE=template0 OWNER $POSTGRES_USER;
SQL
done
