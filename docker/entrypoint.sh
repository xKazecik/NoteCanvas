#!/bin/sh
# Entrypoint for the combined image: renders the nginx config, then runs nginx
# and the backend side by side. Whichever one exits first takes the container
# down, so the restart policy in compose can do its job instead of the container
# limping along serving 502s.
set -e

# nginx proxies /api and /socket.io to the backend. In this image the backend is
# a sibling process, so the default target is loopback rather than a service
# name; kept overridable for the odd split deployment.
export BACKEND_URL="${BACKEND_URL:-127.0.0.1:8000}"

echo "Configuring nginx with BACKEND_URL: ${BACKEND_URL}"

# Replace only our custom placeholder and preserve nginx runtime vars like $http_upgrade
ESCAPED_BACKEND_URL=$(printf '%s\n' "$BACKEND_URL" | sed 's/[\/&]/\&/g')
sed "s/__BACKEND_URL__/${ESCAPED_BACKEND_URL}/g" /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

echo "Validating nginx configuration..."
if ! nginx -t -c /etc/nginx/nginx.conf; then
    echo "ERROR: nginx configuration validation failed" >&2
    exit 1
fi

backend_pid=""
nginx_pid=""

stop_children() {
    [ -n "$backend_pid" ] && kill -TERM "$backend_pid" 2>/dev/null
    [ -n "$nginx_pid" ] && kill -TERM "$nginx_pid" 2>/dev/null
    wait
    return 0
}

on_signal() {
    trap - TERM INT
    echo "Shutting down..."
    stop_children
    exit 0
}
trap on_signal TERM INT

# The stock backend entrypoint exec's node as its last step, so $! is the node
# process itself and a TERM here reaches node's graceful shutdown.
/app/docker-entrypoint.sh &
backend_pid=$!

nginx -g 'daemon off;' -c /etc/nginx/nginx.conf &
nginx_pid=$!

# busybox ash has no `wait -n`, so poll for whichever process goes first.
while kill -0 "$backend_pid" 2>/dev/null && kill -0 "$nginx_pid" 2>/dev/null; do
    sleep 2
done

kill -0 "$backend_pid" 2>/dev/null || echo "ERROR: backend process exited" >&2
kill -0 "$nginx_pid" 2>/dev/null || echo "ERROR: nginx process exited" >&2

stop_children
exit 1
