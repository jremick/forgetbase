#!/bin/sh
set -eu
# First boot waits for the isolated freshclam writer to install verified data.
while ! test -f /var/lib/clamav/daily.cvd && ! test -f /var/lib/clamav/daily.cld; do sleep 5; done
exec /usr/sbin/clamd --foreground=true --config-file=/etc/clamav/clamd.conf
