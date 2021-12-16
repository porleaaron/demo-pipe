#!/bin/sh

npm run build

cdk deploy '*' \
  -a "npx ts-node bin/deploy.ts" \
  -c env=prod
