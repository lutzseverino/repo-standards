# Match .node-version and package.json for contributor commands.
FROM node:24.11.1-bookworm

RUN npm install --global pnpm@11.20.0

RUN apt-get update \
    && apt-get install --yes --no-install-recommends python3 \
    && rm -rf /var/lib/apt/lists/*

# The site's browser-backed tests find Chromium as `chromium` on PATH. The
# command is Debian's launcher script for /usr/lib/chromium/chromium, so check
# that binary's libraries, then that the browser starts far enough to report
# its version.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends chromium \
    && rm -rf /var/lib/apt/lists/* \
    && if ldd /usr/lib/chromium/chromium | grep 'not found'; then exit 1; fi \
    && chromium --version
