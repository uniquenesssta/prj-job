#!/bin/sh
cd "$(dirname "$0")" || exit 1

echo "Starting Studio Task Hub on port 3000..."
echo

if command -v node >/dev/null 2>&1; then
  node server-v2.js
else
  echo "Node.js was not found. Please install Node.js first:"
  echo "https://nodejs.org/"
fi

echo
echo "Server stopped. If there is an error above, send the text to Codex."
printf "Press Enter to close..."
read answer
