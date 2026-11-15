import { useCallback, useRef, useState } from 'react';
import { isAbortError } from '../lib/batch';
import { asErrorInfo } from '../lib/errors';
import type { BatchItem, BatchJob, BatchKind, HttpMethod } from '../types';

export type BatchUpdate = (change: Partial<BatchItem>) => void;

export interface RunBatchOptions {
  kind: BatchKind;
  title: string;
  items: BatchItem[];
  concurrency?: number;
  /** 单个项目的处理逻辑；成功时自行把 status 置为 done / skipped */
  worker: (item: BatchItem, signal: AbortSignal, update: BatchUpdate) => Promise<void>;
  /** 所有项目处理完后执行（例如生成 ZIP）；此时任务仍未标记为 finished */
  finalize?: (signal: AbortSignal, patch: (id: string, change: Partial<BatchItem>) => void) => Promise<void>;
  method?: HttpMethod;
  /** 收尾步骤对应的虚拟项目 id，收尾失败时把错误落到这一项上 */
  stepId?: string;
  onFinished?: (job: BatchJob) => void;
}

const METHOD_BY_KIND: Record<BatchKind, HttpMethod> = {
  delete: 'DELETE',
  move: 'MOVE',
  download: 'GET',
  zip: 'GET',
};

/**
 * 批量任务执行器：负责并发池、取消、逐项状态与最终汇总。
 * 组件层只关心「给一批项目 + 一个 worker」，不需要重复实现进度状态。
 */
export function useBatchRunner() {
  const [job, setJob] = useState<BatchJob | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const results = useRef(new Map<string, BatchItem>());
  const activeId = useRef('');
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);

  const patch = useCallback((id: string, change: Partial<BatchItem>) => {
    const current = results.current.get(id);
    if (!current) return;
    const next = { ...current, ...change };
    results.current.set(id, next);
    setJob((prev) =>
      prev && prev.id === activeId.current
        ? { ...prev, items: prev.items.map((item) => (item.id === id ? next : item)) }
        : prev,
    );
  }, []);

  const cancel = useCallback(() => {
    controller.current?.abort();
    setJob((prev) =>
      prev ? { ...prev, canceled: true } : prev,
    );
  }, []);

  const close = useCallback(() => {
    setJob(null);
    results.current.clear();
  }, []);

  const run = useCallback(async (options: RunBatchOptions): Promise<BatchJob> => {
    const id = `b${(sequence.current += 1)}`;
    const items = options.items.map((item) => ({ ...item }));
    const signalController = new AbortController();
    controller.current = signalController;
    activeId.current = id;
    results.current = new Map(items.map((item) => [item.id, item]));

    const initial: BatchJob = {
      id,
      kind: options.kind,
      title: options.title,
      items,
      finished: false,
      canceled: false,
    };
    setJob(initial);
    setPanelOpen(true);

    let cursor = 0;
    const workerTask = async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        const item = items[index];
        if (item.status === 'skipped') continue;
        if (signalController.signal.aborted) {
          patch(item.id, { status: 'canceled', detail: '已取消' });
          continue;
        }
        patch(item.id, { status: 'running' });
        try {
          await options.worker(
            item,
            signalController.signal,
            (change) => patch(item.id, change),
          );
        } catch (error) {
          if (isAbortError(error) || signalController.signal.aborted) {
            patch(item.id, { status: 'canceled', detail: '已取消' });
          } else {
            const info = asErrorInfo(error, options.method ?? METHOD_BY_KIND[options.kind]);
            patch(item.id, { status: 'error', detail: `${info.title}：${info.message}` });
          }
        }
      }
    };

    const count = Math.max(1, Math.min(options.concurrency ?? 2, items.length));
    await Promise.all(Array.from({ length: count }, () => workerTask()));

    let finalizeError: string | null = null;
    if (!signalController.signal.aborted) {
      try {
        await options.finalize?.(signalController.signal, patch);
      } catch (error) {
        if (!isAbortError(error) && !signalController.signal.aborted) {
          const info = asErrorInfo(error, options.method ?? METHOD_BY_KIND[options.kind]);
          finalizeError = `${info.title}：${info.message}`;
          if (options.stepId) {
            patch(options.stepId, { status: 'error', detail: finalizeError });
          }
        }
      }
    }

    const finalItems = items.map((item) => results.current.get(item.id) ?? item);
    const finished: BatchJob = {
      ...initial,
      title: finalizeError ? `${options.title}（收尾失败）` : options.title,
      items: finalItems,
      finished: true,
      canceled: signalController.signal.aborted,
    };
    setJob((prev) => (prev && prev.id === id ? finished : prev));
    controller.current = null;
    options.onFinished?.(finished);
    return finished;
  }, [patch]);

  return { job, panelOpen, setPanelOpen, run, cancel, close, patch };
}
