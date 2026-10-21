#!/bin/sh
set -eu
cp /opt/exp/default.conf /etc/nginx/conf.d/default.conf
exec "$@"
