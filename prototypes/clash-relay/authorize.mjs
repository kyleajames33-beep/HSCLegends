const MATCH_STATES = new Set(['lobby', 'active', 'complete']);

/** Verify the caller's seat with the same Supabase RPCs used by the game UI. */
export function createSeatAuthorizer({ url, publicKey }) {
  return async ({ roomId, playerId, accessToken }) => {
    const name = playerId ? 'clash_me' : 'clash_host_view';
    const args = playerId ? { p_room: roomId, p_player: playerId } : { p_room: roomId };
    const response = await fetch(new URL(`/rest/v1/rpc/${name}`, url), {
      method: 'POST',
      headers: {
        apikey: publicKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
      redirect: 'error',
      signal: AbortSignal.timeout(4000),
    });
    if (response.status === 429 || response.status >= 500) throw Error('Seat verification unavailable');
    if (!response.ok) return null;
    const view = await response.json();
    if (!MATCH_STATES.has(view?.state)) return null;
    if (playerId ? typeof view.token !== 'string' || !view.token : view.room_id !== roomId) return null;

    // This claim is used only after the backend has accepted the signed token.
    const { exp } = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url'));
    if (!Number.isSafeInteger(exp) || exp <= Date.now() / 1000) return null;
    return { expiresAt: exp * 1000, playerToken: playerId ? view.token : null };
  };
}
