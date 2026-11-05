# StoryFlow Blender MCP server — headless Blender, closed tool surface (constitution IV).
# Blender comes from Debian's pinned package (research.md R6): reproducible, checksummed by apt.
# Blender 4.x initialises its GPU module even with -b, so Mesa's software EGL (llvmpipe) is installed.
FROM debian:trixie-20261027-slim@sha256:f6b08b09a05725f9431502d3b5714f5c4576e82c1a84fa1debe0c24a7e0c3ec4

ARG BLENDER_DEB_VERSION=4.3.2+dfsg-2

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    BLENDER_BIN=/usr/bin/blender \
    BLENDER_FONTS_DIR=/opt/fonts \
    EGL_PLATFORM=surfaceless \
    LIBGL_ALWAYS_SOFTWARE=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      blender=${BLENDER_DEB_VERSION} \
      python3 python3-venv ca-certificates \
      libegl1 libegl-mesa0 libgl1 libgl1-mesa-dri libglx-mesa0 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN python3 -m venv /opt/venv \
 && /opt/venv/bin/pip install --no-cache-dir --require-virtualenv -r requirements.txt

COPY fonts/ /opt/fonts/
COPY server/ /app/server/

RUN useradd --create-home --uid 10001 blender
USER blender

EXPOSE 8000
CMD ["/opt/venv/bin/python", "-m", "server.app"]
