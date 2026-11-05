import { PgBoss } from "pg-boss";
import { getEnv } from "@storyflow/shared/env";
import {
  QUEUES,
  QUEUE_OPTIONS,
  QUEUE_PAYLOADS,
  singletonKeyFor,
  type QueueName,
  type QueuePayload,
} from "@storyflow/shared/queue";

// pg-boss on the app Postgres, schema `pgboss` (research.md R3, contracts/queue-jobs.md).

const globalForBoss = globalThis as unknown as { __storyflowBoss?: Promise<PgBoss> };

export function getBoss(): Promise<PgBoss> {
  if (!globalForBoss.__storyflowBoss) {
    globalForBoss.__storyflowBoss = (async () => {
      const boss = new PgBoss({ connectionString: getEnv().DATABASE_URL, schema: "pgboss" });
      boss.on("error", (err) => console.error(JSON.stringify({ msg: "pg-boss error", err: String(err) })));
      await boss.start();
      await createQueues(boss);
      return boss;
    })();
  }
  return globalForBoss.__storyflowBoss;
}

export async function createQueues(boss: PgBoss): Promise<void> {
  for (const name of Object.values(QUEUES)) {
    if (!(await boss.getQueue(name))) await boss.createQueue(name, QUEUE_OPTIONS[name]);
  }
}

/** Validates then sends. Returns the pg-boss job id, or null if blocked by the singleton policy. */
export async function enqueue<Q extends QueueName>(queue: Q, payload: QueuePayload<Q>): Promise<string | null> {
  const data = QUEUE_PAYLOADS[queue].parse(payload);
  const boss = await getBoss();
  const singletonKey = singletonKeyFor(queue, data as QueuePayload<Q>);
  return boss.send(queue, data, singletonKey ? { singletonKey } : {});
}

export interface WorkContext {
  signal: AbortSignal;
  retryCount: number;
  queueJobId: string;
}

/** Registers a worker that receives one validated payload at a time. */
export async function work<Q extends QueueName>(
  queue: Q,
  options: { localConcurrency: number },
  handler: (payload: QueuePayload<Q>, ctx: WorkContext) => Promise<unknown>,
): Promise<string> {
  const boss = await getBoss();
  return boss.work<QueuePayload<Q>>(queue, { localConcurrency: options.localConcurrency, batchSize: 1 }, async (jobs) => {
    for (const job of jobs) {
      const payload = QUEUE_PAYLOADS[queue].parse(job.data) as QueuePayload<Q>;
      await handler(payload, { signal: job.signal, retryCount: job.retryCount, queueJobId: job.id });
    }
  });
}

export async function cancelQueueJob(queue: QueueName, queueJobId: string): Promise<void> {
  const boss = await getBoss();
  await boss.cancel(queue, queueJobId);
}
