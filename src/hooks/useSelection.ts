import { useCallback, useState, useRef } from 'react';

export interface SelectModifiers {
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

/**
 * 文件多选状态：跨分页保留，支持 Ctrl/Cmd 点选、Shift 连选、
 * 全选当前页与全选全部筛选结果。anchor 记录 Shift 连选的起点。
 */
export function useSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchor = useRef<string | null>(null);

  /** 切换单项 / Shift 连选；orderedPaths 为当前页按排序后的顺序 */
  const select = useCallback(
    (path: string, mods: SelectModifiers, orderedPaths: string[]) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (mods.shiftKey && anchor.current && orderedPaths.includes(anchor.current)) {
          const from = orderedPaths.indexOf(anchor.current);
          const to = orderedPaths.indexOf(path);
          if (to >= 0) {
            const start = Math.min(from, to);
            const end = Math.max(from, to);
            for (let index = start; index <= end; index += 1) next.add(orderedPaths[index]);
          } else {
            next.add(path);
          }
        } else if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }
        anchor.current = path;
        return next;
      });
    },
    [],
  );

  /** 表头复选框：选中 / 取消当前页全部项目 */
  const togglePage = useCallback((paths: string[], checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const path of paths) {
        if (checked) next.add(path);
        else next.delete(path);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((paths: string[]) => {
    setSelected(new Set(paths));
    anchor.current = null;
  }, []);

  const clear = useCallback(() => {
    setSelected(new Set());
    anchor.current = null;
  }, []);

  /** 批量操作结束后只保留失败 / 跳过的项目，便于重试 */
  const keep = useCallback((paths: string[]) => {
    setSelected(new Set(paths));
    anchor.current = null;
  }, []);

  return { selected, select, togglePage, selectAll, clear, keep };
}
