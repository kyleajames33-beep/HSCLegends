// Browser-compatible adapter for the isolated lab contract. The caller supplies
// a transport that authenticates requests and resolves to {data, error}; this
// module never manufactures or accepts a user identity. Not used by the app.
const invalid = () => { throw new Error('Invalid game response'); };
const id = value => typeof value === 'string' && value.length > 0 ? value : invalid();
const round = value => Number.isSafeInteger(value) && value > 0 ? value : invalid();
const nonnegative = value => Number.isSafeInteger(value) && value >= 0 ? value : invalid();
const decision = value => value === 'share' || value === 'steal' ? value : invalid();
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : invalid();
function answer(value) {
  const a=object(value);
  if(typeof a.correct !== 'boolean') invalid();
  return {choice:nonnegative(a.choice),correct:a.correct,stake:nonnegative(a.stake)};
}
function result(value) {
  const r=object(value);
  return {player_a:id(r.player_a),player_b:id(r.player_b),decision_a:decision(r.decision_a),decision_b:decision(r.decision_b),payout_a:nonnegative(r.payout_a),payout_b:nonnegative(r.payout_b)};
}
function snapshot(value) {
  const s=object(value);
  if(!['answer','decide','finished'].includes(s.phase) || typeof s.deadline !== 'string' || Number.isNaN(Date.parse(s.deadline))) invalid();
  let q=null;
  if(s.question !== null) {
    const raw=object(s.question);
    if(typeof raw.stem !== 'string' || !Array.isArray(raw.options) || raw.options.length < 2 || !raw.options.every(o=>typeof o==='string')) invalid();
    q={stem:raw.stem,options:[...raw.options]};
  }
  return {round:round(s.round),phase:s.phase,deadline:s.deadline,question:q,own_answer:s.own_answer===null?null:answer(s.own_answer),own_decision:s.own_decision===null?null:decision(s.own_decision),result:s.result===null?null:result(s.result)};
}
export function createGambleClient(transport) {
  if(typeof transport !== 'function') throw new TypeError('A transport function is required');
  const call=async(name,args)=>{
    const response=await transport(name,args);
    if(!response || response.error) throw new Error(response?.error?.message || 'Game request failed');
    return response.data;
  };
  const base=(room,player)=>({p_room:id(room),p_player:id(player)});
  return Object.freeze({
    async snapshot(room,player) { return snapshot(await call('snapshot',base(room,player))); },
    async submit(room,player,currentRound,choice) {
      const rows=await call('submit',{...base(room,player),p_round:round(currentRound),p_choice:nonnegative(choice)});
      if(!Array.isArray(rows)||rows.length!==1) invalid();
      return answer(rows[0]);
    },
    async decide(room,player,currentRound,choice) {
      return decision(await call('decide',{...base(room,player),p_round:round(currentRound),p_choice:decision(choice)}));
    },
    async reveal(room,player,currentRound) {
      const rows=await call('reveal',{...base(room,player),p_round:round(currentRound)});
      if(!Array.isArray(rows)||rows.length!==1) invalid();
      // The SQL reveal returns only choices and payouts; pair IDs come from a
      // later authorized snapshot. Avoid inventing opponent identifiers here.
      const r=object(rows[0]);
      return {decision_a:decision(r.decision_a),decision_b:decision(r.decision_b),payout_a:nonnegative(r.payout_a),payout_b:nonnegative(r.payout_b)};
    },
  });
}
