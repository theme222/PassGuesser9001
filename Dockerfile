FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /app

# Configure system timezone to GMT+7 (Asia/Bangkok) and install cron
ENV TZ=Asia/Bangkok
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone && \
    apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends tzdata cron util-linux && \
    dpkg-reconfigure -f noninteractive tzdata && \
    rm -rf /var/lib/apt/lists/*

# Install project dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy .env file and validate required keys at build time (build fails if missing or invalid)
COPY .env /app/.env
RUN if [ ! -f /app/.env ]; then \
      echo "BUILD FAILED: .env file is missing." >&2; \
      exit 1; \
    fi && \
    if ! grep -E -q '^[[:space:]]*STUDENT_ID[[:space:]]*=' /app/.env; then \
      echo "BUILD FAILED: STUDENT_ID is missing from .env." >&2; \
      exit 1; \
    fi && \
    if ! grep -E -q '^[[:space:]]*STUDENT_PASSWORD[[:space:]]*=' /app/.env; then \
      echo "BUILD FAILED: STUDENT_PASSWORD is missing from .env." >&2; \
      exit 1; \
    fi && \
    SID=$(grep -E '^[[:space:]]*STUDENT_ID[[:space:]]*=' /app/.env | head -n1 | cut -d'=' -f2- | tr -d '[:space:]' | tr -d '"'"'") && \
    SPW=$(grep -E '^[[:space:]]*STUDENT_PASSWORD[[:space:]]*=' /app/.env | head -n1 | cut -d'=' -f2- | tr -d '[:space:]' | tr -d '"'"'") && \
    if [ -z "$SID" ] || [ -z "$SPW" ]; then \
      echo "BUILD FAILED: STUDENT_ID or STUDENT_PASSWORD in .env cannot be empty." >&2; \
      exit 1; \
    fi

# Copy TypeScript configuration and source files
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript to dist
RUN npm run build

# Copy words directory and logs.txt
COPY words ./words
COPY logs.txt ./

# Setup runner scripts and cron schedule
COPY cron-runner.sh entrypoint.sh ./
RUN chmod +x /app/cron-runner.sh /app/entrypoint.sh && \
    echo "* * * * * root /bin/bash /app/cron-runner.sh >> /var/log/cron.log 2>&1" > /etc/cron.d/passguesser && \
    chmod 0644 /etc/cron.d/passguesser && \
    touch /var/log/cron.log

ENTRYPOINT ["/app/entrypoint.sh"]
