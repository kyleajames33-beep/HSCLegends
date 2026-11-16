// Isolated client adapter for the synthetic contract; not imported by the app.
export function validateSnapshot(value, expectedRoom) {
  const validInt = n => Number.isSafeInteger(n) && n >= 0;
  if (!value || value.schema_version !== 1 || value.session_id !== expectedRoom || !validInt(value.session_version) || !validInt(value.score) || !['lobby','active','complete'].includes(value.state)) throw new Error('INVALID_SNAPSHOT');
  const q=value.question, r=value.own_receipt;
  if (q !== null) {
    if (!q || typeof q.instance_id !== 'string' || !validInt(q.index) || typeof q.stem !== 'string' || !Array.isArray(q.options) || q.options.length < 2 || !q.options.every(x=>typeof x === 'string')) throw new Error('INVALID_SNAPSHOT');
  }
  if (r !== null) {
    if (!q || !r || typeof r.receipt_id !== 'string' || r.question_instance_id !== q.instance_id || !validInt(r.accepted_choice) || r.accepted_choice >= q.options.length || !validInt(r.correct_index) || r.correct_index >= q.options.length || typeof r.is_correct !== 'boolean' || r.is_correct !== (r.accepted_choice === r.correct_index) || !validInt(r.awarded_points) || !validInt(r.accepted_ms)) throw new Error('INVALID_RECEIPT');
  }
  return value;
}
export function createRecoveryController(fetchSnapshot, onSnapshot) {
  let generation=0, connection=null, newest=0;
  return {
    bind(roomId,playerId,credential) { generation++; connection={roomId,playerId,credential}; newest=0; },
    dispose() { generation++; connection=null; },
    async refresh() {
      if (!connection) throw new Error('NO_CONNECTION');
      const original=connection, owner=generation, request=++newest;
      try {
        const snapshot=await fetchSnapshot(original.roomId,original.playerId,original.credential);
        if (owner !== generation || request !== newest || original !== connection) return false;
        onSnapshot(validateSnapshot(snapshot,original.roomId));
        return true;
      } catch (e) {
        if (owner !== generation || request !== newest || original !== connection) return false;
        throw e;
      }
    },
  };
}
