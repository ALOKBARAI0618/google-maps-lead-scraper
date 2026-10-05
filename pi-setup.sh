#!/usr/bin/env bash
# One-time Pi setup. Run this once on the Raspberry Pi before the first deploy.
#
# Creates the host-side state files so the volume mounts have something real to
# bind to - docker will create a *directory* for a missing mount target, which
# would make campaign-state.json unreadable and crash the resume path.
set -euo pipefail

echo "Creating host state directories..."
mkdir -p data output

# campaign-state.json must be ABSENT for a first boot (its presence is what
# triggers auto-resume). Create it only if a file already exists somewhere to
# restore from; otherwise leave it missing and the server starts idle.
if [ ! -f data/campaign-state.json ]; then
    echo "  no prior campaign-state.json - server will start idle (correct for first boot)"
else
    echo "  found existing campaign-state.json - it will be resumed"
fi

# These three must exist as files (not directories) or the bind mount fails.
for f in campaign-progress.json leads.db; do
    if [ ! -f "data/$f" ]; then
        touch "data/$f"
        echo "  created empty data/$f"
    else
        echo "  data/$f already present, keeping it"
    fi
done

# Copy any progress from the PC if you migrated it over.
if [ -f ../campaign-progress.json ] && [ ! -s data/campaign-progress.json ]; then
    cp ../campaign-progress.json data/campaign-progress.json
    echo "  imported campaign-progress.json from parent directory"
fi

echo ""
echo "Secret: place your Google service-account JSON at ./gsheet-key.json"
if [ ! -f gsheet-key.json ]; then
    echo "  (not found yet - Jenkins pre-flight will fail until you add it)"
else
    echo "  present"
fi

echo ""
echo "Verifying Chromium installed for arm64..."
docker run --rm maps-lead-scraper:latest \
    node -e "const {chromium}=require('playwright');console.log('playwright present')" \
    && echo "  image OK" || echo "  build the image first: docker compose build"

echo ""
echo "Done. Deploy with: docker compose up -d"
echo "Then open http://<pi-ip>:3000"
