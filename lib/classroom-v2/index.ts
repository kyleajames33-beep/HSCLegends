/**
 * Classroom v2 contract adapter. Nothing imports this from the live routes.
 * A staging-only feature decision and a supplied authenticated transport are
 * mandatory. Server authorization remains authoritative for every operation.
 */
export type RpcName = 'classroom_v2_capabilities' | 'classroom_v2_create' | 'classroom_v2_join' | 'classroom_v2_host_snapshot' | 'classroom_v2_teacher_questions' | 'classroom_v2_snapshot' | 'classroom_v2_answer' | 'classroom_v2_start' | 'classroom_v2_next' | 'classroom_v2_finish';
export type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };
export type ClassroomTransport = { rpc: (name: RpcName, args: Record<string, unknown>) => PromiseLike<RpcResult> };
export type ClassroomConfig = { enabled?: boolean; target?: 'staging'; ownerId?: string; isCurrentOwner?: (ownerId: string) => boolean; authGeneration?: () => number };
export type TeacherDraftMetadata = Readonly<{ id: string; explanation: string; subject: string; year: 11 | 12; module: string; syllabusVersion: string; source: string; reviewStatus: 'unreviewed' }>;
export type QuestionDraft = { stem: string; options: readonly string[]; correct_index: number; content_revision: string; teacher_draft?: TeacherDraftMetadata };
export type CreateRequest = Readonly<{ requestId: string; questions: readonly QuestionDraft[]; seconds: number }>;
export type Receipt = { receiptId: string; questionId: string; choice: number; correct: boolean; correctIndex: number; points: number; scoreAfter: number };
export type Question = { id: string; index: number; stem: string; options: string[]; contentRevision: string; opensAt: string; closesAt: string };
export type StudentReview = { id:string; index:number; stem:string; options:string[]; choice:number; correctIndex:number; correct:boolean; points:number; explanation:string|null };
export type StudentSnapshot = { roomId: string; version: number; state: 'lobby' | 'active' | 'complete'; serverNow: string; question: Question | null; questionTotal: number | null; finalRank: number | null; score: number; receipt: Receipt | null; explanation: string | null; review:StudentReview[]|null };
export type QuestionReport = { index: number; stem: string; opened: boolean; responses: number; correct: number };
export type HostSnapshot = { roomId: string; version: number; state: 'lobby' | 'active' | 'complete'; questionIndex: number | null; questionTotal: number; stem: string | null; options: string[] | null; opensAt: string | null; closesAt: string | null; serverNow: string; answered: number; players: { alias: string; score: number }[]; joinCode: string | null; questionReport: QuestionReport[] | null };
export type TeacherQuestion = { id: string; index: number; stem: string; options: readonly string[]; correctIndex: number; contentRevision: string; teacherDraft: TeacherDraftMetadata | null };
type Row = Record<string, unknown>;
const isRow = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
const isId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const isInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isState = (value: unknown): value is StudentSnapshot['state'] => value === 'lobby' || value === 'active' || value === 'complete';
const OBSOLETE = Symbol('obsolete request');
const fail = (code: string): never => { throw new Error(code); };
const single = (data: unknown): Row => Array.isArray(data) && data.length === 1 && isRow(data[0]) ? data[0] : fail('INVALID_RESPONSE');
const int = (value: unknown): number => isInteger(value) ? value : fail('INVALID_RESPONSE');
const date = (value: unknown): string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return fail('INVALID_RESPONSE');
  const parsed = new Date(value); return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : fail('INVALID_RESPONSE');
};
const options = (value: unknown): string[] => Array.isArray(value) && value.length >= 2 && value.length <= 6 && value.every((x) => typeof x === 'string' && x.length > 0 && x.length <= 256) ? [...value] : fail('INVALID_RESPONSE');
function parseReceipt(row: Row, qid: string, scoreAfter: unknown, count: number): Receipt {
  if (!isId(row.receipt_id) || !isId(qid) || !isInteger(row.accepted_choice) || row.accepted_choice >= count || !isInteger(row.correct_index) || row.correct_index >= count || typeof row.is_correct !== 'boolean' || row.is_correct !== (row.accepted_choice === row.correct_index) || !isInteger(row.points) || row.points !== (row.is_correct ? 100 : 0) || !isInteger(scoreAfter) || scoreAfter < row.points) return fail('INVALID_RECEIPT');
  return { receiptId: row.receipt_id, questionId: qid, choice: row.accepted_choice, correct: row.is_correct, correctIndex: row.correct_index, points: row.points, scoreAfter };
}
function questionProjection(row: Row, state: StudentSnapshot['state']): Question | null {
  if (row.question_id === null) {
    if (state === 'active' || [row.question_index,row.stem,row.options,row.content_revision,row.opens_at,row.closes_at].some((v) => v !== null)) return fail('INVALID_RESPONSE');
    return null;
  }
  if (state === 'lobby' || !isId(row.question_id) || !isInteger(row.question_index) || typeof row.stem !== 'string' || !row.stem.length || row.stem.length > 1024 || typeof row.content_revision !== 'string' || !row.content_revision.length || row.content_revision.length > 100) return fail('INVALID_RESPONSE');
  const opensAt = date(row.opens_at), closesAt = date(row.closes_at);
  if (Date.parse(opensAt) >= Date.parse(closesAt)) return fail('INVALID_RESPONSE');
  return { id: row.question_id, index: row.question_index, stem: row.stem, options: options(row.options), contentRevision: row.content_revision, opensAt, closesAt };
}
function parseStudent(data: unknown, room: string): StudentSnapshot {
  const row = single(data);
  if (row.room_id !== room || !isState(row.state)) return fail('INVALID_RESPONSE');
  const currentVersion = int(row.room_version), score = int(row.score), serverNow = date(row.server_now);
  const question = questionProjection(row,row.state);
  const questionTotal = row.question_total === undefined ? null : int(row.question_total);
  if (questionTotal !== null && (questionTotal < 1 || questionTotal > 20 || (question && question.index >= questionTotal))) return fail('INVALID_RESPONSE');
  const suppliedRank = row.final_rank == null ? null : int(row.final_rank);
  if (suppliedRank !== null && (row.state !== 'complete' || suppliedRank < 1)) return fail('INVALID_RESPONSE');
  // Older staging candidates gave a first place to every player when a lobby
  // was ended before a question opened. Do not display that as a result.
  const finalRank = question ? suppliedRank : null;
  let receipt: Receipt | null = null;
  if (row.receipt_id === null) {
    if ([row.accepted_choice,row.is_correct,row.correct_index,row.points,row.receipt_score_after].some((v) => v !== null)) return fail('INVALID_RECEIPT');
  } else {
    if (!question) return fail('INVALID_RECEIPT');
    receipt = parseReceipt(row,question.id,row.receipt_score_after,question.options.length);
    if (receipt.scoreAfter > score) return fail('INVALID_RECEIPT');
  }
  // Older staged candidates omit this optional field. Never expose an
  // explanation without a valid own receipt, even from a malformed endpoint.
  const explanation = row.answer_explanation ?? null;
  if (explanation !== null && (!receipt || typeof explanation !== 'string' || !explanation.trim() || explanation.length > 2000)) return fail('INVALID_RESPONSE');
  let review:StudentReview[]|null=null;
  if(row.answer_review!=null){
    if(row.state!=='complete'||!Array.isArray(row.answer_review)||row.answer_review.length>20)return fail('INVALID_RESPONSE');
    const seen=new Set<string>();let previous=-1;
    review=row.answer_review.map((item:unknown)=>{
      if(!isRow(item)||!isId(item.question_id)||seen.has(item.question_id)||!isInteger(item.index)||item.index<=previous||(questionTotal!==null&&item.index>=questionTotal)||typeof item.stem!=='string'||!item.stem.trim()||item.stem.length>1024)return fail('INVALID_RESPONSE');
      const answers=options(item.options);
      if(!isInteger(item.choice)||item.choice>=answers.length||!isInteger(item.correct_index)||item.correct_index>=answers.length||typeof item.correct!=='boolean'||item.correct!==(item.choice===item.correct_index)||item.points!==(item.correct?100:0))return fail('INVALID_RESPONSE');
      if(item.explanation!==null&&(typeof item.explanation!=='string'||!item.explanation.trim()||item.explanation.length>2000))return fail('INVALID_RESPONSE');
      seen.add(item.question_id);previous=item.index;
      return {id:item.question_id,index:item.index,stem:item.stem,options:answers,choice:item.choice,correctIndex:item.correct_index,correct:item.correct,points:item.points as number,explanation:item.explanation as string|null};
    });
  }
  return { roomId: room, version: currentVersion, state: row.state, serverNow, question, questionTotal, finalRank, score, receipt, explanation, review };
}
function parseHost(data: unknown, room: string): HostSnapshot {
  const row = single(data);
  if (row.room_id !== room || !isState(row.state)) return fail('INVALID_RESPONSE');
  const currentVersion = int(row.room_version), total = int(row.question_total), answered = int(row.answered), serverNow = date(row.server_now);
  const joinCode = row.join_code === undefined ? null : isId(row.join_code) ? row.join_code : fail('INVALID_RESPONSE');
  if (total < 1 || total > 20 || !Array.isArray(row.players)) return fail('INVALID_RESPONSE');
  const players = row.players.map((player: unknown) => {
    if (!isRow(player) || typeof player.alias !== 'string' || !player.alias.trim() || player.alias.length > 40 || !isInteger(player.score)) return fail('INVALID_RESPONSE');
    return { alias: player.alias, score: player.score };
  });
  let questionReport:QuestionReport[]|null=null;
  if(row.question_report!=null){
    if(row.state!=='complete'||!Array.isArray(row.question_report)||row.question_report.length!==total)return fail('INVALID_RESPONSE');
    questionReport=row.question_report.map((item:unknown,index:number)=>{
      if(!isRow(item)||item.index!==index||typeof item.stem!=='string'||!item.stem.length||item.stem.length>1024||typeof item.opened!=='boolean'||!isInteger(item.responses)||!isInteger(item.correct)||item.correct>item.responses||item.responses>players.length||(!item.opened&&item.responses!==0))return fail('INVALID_RESPONSE');
      return {index,stem:item.stem,opened:item.opened,responses:item.responses,correct:item.correct};
    });
  }
  if (answered > players.length) return fail('INVALID_RESPONSE');
  if (row.question_index === null) {
    if (row.state === 'active' || [row.stem,row.options,row.opens_at,row.closes_at].some((v) => v !== null) || answered !== 0) return fail('INVALID_RESPONSE');
    return { roomId: room, version: currentVersion, state: row.state, questionIndex: null, questionTotal: total, stem: null, options: null, opensAt: null, closesAt: null, serverNow, answered, players, joinCode, questionReport };
  }
  if (row.state === 'lobby' || !isInteger(row.question_index) || row.question_index >= total || typeof row.stem !== 'string' || !row.stem.length || row.stem.length > 1024) return fail('INVALID_RESPONSE');
  const open = date(row.opens_at), close = date(row.closes_at);
  if (Date.parse(open) >= Date.parse(close)) return fail('INVALID_RESPONSE');
  return { roomId: room, version: currentVersion, state: row.state, questionIndex: row.question_index, questionTotal: total, stem: row.stem, options: options(row.options), opensAt: open, closesAt: close, serverNow, answered, players, joinCode, questionReport };
}

/** Create an immutable replayable draft; the caller persists its own request ID if needed. */
export function prepareCreateRequest(requestId: string, questions: readonly QuestionDraft[], seconds: number): CreateRequest {
  if (!isId(requestId) || !Number.isInteger(seconds) || seconds < 5 || seconds > 120 || !Array.isArray(questions) || questions.length < 1 || questions.length > 20) return fail('INVALID_ARGUMENT');
  const copy = questions.map((q) => {
    if (!isRow(q) || typeof q.stem !== 'string' || !q.stem.length || q.stem.length > 1024 || typeof q.content_revision !== 'string' || !q.content_revision.length || q.content_revision.length > 100 || !isInteger(q.correct_index)) return fail('INVALID_ARGUMENT');
    const values = options(q.options);
    if (q.correct_index >= values.length) return fail('INVALID_ARGUMENT');
    if (Object.keys(q).some(key => !['stem','options','correct_index','content_revision','teacher_draft'].includes(key))) return fail('INVALID_ARGUMENT');
    let teacher: TeacherDraftMetadata | undefined;
    if (q.teacher_draft !== undefined) {
      const m = q.teacher_draft;
      const bounded = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
      if (!isRow(m) || Object.keys(m).length !== 8 || Object.keys(m).some(key => !['id','explanation','subject','year','module','syllabusVersion','source','reviewStatus'].includes(key)) ||
        !bounded(m.id,100) || !bounded(m.explanation,2000) || !bounded(m.module,100) || !bounded(m.syllabusVersion,100) || !bounded(m.source,200) ||
        typeof m.subject !== 'string' || !['biology','chemistry','physics','maths-standard','maths-advanced','maths-ext1'].includes(m.subject) || (m.year !== 11 && m.year !== 12) || m.reviewStatus !== 'unreviewed') return fail('INVALID_ARGUMENT');
      teacher = Object.freeze({ id:m.id, explanation:m.explanation, subject:m.subject, year:m.year, module:m.module, syllabusVersion:m.syllabusVersion, source:m.source, reviewStatus:'unreviewed' });
    }
    return Object.freeze({ stem: q.stem, options: Object.freeze(values), correct_index: q.correct_index, content_revision: q.content_revision, ...(teacher ? {teacher_draft:teacher} : {}) });
  });
  return Object.freeze({ requestId, seconds, questions: Object.freeze(copy) });
}

export type InitResult = { status: 'disabled' } | { status: 'unavailable'; reason: 'configuration' | 'transport' | 'unsupported' } | { status: 'available'; client: ClassroomClient };
/** Explicit opt-in never changes grants; no RPC is sent when disabled. */
export async function initializeClassroomV2(config: ClassroomConfig = {}, transport?: ClassroomTransport): Promise<InitResult> {
  if (config.enabled !== true) return { status: 'disabled' };
  if (config.target !== 'staging' || !isId(config.ownerId) || typeof config.isCurrentOwner !== 'function' || typeof config.authGeneration !== 'function' || !transport || typeof transport.rpc !== 'function') return { status: 'unavailable', reason: 'configuration' };
  const ownerId=config.ownerId, isCurrentOwner=config.isCurrentOwner, authGeneration=config.authGeneration;
  let generation: number;
  try { generation=authGeneration(); } catch { return { status: 'unavailable', reason: 'configuration' }; }
  if (!isInteger(generation)) return { status: 'unavailable', reason: 'configuration' };
  const ownerCurrent = () => { try { return isCurrentOwner(ownerId) === true && authGeneration() === generation; } catch { return false; } };
  if (!ownerCurrent()) return { status: 'unavailable', reason: 'configuration' };
  let teacherContentSupported = false, teacherReadbackSupported = false;
  try {
    const result = await transport.rpc('classroom_v2_capabilities', {});
    if (!ownerCurrent()) return { status: 'unavailable', reason: 'configuration' };
    if (result.error) return { status: 'unavailable', reason: 'transport' };
    const row = single(result.data);
    if (row.contract_version !== 1 || row.environment !== 'staging-only') return { status: 'unavailable', reason: 'unsupported' };
    teacherContentSupported = row.teacher_content_version === 1;
    teacherReadbackSupported = row.teacher_readback_version === 1;
  } catch { return { status: 'unavailable', reason: 'transport' }; }
  return { status: 'available', client: new ClassroomClient(transport,ownerCurrent,teacherContentSupported,teacherReadbackSupported) };
}

/** Must be disposed on authentication change/unmount; ownerId is not authority. */
class ClassroomClient {
  private closed = false;
  private context = 0;
  private latestEntry = 0;
  private latestCommand = 0;
  private latestHostRead = 0;
  private latestTeacherRead = 0;
  private hostRoom: string | null = null;
  private hostVersion = -1;
  private connection: { roomId: string; playerId: string } | null = null;
  private latestRead = 0;
  private maxVersion = -1;
  private questionEpoch = 0;
  private activeQuestion: { id: string; count: number } | null = null;
  private readonly transport: ClassroomTransport;
  private readonly ownerCurrent: () => boolean;
  private readonly teacherContentSupported: boolean;
  private readonly teacherReadbackSupported: boolean;
  constructor(transport: ClassroomTransport,ownerCurrent: () => boolean,teacherContentSupported: boolean,teacherReadbackSupported: boolean) { this.transport=transport; this.ownerCurrent=ownerCurrent; this.teacherContentSupported=teacherContentSupported; this.teacherReadbackSupported=teacherReadbackSupported; }
  private checkOpen() { if (this.closed || !this.ownerCurrent()) { this.dispose(); fail('CLIENT_DISPOSED'); } }
  private async request(name: RpcName, args: Record<string, unknown>, owner: number, current: () => boolean = () => true): Promise<unknown | typeof OBSOLETE> {
    try {
      const result = await this.transport.rpc(name,args);
      if (this.closed || !this.ownerCurrent() || owner !== this.context || !current()) return OBSOLETE;
      if (result.error) {
        // Only expose known contract outcomes; never surface arbitrary backend text.
        const message=result.error.message;
        const known=name==='classroom_v2_answer' && (message==='OUTSIDE_WINDOW'||message==='STALE_QUESTION') || message==='ROOM_UNAVAILABLE' || message==='FORBIDDEN';
        throw new Error(known?message:'RPC_FAILED');
      }
      return result.data;
    } catch (error) { if (this.closed || !this.ownerCurrent() || owner !== this.context || !current()) return OBSOLETE; throw error; }
  }
  dispose() { this.closed = true; this.context++; this.connection = null; this.activeQuestion = null; this.questionEpoch++; }
  bindStudent(roomId: string, playerId: string) {
    this.checkOpen(); if (!isId(roomId) || !isId(playerId)) return fail('INVALID_ARGUMENT');
    this.context++; this.connection = { roomId,playerId }; this.latestRead = 0; this.maxVersion = -1; this.activeQuestion = null; this.questionEpoch++;
    this.latestEntry = 0; this.latestCommand = 0; this.latestHostRead = 0; this.hostRoom = null; this.hostVersion = -1;
  }
  async createRoom(input: CreateRequest): Promise<{roomId:string;joinCode:string;version:number}|null> {
    this.checkOpen();
    // Clone and validate again at call time. No request id is ever invented.
    const prepared = prepareCreateRequest(input.requestId,input.questions,input.seconds);
    if (prepared.questions.some(question => question.teacher_draft) && !this.teacherContentSupported) return fail('TEACHER_CONTENT_UNSUPPORTED');
    this.context++; this.connection=null; this.activeQuestion=null; this.questionEpoch++;
    const owner=this.context, request=++this.latestEntry;
    this.hostRoom=null; this.hostVersion=-1; this.latestCommand++; this.latestHostRead++;
    const data=await this.request('classroom_v2_create',{p_request_id:prepared.requestId,p_questions:prepared.questions,p_seconds:prepared.seconds},owner,()=>request===this.latestEntry);
    if (data===OBSOLETE) return null;
    const row=single(data); if(!isId(row.room_id)||!isId(row.join_code)||!isInteger(row.room_version)) return fail('INVALID_RESPONSE');
    this.hostRoom=row.room_id; this.hostVersion=row.room_version;
    return {roomId:row.room_id,joinCode:row.join_code,version:row.room_version};
  }
  async join(joinCode: string, alias: string): Promise<{roomId:string;playerId:string;state:StudentSnapshot['state']}|null> {
    this.checkOpen(); if(!isId(joinCode)||typeof alias!=='string'||!alias.trim()||alias.trim().length>40) return fail('INVALID_ARGUMENT');
    this.context++; this.connection=null; this.activeQuestion=null; this.questionEpoch++;
    const owner=this.context,request=++this.latestEntry;
    this.hostRoom=null; this.hostVersion=-1; this.latestCommand++; this.latestHostRead++;
    const data=await this.request('classroom_v2_join',{p_join_code:joinCode,p_alias:alias},owner,()=>request===this.latestEntry);
    if(data===OBSOLETE)return null;
    const row=single(data);if(!isId(row.room_id)||!isId(row.player_id)||!isState(row.state))return fail('INVALID_RESPONSE');
    return {roomId:row.room_id,playerId:row.player_id,state:row.state};
  }
  async hostSnapshot(room: string): Promise<HostSnapshot|null> {
    this.checkOpen();if(!isId(room))return fail('INVALID_ARGUMENT');
    if(this.hostRoom!==room){this.hostRoom=room;this.hostVersion=-1;this.latestCommand++;this.latestEntry++;this.latestTeacherRead++;}
    const owner=this.context,request=++this.latestHostRead;
    const data=await this.request('classroom_v2_host_snapshot',{p_room:room},owner,()=>request===this.latestHostRead);
    if(data===OBSOLETE)return null;
    const parsed=parseHost(data,room);if(parsed.version<this.hostVersion)return null;this.hostVersion=parsed.version;return parsed;
  }
  async teacherQuestions(room: string): Promise<TeacherQuestion[]|null> {
    this.checkOpen();
    if(!isId(room)) return fail('INVALID_ARGUMENT');
    if(!this.teacherReadbackSupported) return fail('TEACHER_READBACK_UNSUPPORTED');
    if(this.hostRoom!==room || this.hostVersion<0) return fail('STALE_HOST_CONTEXT');
    const owner=this.context, request=++this.latestTeacherRead;
    const data=await this.request('classroom_v2_teacher_questions',{p_room:room},owner,()=>request===this.latestTeacherRead&&this.hostRoom===room);
    if(data===OBSOLETE) return null;
    if(!Array.isArray(data) || data.length<1 || data.length>20) return fail('INVALID_RESPONSE');
    const ids=new Set<string>();
    return data.map((row:unknown,index:number) => {
      if(!isRow(row) || row.room_id!==room || !isId(row.question_id) || ids.has(row.question_id) || row.question_index!==index) return fail('INVALID_RESPONSE');
      ids.add(row.question_id);
      try {
        const question=prepareCreateRequest(room,[{stem:row.stem,options:row.options,correct_index:row.correct_index,content_revision:row.content_revision,...(row.teacher_draft === null ? {} : {teacher_draft:row.teacher_draft})} as QuestionDraft],5).questions[0];
        return {id:row.question_id,index,stem:question.stem,options:question.options,correctIndex:question.correct_index,contentRevision:question.content_revision,teacherDraft:question.teacher_draft ?? null};
      } catch { return fail('INVALID_RESPONSE'); }
    });
  }
  private async command(name: 'classroom_v2_start'|'classroom_v2_next'|'classroom_v2_finish', room: string, expectedVersion: number): Promise<boolean|null> {
    this.checkOpen();if(!isId(room)||!isInteger(expectedVersion))return fail('INVALID_ARGUMENT');
    if(this.hostRoom!==room || this.hostVersion!==expectedVersion)return fail('STALE_HOST_CONTEXT');
    const owner=this.context,request=++this.latestCommand;
    const data=await this.request(name,{p_room:room,p_expected_version:expectedVersion},owner,()=>request===this.latestCommand&&this.hostRoom===room&&this.hostVersion===expectedVersion);
    if(data===OBSOLETE)return null;
    return typeof data==='boolean'?data:fail('INVALID_RESPONSE');
  }
  start(room:string,expectedVersion:number){return this.command('classroom_v2_start',room,expectedVersion);}
  next(room:string,expectedVersion:number){return this.command('classroom_v2_next',room,expectedVersion);}
  finish(room:string,expectedVersion:number){return this.command('classroom_v2_finish',room,expectedVersion);}
  async snapshot(): Promise<StudentSnapshot|null> {
    this.checkOpen();if(!this.connection)return fail('NO_CONNECTION');
    const binding=this.connection,owner=this.context,request=++this.latestRead;
    const data=await this.request('classroom_v2_snapshot',{p_room:binding.roomId,p_player:binding.playerId},owner,()=>request===this.latestRead&&binding===this.connection);
    if(data===OBSOLETE)return null;
    const parsed=parseStudent(data,binding.roomId);if(parsed.version<this.maxVersion)return null;
    this.maxVersion=parsed.version;
    const next=parsed.state==='active'&&parsed.question ? {id:parsed.question.id,count:parsed.question.options.length}:null;
    if(next?.id!==this.activeQuestion?.id||next?.count!==this.activeQuestion?.count)this.questionEpoch++;
    this.activeQuestion=next;return parsed;
  }
  async answer(questionId: string, choice: number): Promise<Receipt|null> {
    this.checkOpen();if(!this.connection)return fail('NO_CONNECTION');
    if(!isId(questionId)||!isInteger(choice)||!this.activeQuestion||this.activeQuestion.id!==questionId||choice>=this.activeQuestion.count)return fail('STALE_OR_INVALID_CHOICE');
    const binding=this.connection,question=this.activeQuestion,epoch=this.questionEpoch,owner=this.context;
    const data=await this.request('classroom_v2_answer',{p_room:binding.roomId,p_player:binding.playerId,p_question:questionId,p_choice:choice},owner,()=>binding===this.connection&&epoch===this.questionEpoch);
    if(data===OBSOLETE)return null;
    const row=single(data);if(row.question_id!==questionId)return fail('INVALID_RECEIPT');
    // A legitimate retry can return a different previously accepted choice.
    return parseReceipt(row,questionId,row.score,question.count);
  }
}
