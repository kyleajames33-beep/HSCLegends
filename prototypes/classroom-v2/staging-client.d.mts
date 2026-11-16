import type { createLabClient } from './client';
type StagingFunction = 'classroom_v2_snapshot' | 'classroom_v2_answer' | 'classroom_v2_create' | 'classroom_v2_join' | 'classroom_v2_host_snapshot' | 'classroom_v2_start' | 'classroom_v2_next' | 'classroom_v2_finish';
type RpcResult = { data: unknown; error: { message: string } | null };
export type StagingRpc = (name: StagingFunction, args: Record<string, unknown>) => PromiseLike<RpcResult>;
export type StagingQuestion = { stem: string; options: string[]; correct_index: number; content_revision: string };
export type StagingClient = ReturnType<typeof createLabClient> & {
  createRoom(requestId: string, questions: StagingQuestion[], seconds: number): Promise<{roomId:string; joinCode:string; version:number} | null>;
  join(joinCode: string, alias: string): Promise<{roomId:string; playerId:string; state:'lobby'|'active'|'complete'} | null>;
  hostSnapshot(roomId: string): Promise<{roomId:string; version:number; state:'lobby'|'active'|'complete'; questionIndex:number|null; questionTotal:number; stem:string|null; options:string[]|null; opensAt:string|null; closesAt:string|null; serverNow:string; answered:number; players:{alias:string;score:number}[]} | null>;
  start(roomId:string, expectedVersion:number): Promise<boolean | null>;
  next(roomId:string, expectedVersion:number): Promise<boolean | null>;
  finish(roomId:string, expectedVersion:number): Promise<boolean | null>;
};
export function createStagingClient(rpc: StagingRpc): StagingClient;
