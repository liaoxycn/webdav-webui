import {
  BookOpen,
  File,
  FileArchive,
  FileAudio,
  FileCode2,
  FileText,
  FileVideo,
  Folder,
  Image as ImageIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FileKind } from '../types';

interface Tone {
  fg: string;
  bg: string;
  Icon: LucideIcon;
}

const TONES: Record<FileKind, Tone> = {
  folder: { fg: '#c07f16', bg: 'rgba(240, 165, 45, 0.15)', Icon: Folder },
  image: { fg: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.13)', Icon: ImageIcon },
  markdown: { fg: '#2563eb', bg: 'rgba(37, 99, 235, 0.12)', Icon: BookOpen },
  text: { fg: '#4b5f8a', bg: 'rgba(75, 95, 138, 0.12)', Icon: FileText },
  code: { fg: '#0d9488', bg: 'rgba(13, 148, 136, 0.12)', Icon: FileCode2 },
  pdf: { fg: '#dc2626', bg: 'rgba(220, 38, 38, 0.12)', Icon: FileText },
  archive: { fg: '#c2740a', bg: 'rgba(194, 116, 10, 0.12)', Icon: FileArchive },
  audio: { fg: '#db2777', bg: 'rgba(219, 39, 119, 0.12)', Icon: FileAudio },
  video: { fg: '#7c3aed', bg: 'rgba(124, 58, 237, 0.12)', Icon: FileVideo },
  other: { fg: '#64748b', bg: 'rgba(100, 116, 139, 0.12)', Icon: File },
};

interface Props {
  kind: FileKind;
  size?: 'sm' | 'md' | 'lg';
}

export function FileIcon({ kind, size = 'md' }: Props) {
  const tone = TONES[kind];
  const Icon = tone.Icon;
  const iconSize = size === 'lg' ? 30 : size === 'sm' ? 15 : 18;
  return (
    <span className={`file-icon file-icon--${size}`} style={{ color: tone.fg, background: tone.bg }}>
      <Icon size={iconSize} strokeWidth={1.9} />
    </span>
  );
}
