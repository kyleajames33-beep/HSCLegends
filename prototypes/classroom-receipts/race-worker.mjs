import { parentPort, workerData } from 'node:worker_threads';
import { openModel } from './service.mjs';
const model=openModel(workerData.path,()=>2000);
const gate=new Int32Array(workerData.gate);
Atomics.add(gate,0,1); Atomics.notify(gate,0);
parentPort.postMessage({ready:true});
Atomics.wait(gate,1,0);
try {
  const {roomId,playerId,secret,questionId}=workerData.fixture;
  parentPort.postMessage({receipt:model.submit(roomId,playerId,secret,questionId,workerData.choice)});
} catch (e) { parentPort.postMessage({error:e.message}); }
finally {model.close();}
