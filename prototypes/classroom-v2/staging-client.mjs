// Isolated staging adapter. Caller supplies authenticated RPC transport; no
// actor, credential, sign-in or network operation is created here. Application
// auth changes MUST call dispose() before a different owner can use it.
import { createLabClient } from './client.ts';
const validId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const version = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const one = data => { if (!Array.isArray(data) || data.length !== 1 || !data[0] || typeof data[0] !== 'object') throw new Error('INVALID_SERVER_RESPONSE'); return data[0]; };
const date = value => { const parsed=value instanceof Date?value:typeof value==='string'?new Date(value):null;if(!parsed||Number.isNaN(parsed.getTime()))throw new Error('INVALID_SERVER_RESPONSE');return parsed.toISOString(); };
export function createStagingClient(rpc) {
  const game=createLabClient(async (sql, values) => {
    let result;
    if (sql === 'select * from lab_api.snapshot($1::uuid,$2::uuid)' && values.length === 2) {
      result = await rpc('classroom_v2_snapshot', { p_room: values[0], p_player: values[1] });
    } else if (sql === 'select * from lab_api.answer($1::uuid,$2::uuid,$3::uuid,$4::smallint)' && values.length === 4) {
      result = await rpc('classroom_v2_answer', { p_room: values[0], p_player: values[1], p_question: values[2], p_choice: values[3] });
    } else throw new Error('UNSUPPORTED_LAB_OPERATION');
    if (result.error) throw new Error(result.error.message);
    if (!Array.isArray(result.data)) throw new Error('INVALID_SERVER_RESPONSE');
    return { rows: result.data };
  });
  let context=0, latestHostRead=0, latestEntry=0, latestCommand=0, hostVersion=-1, hostRoom=null;
  async function invoke(name,args,parse,current=()=>true) {
    const owner=context;
    try {
      const result=await rpc(name,args);
      if(owner!==context || !current()) return null;
      if(result.error) throw new Error(result.error.message);
      return parse(result.data);
    } catch(error) { if(owner!==context || !current())return null;throw error; }
  }
  function command(name,roomId,expectedVersion) {
    if(!validId(roomId)||!version(expectedVersion))throw new Error('INVALID_ARGUMENT');
    const request=++latestCommand;
    return invoke(name,{p_room:roomId,p_expected_version:expectedVersion},data=>{
      if(typeof data!=='boolean')throw new Error('INVALID_SERVER_RESPONSE');return data;
    },()=>request===latestCommand);
  }
  return {
    bind(roomId,playerId) { context++;latestHostRead=0;latestEntry=0;latestCommand=0;hostVersion=-1;hostRoom=null;game.bind(roomId,playerId); },
    dispose() { context++;latestHostRead=0;latestEntry=0;latestCommand=0;hostVersion=-1;hostRoom=null;game.dispose(); },
    snapshot:game.snapshot,
    answer:game.answer,
    createRoom(requestId,questions,seconds) {
      if(!validId(requestId)||!Array.isArray(questions)||!Number.isInteger(seconds)||seconds<5||seconds>120)throw new Error('INVALID_ARGUMENT');
      const request=++latestEntry;
      return invoke('classroom_v2_create',{p_request_id:requestId,p_questions:questions,p_seconds:seconds},data=>{
        const result=one(data);if(!validId(result.room_id)||!validId(result.join_code)||!version(result.room_version))throw new Error('INVALID_SERVER_RESPONSE');
        return {roomId:result.room_id,joinCode:result.join_code,version:result.room_version};
      },()=>request===latestEntry);
    },
    join(joinCode,alias) {
      if(!validId(joinCode)||typeof alias!=='string'||!alias.trim()||alias.trim().length>40)throw new Error('INVALID_ARGUMENT');
      const request=++latestEntry;
      return invoke('classroom_v2_join',{p_join_code:joinCode,p_alias:alias},data=>{
        const result=one(data);if(!validId(result.room_id)||!validId(result.player_id)||!['lobby','active','complete'].includes(result.state))throw new Error('INVALID_SERVER_RESPONSE');
        return {roomId:result.room_id,playerId:result.player_id,state:result.state};
      },()=>request===latestEntry);
    },
    hostSnapshot(roomId) {
      if(!validId(roomId))throw new Error('INVALID_ARGUMENT');
      if(hostRoom!==roomId){hostRoom=roomId;hostVersion=-1;}
      const read=++latestHostRead;
      return invoke('classroom_v2_host_snapshot',{p_room:roomId},data=>{
        const r=one(data);
        if(r.room_id!==roomId||!version(r.room_version)||!['lobby','active','complete'].includes(r.state)||!version(r.question_total)||!version(r.answered)||!Array.isArray(r.players)||!r.players.every(p=>p&&typeof p.alias==='string'&&version(p.score)))throw new Error('INVALID_SERVER_RESPONSE');
        if(r.question_index!==null&&!version(r.question_index))throw new Error('INVALID_SERVER_RESPONSE');
        if(r.stem!==null&&typeof r.stem!=='string')throw new Error('INVALID_SERVER_RESPONSE');
        if(r.options!==null&&(!Array.isArray(r.options)||!r.options.every(option=>typeof option==='string')))throw new Error('INVALID_SERVER_RESPONSE');
        if(r.answered>r.players.length)throw new Error('INVALID_SERVER_RESPONSE');
        if(r.state==='active'&&(r.question_index===null||r.stem===null||r.options===null||r.opens_at===null||r.closes_at===null))throw new Error('INVALID_SERVER_RESPONSE');
        if(r.room_version<hostVersion)return null;
        hostVersion=r.room_version;
        return {roomId,version:r.room_version,state:r.state,questionIndex:r.question_index,questionTotal:r.question_total,stem:r.stem,options:r.options,opensAt:r.opens_at===null?null:date(r.opens_at),closesAt:r.closes_at===null?null:date(r.closes_at),serverNow:date(r.server_now),answered:r.answered,players:r.players.map(p=>({alias:p.alias,score:p.score}))};
      },()=>read===latestHostRead);
    },
    start:(roomId,expectedVersion)=>command('classroom_v2_start',roomId,expectedVersion),
    next:(roomId,expectedVersion)=>command('classroom_v2_next',roomId,expectedVersion),
    finish:(roomId,expectedVersion)=>command('classroom_v2_finish',roomId,expectedVersion),
  };
}
