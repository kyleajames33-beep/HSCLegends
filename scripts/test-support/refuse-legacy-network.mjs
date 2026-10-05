// Deliberately never read credentials, load .env, import browsers, or fetch.
export function refuseLegacyNetworkTest() {
  throw new Error('LEGACY_NETWORK_TEST_REFUSED: Network gameplay scripts are retired. Production, remote, and unverified local targets are refused. Run npm test for offline synthetic checks or npm run test:regressions for known failing product checks. See tests/README.md. There is no live-test override.');
}
