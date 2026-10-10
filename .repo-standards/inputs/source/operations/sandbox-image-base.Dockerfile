# The factory's sandbox image base, which Repo Canon ships. Keep these lines
# unchanged at the top of .sandcastle/Dockerfile and add the repository's
# toolchain after them.
FROM node:24-bookworm

RUN apt-get update && apt-get install -y \
  git \
  curl \
  jq \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
  && apt-get update && apt-get install -y gh \
  && rm -rf /var/lib/apt/lists/*

RUN npm install --global @openai/codex

# The factory builds the image with the host user's IDs, so files in the
# bind-mounted worktree keep their owner. Sandcastle requires the agent user.
ARG AGENT_UID=1000
ARG AGENT_GID=1000
RUN groupmod -o -g $AGENT_GID node \
  && usermod -o -u $AGENT_UID -g $AGENT_GID -d /home/agent -m -l agent node
USER ${AGENT_UID}:${AGENT_GID}

RUN curl -fsSL https://claude.ai/install.sh | bash
ENV PATH="/home/agent/.local/bin:$PATH"

WORKDIR /home/agent

# Sandcastle mounts the run's worktree and starts the agent in it.
ENTRYPOINT ["sleep", "infinity"]

# The repository's toolchain follows.
