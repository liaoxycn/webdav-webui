import { useCallback } from 'react';
import { CONFIG } from '../config';
import {
  BatchLimitError,
  collectZipPlan,
  createZipArchive,
  defaultZipName,
  sleep,
  ZIP_STEP_ID,
  zipGenerateOptions,
} from '../lib/batch';
import { saveBlob } from '../lib/download';
import { asErrorInfo } from '../lib/errors';
import { formatBytes } from '../lib/format';
import { baseName, joinPath, uniqueName } from '../lib/path';
import type { WebDavClient } from '../lib/webdav';
import type {
  BatchItem,
  BatchJob,
  ConflictChoice,
  DavEntry,
  ToastTone,
} from '../types';
import { useBatchRunner } from './useBatchRunner';

interface Deps {
  client: WebDavClient;
  currentPath: string;
  refresh: () => void | Promise<void>;
  toast: (tone: ToastTone, title: string, description?: string) => void;
  askConflict: (name: string, context?: 'upload' | 'move') => Promise<ConflictChoice>;
  clearSelection: () => void;
  keepSelection: (paths: string[]) => void;
}

interface MovePlan {
  targetName: string;
  overwrite: boolean;
}

export function useBatchActions(deps: Deps) {
  const runner = useBatchRunner();
  const { run, cancel, close, setPanelOpen, job, panelOpen } = runner;
  const { client, currentPath, refresh, toast, askConflict, clearSelection, keepSelection } = deps;

  /** 统一的结果汇总：Toast + 刷新目录 + 保留失败项以便重试 */
  const finish = useCallback(
    async (job: BatchJob, originalPaths: string[], shouldRefresh: boolean) => {
      const items = job.items.filter((item) => item.id !== ZIP_STEP_ID);
      const zipStep = job.items.find((item) => item.id === ZIP_STEP_ID);
      const zipStepFailed = zipStep?.status === 'error';
      const done = items.filter((item) => item.status === 'done').length;
      const failed = items.filter((item) => item.status === 'error').length + (zipStepFailed ? 1 : 0);
      const skipped = items.filter((item) => item.status === 'skipped').length;
      const canceled = items.filter((item) => item.status === 'canceled').length;
      const firstError =
        items.find((item) => item.status === 'error')?.detail ?? (zipStepFailed ? zipStep?.detail : undefined);

      if (job.canceled) {
        toast('warning', `${job.title} 已取消`, `${done} 项已完成，其余未处理`);
      } else if (failed > 0) {
        toast('error', `${job.title}：${done} 成功 / ${failed} 失败`, firstError);
      } else {
        toast(
          'success',
          `${job.title}完成`,
          `${done} 项已处理${skipped ? ` · ${skipped} 项跳过` : ''}${canceled ? ` · ${canceled} 项取消` : ''}`,
        );
      }

      if (shouldRefresh) await refresh();

      const retriable = items
        .filter((item) => item.status === 'error' || item.status === 'canceled')
        .map((item) => item.id)
        .filter((path) => originalPaths.includes(path));
      if (job.kind === 'zip') {
        if (failed > 0 || job.canceled) keepSelection(originalPaths);
        else clearSelection();
      } else if (retriable.length > 0) {
        keepSelection(retriable);
      } else {
        clearSelection();
      }
    },
    [toast, refresh, keepSelection, clearSelection],
  );

  /** 批量删除：逐项 DELETE，文件夹按 WebDAV 语义递归删除 */
  const deleteSelected = useCallback(
    async (entries: DavEntry[]) => {
      const originalPaths = entries.map((entry) => entry.path);
      const items: BatchItem[] = entries.map((entry) => ({
        id: entry.path,
        name: entry.name,
        status: 'pending',
        isCollection: entry.isCollection,
      }));
      await run({
        kind: 'delete',
        title: `批量删除 ${items.length} 项`,
        items,
        concurrency: CONFIG.BATCH_CONCURRENCY,
        worker: async (item, signal, update) => {
          await client.delete(item.id, Boolean(item.isCollection), signal);
          update({ status: 'done', detail: '已删除' });
        },
        onFinished: (job) => void finish(job, originalPaths, true),
      });
    },
    [client, run, finish],
  );

  /** 批量下载：文件夹自动跳过；串行触发浏览器保存，降低被拦截概率 */
  const downloadSelected = useCallback(
    async (entries: DavEntry[]) => {
      const originalPaths = entries.map((entry) => entry.path);
      const items: BatchItem[] = entries.map((entry) => ({
        id: entry.path,
        name: entry.name,
        status: entry.isCollection ? 'skipped' : 'pending',
        detail: entry.isCollection ? '文件夹需进入后逐个下载' : undefined,
        total: entry.size,
        isCollection: entry.isCollection,
      }));
      if (items.every((item) => item.status === 'skipped')) {
        toast('warning', '没有可下载的文件', '所选项目均为文件夹，请进入文件夹后逐个下载，或改用「打包 ZIP」。');
        return;
      }
      await run({
        kind: 'download',
        title: `批量下载 ${items.filter((item) => item.status === 'pending').length} 个文件`,
        items,
        concurrency: 1,
        worker: async (item, signal, update) => {
          const blob = await client.getBlob(item.id, {
            signal,
            onProgress: ({ loaded, total }) => update({ loaded, total: total || item.total || 0 }),
          });
          saveBlob(blob, item.name);
          update({ status: 'done', detail: `${formatBytes(blob.size)} · 已保存`, loaded: blob.size, total: blob.size });
          await sleep(CONFIG.BATCH_DOWNLOAD_INTERVAL_MS);
        },
        onFinished: (job) => void finish(job, originalPaths, false),
      });
    },
    [client, run, finish, toast],
  );

  /** 批量移动：先检查目标目录同名项，再逐项 MOVE */
  const moveSelected = useCallback(
    async (entries: DavEntry[], targetPath: string) => {
      const originalPaths = entries.map((entry) => entry.path);
      let existingNames: string[];
      try {
        existingNames = (await client.propfind(targetPath)).map((entry) => entry.name);
      } catch (error) {
        const info = asErrorInfo(error, 'PROPFIND');
        toast('error', `无法读取目标目录：${info.title}`, info.message);
        return;
      }

      const usedNames = [...existingNames];
      const plan = new Map<string, MovePlan>();
      const items: BatchItem[] = entries.map((entry) => ({
        id: entry.path,
        name: entry.name,
        status: 'pending',
        isCollection: entry.isCollection,
      }));
      let applyAll: ConflictChoice | null = null;

      for (const entry of entries) {
        const exists = usedNames.some((name) => name.toLowerCase() === entry.name.toLowerCase());
        let targetName = entry.name;
        let overwrite = false;
        if (exists) {
          const choice = applyAll ?? (await askConflict(entry.name, 'move'));
          if (choice === 'skip') {
            const item = items.find((candidate) => candidate.id === entry.path)!;
            item.status = 'skipped';
            item.detail = '目标目录已有同名项目，已跳过';
            continue;
          }
          if (choice === 'rename') targetName = uniqueName(entry.name, usedNames);
          if (choice === 'overwrite') overwrite = true;
        }
        usedNames.push(targetName);
        plan.set(entry.path, { targetName, overwrite });
      }

      if (plan.size === 0) {
        toast('info', '没有需要移动的项目', '所有项目都因同名冲突被跳过。');
        return;
      }

      await run({
        kind: 'move',
        title: `批量移动 ${plan.size} 项`,
        items,
        concurrency: CONFIG.BATCH_CONCURRENCY,
        worker: async (item, signal, update) => {
          const target = plan.get(item.id);
          if (!target) return;
          await client.move(item.id, joinPath(targetPath, target.targetName), Boolean(item.isCollection), {
            signal,
            overwrite: target.overwrite,
          });
          update({ status: 'done', detail: `→ ${targetPath}${targetPath.endsWith('/') ? '' : '/'}${target.targetName}` });
        },
        onFinished: (job) => void finish(job, originalPaths, true),
      });
    },
    [client, run, finish, toast, askConflict],
  );

  /** 打包 ZIP：递归展开文件夹 → 并发 GET → JSZip 压缩 → 单次下载 */
  const zipSelected = useCallback(
    async (entries: DavEntry[]) => {
      const originalPaths = entries.map((entry) => entry.path);
      const prepController = new AbortController();
      let zip: Awaited<ReturnType<typeof createZipArchive>>;
      let plan: Awaited<ReturnType<typeof collectZipPlan>>;
      try {
        plan = await collectZipPlan(client, currentPath, entries, prepController.signal);
        zip = await createZipArchive();
      } catch (error) {
        const info = error instanceof BatchLimitError ? null : asErrorInfo(error, 'PROPFIND');
        toast('error', info ? `准备打包失败：${info.title}` : '打包范围过大', error instanceof Error ? error.message : String(error));
        return;
      }

      if (plan.sources.length === 0 && plan.emptyDirs.length === 0) {
        toast('warning', '选中内容为空', '所选文件夹内没有可打包的文件。');
        return;
      }
      for (const dir of plan.emptyDirs) zip.folder(dir);

      const items: BatchItem[] = [
        ...plan.sources.map((source) => ({
          id: source.path,
          name: source.zipPath,
          status: 'pending' as const,
          total: source.size,
        })),
        { id: ZIP_STEP_ID, name: '生成 ZIP 压缩包', status: 'skipped' as const, detail: '等待文件读取完成' },
      ];
      const zipName = defaultZipName(currentPath === '/' ? '全部文件' : baseName(currentPath));
      let successCount = 0;

      await run({
        kind: 'zip',
        title: `打包 ${plan.sources.length} 个文件`,
        items,
        stepId: ZIP_STEP_ID,
        concurrency: CONFIG.BATCH_CONCURRENCY,
        worker: async (item, signal, update) => {
          const blob = await client.getBlob(item.id, {
            signal,
            onProgress: ({ loaded, total }) => update({ loaded, total: total || item.total || 0 }),
          });
          zip.file(item.name, blob);
          successCount += 1;
          update({ status: 'done', detail: formatBytes(blob.size), loaded: blob.size, total: blob.size });
        },
        finalize: async (signal, patch) => {
          if (signal.aborted) return;
          if (successCount === 0 && plan.emptyDirs.length === 0) {
            patch(ZIP_STEP_ID, { status: 'skipped', detail: '所有文件读取失败，未生成压缩包' });
            return;
          }
          patch(ZIP_STEP_ID, { status: 'running', detail: '正在压缩 0%' });
          const blob = await zip.generateAsync(zipGenerateOptions(), (metadata) => {
            patch(ZIP_STEP_ID, { status: 'running', detail: `正在压缩 ${Math.round(metadata.percent)}%` });
          });
          saveBlob(blob, zipName);
          patch(ZIP_STEP_ID, { status: 'done', detail: `${formatBytes(blob.size)} · 已开始下载` });
        },
        onFinished: (job) => void finish(job, originalPaths, false),
      });
    },
    [client, currentPath, run, finish, toast],
  );

  return {
    job,
    panelOpen,
    setPanelOpen,
    cancel,
    close,
    busy: Boolean(job && !job.finished),
    deleteSelected,
    downloadSelected,
    moveSelected,
    zipSelected,
  };
}
