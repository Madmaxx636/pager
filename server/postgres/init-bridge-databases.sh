#!/bin/sh
# The encrypted bridge database holds one database per bridge (Synapse's own stays in the main one).
set -e
for db in whatsapp signal discord gmessages instagram messenger telegram slack twitter bluesky linkedin; do
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres <<SQL
CREATE DATABASE $db ENCODING 'UTF8' LC_COLLATE='C' LC_CTYPE='C' TEMPLATE=template0 OWNER $POSTGRES_USER;
SQL
done
