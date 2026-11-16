// Isolated lab transport adapter. Not imported by the application; no actor is
// accepted from request data. Production identity needs verified server auth.
export type QueryValue = string | number;
export type LabExecutor = (sql: string, values: QueryValue[]) => Promise<{ rows: unknown[] }>;
export type Receipt = { receiptId: string; questionId: string; choice: number; correct: boolean; correctIndex: number; points: number; scoreAfter: number };
export type Snapshot = { roomId: string; version: number; state: 'lobby' | 'active' | 'complete'; question: { id: string; index: number; stem: string; options: string[]; contentRevision: string; closesAt: string } | null; score: number; receipt: Receipt | null };
type Row = Record<string, unknown>;
const rowObject = (x: unknown): x is Row => !!x && typeof x === 'object' && !Array.isArray(x);
const nonnegative = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0;
const identifier = (x: unknown): x is string => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const onlyRow = (rows: unknown[]): Row => { if (rows.length !== 1 || !rowObject(rows[0])) throw new Error('INVALID_SERVER_RESPONSE'); return rows[0]; };
const integer = (v: unknown): number => { const n = typeof v === 'bigint' ? Number(v) : v; if (!nonnegative(n)) throw new Error('INVALID_SERVER_RESPONSE'); return n; };

function parseReceipt(row: Row, questionId: string, scoreAfter: unknown, optionCount?: number): Receipt {
  const { receipt_id, accepted_choice, is_correct, correct_index, points } = row;
  if (!identifier(receipt_id) || !identifier(questionId) || !nonnegative(accepted_choice) || typeof is_correct !== 'boolean' || !nonnegative(correct_index) || !nonnegative(points) || is_correct !== (accepted_choice === correct_index) || (optionCount !== undefined && (accepted_choice >= optionCount || correct_index >= optionCount))) throw new Error('INVALID_RECEIPT');
  return { receiptId: receipt_id, questionId, choice: accepted_choice, correct: is_correct, correctIndex: correct_index, points, scoreAfter: integer(scoreAfter) };
}
function parseSnapshot(row: Row, expectedRoom: string): Snapshot {
  const { room_id, state, question_id, question_index, stem, options, content_revision, closes_at, receipt_id } = row;
  if (room_id !== expectedRoom || (state !== 'lobby' && state !== 'active' && state !== 'complete')) throw new Error('INVALID_SERVER_RESPONSE');
  const rawVersion = integer(row.room_version), score = integer(row.score);
  if (question_id === null) {
    if (state === 'active' || [question_index,stem,options,content_revision,closes_at,receipt_id,row.accepted_choice,row.is_correct,row.correct_index,row.points,row.receipt_score_after].some(x => x !== null)) throw new Error('INVALID_SERVER_RESPONSE');
    return { roomId: expectedRoom, version: rawVersion, state, question: null, score, receipt: null };
  }
  if (!identifier(question_id) || !nonnegative(question_index) || typeof stem !== 'string' || !Array.isArray(options) || options.length < 2 || !options.every((x: unknown) => typeof x === 'string') || typeof content_revision !== 'string' || !content_revision) throw new Error('INVALID_SERVER_RESPONSE');
  const date = closes_at instanceof Date ? closes_at : typeof closes_at === 'string' ? new Date(closes_at) : null;
  if (!date || Number.isNaN(date.getTime())) throw new Error('INVALID_SERVER_RESPONSE');
  const receipt = receipt_id === null ? null : parseReceipt(row, question_id, row.receipt_score_after, options.length);
  if (receipt === null && [row.accepted_choice,row.is_correct,row.correct_index,row.points,row.receipt_score_after].some(x => x !== null)) throw new Error('INVALID_RECEIPT');
  return { roomId: expectedRoom, version: rawVersion, state, question: { id: question_id, index: question_index, stem, options, contentRevision: content_revision, closesAt: date.toISOString() }, score, receipt };
}

export function createLabClient(query: LabExecutor) {
  let connection: { roomId: string; playerId: string } | null = null;
  let generation = 0, latestRead = 0, maxVersion = -1, activeQuestion: string | null = null, activeOptions = 0;
  return {
    bind(roomId: string, playerId: string) { if (!identifier(roomId) || !identifier(playerId)) throw new Error('INVALID_ID'); connection = { roomId, playerId }; generation++; latestRead = 0; maxVersion = -1; activeQuestion = null; activeOptions = 0; },
    dispose() { connection = null; activeQuestion = null; activeOptions = 0; generation++; },
    async snapshot(): Promise<Snapshot | null> {
      if (!connection) throw new Error('NO_CONNECTION');
      const current = connection, owner = generation, read = ++latestRead;
      try {
        const result = await query('select * from lab_api.snapshot($1::uuid,$2::uuid)',[current.roomId,current.playerId]);
        if (current !== connection || generation !== owner || read !== latestRead) return null;
        const parsed = parseSnapshot(onlyRow(result.rows), current.roomId);
        if (parsed.version < maxVersion) return null;
        maxVersion = parsed.version;
        activeQuestion = parsed.state === 'active' ? parsed.question?.id ?? null : null;
        activeOptions = parsed.state === 'active' ? parsed.question?.options.length ?? 0 : 0;
        return parsed;
      } catch (error) { if (current !== connection || generation !== owner || read !== latestRead) return null; throw error; }
    },
    async answer(questionId: string, choice: number): Promise<Receipt | null> {
      if (!connection) throw new Error('NO_CONNECTION');
      if (!identifier(questionId) || !nonnegative(choice) || choice > 32767) throw new Error('INVALID_CHOICE');
      if (activeQuestion !== questionId) throw new Error('STALE_QUESTION');
      if (choice >= activeOptions) throw new Error('INVALID_CHOICE');
      const current = connection, owner = generation;
      try {
        const result = await query('select * from lab_api.answer($1::uuid,$2::uuid,$3::uuid,$4::smallint)',[current.roomId,current.playerId,questionId,choice]);
        if (current !== connection || generation !== owner || activeQuestion !== questionId) return null;
        const row = onlyRow(result.rows);
        if (row.question_id !== questionId) throw new Error('INVALID_RECEIPT');
        return parseReceipt(row, questionId, row.score, activeOptions);
      } catch (error) { if (current !== connection || generation !== owner || activeQuestion !== questionId) return null; throw error; }
    },
  };
}
