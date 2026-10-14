# Match .node-version and package.json for contributor commands.
FROM node:24.11.1-bookworm

RUN npm install --global pnpm@11.20.0

RUN apt-get update \
    && apt-get install --yes --no-install-recommends python3 \
    && rm -rf /var/lib/apt/lists/*
