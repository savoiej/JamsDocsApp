#!/usr/bin/env bash
# Runs Netline against a stand-in Supabase (no network needed): saves a client, loads the
# example network, then opens a second window as a basic user and checks it sees the data.
set -euo pipefail
cd "$(dirname "$0")/.."
printf 'import { createBridge } from "@/lib/jams-bridge";\n(window as unknown as { createBridge: typeof createBridge }).createBridge = createBridge;\n' > tests/.entry.ts
npx --yes esbuild@0.25.10 tests/.entry.ts --bundle --format=iife --outfile=tests/.bridge.js --alias:@=. \
  --define:process.env.NEXT_PUBLIC_SUPABASE_URL='"https://kcrcwktyqpzpxkmqunok.supabase.co"' \
  --define:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='"test"' --log-level=warning
python3 tests/bridge_offline.py
rm -f tests/.entry.ts tests/.bridge.js
