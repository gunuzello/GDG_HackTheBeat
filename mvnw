#!/bin/sh

set -e

BASE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
WRAPPER_JAR="$BASE_DIR/.mvn/wrapper/maven-wrapper.jar"

if [ ! -f "$WRAPPER_JAR" ]; then
  echo "Missing $WRAPPER_JAR" >&2
  exit 1
fi

exec java -classpath "$WRAPPER_JAR" \
  -Dmaven.multiModuleProjectDirectory="$BASE_DIR" \
  org.apache.maven.wrapper.MavenWrapperMain "$@"
