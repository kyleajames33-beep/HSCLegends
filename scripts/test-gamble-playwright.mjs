#!/usr/bin/env node
// Retired unsafe integration entrypoint. Original preserved in Git history.
// A local URL cannot prove a browser build or proxy avoids production.
import { refuseLegacyNetworkTest } from './test-support/refuse-legacy-network.mjs';
refuseLegacyNetworkTest();
