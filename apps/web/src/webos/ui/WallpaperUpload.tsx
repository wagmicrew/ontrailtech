/**
 * Adapted from KokonutUI File Upload
 * https://kokonutui.com/docs/inputs/file-upload
 * @license MIT
 */
import { AnimatePresence, motion } from 'framer-motion';
import {
  type DragEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

type FileStatus = 'idle' | 'dragging' | 'uploading' | 'error';

interface FileError {
  message: string;
  code: string;
}

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MB
const UPLOAD_STEP_SIZE = 5;
const UPLOAD_DELAY = 800;

const FILE_SIZES = ['Bytes', 'KB', 'MB', 'GB'] as const;
function formatBytes(bytes: number, decimals = 2): string {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const unit = FILE_SIZES[i] ?? FILE_SIZES[FILE_SIZES.length - 1];
  return `${Number.parseFloat((bytes / k ** i).toFixed(dm))} ${unit}`;
}

const UploadIllustration = () => (
  <div className="relative h-16 w-16">
    <svg aria-label="Upload illustration" className="h-full w-full" fill="none" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <title>Upload File Illustration</title>
      <circle className="stroke-gray-200 dark:stroke-gray-700" cx="50" cy="50" r="45" strokeDasharray="4 4" strokeWidth="2">
        <animateTransform attributeName="transform" dur="60s" from="0 50 50" repeatCount="indefinite" to="360 50 50" type="rotate" />
      </circle>
      <path className="fill-blue-100 stroke-blue-500 dark:fill-blue-900/30 dark:stroke-blue-400"
        d="M30 35H70C75 35 75 40 75 40V65C75 70 70 70 70 70H30C25 70 25 65 25 65V40C25 35 30 35 30 35Z" strokeWidth="2">
        <animate attributeName="d" dur="2s" repeatCount="indefinite"
          values="M30 35H70C75 35 75 40 75 40V65C75 70 70 70 70 70H30C25 70 25 65 25 65V40C25 35 30 35 30 35Z;M30 38H70C75 38 75 43 75 43V68C75 73 70 73 70 73H30C25 73 25 68 25 68V43C25 38 30 38 30 38Z;M30 35H70C75 35 75 40 75 40V65C75 70 70 70 70 70H30C25 70 25 65 25 65V40C25 35 30 35 30 35Z" />
      </path>
      <path className="stroke-blue-500 dark:stroke-blue-400" d="M30 35C30 35 35 35 40 35C45 35 45 30 50 30C55 30 55 35 60 35C65 35 70 35 70 35" fill="none" strokeWidth="2" />
      <g className="translate-y-2 transform">
        <line className="stroke-blue-500 dark:stroke-blue-400" strokeLinecap="round" strokeWidth="2" x1="50" x2="50" y1="45" y2="60">
          <animate attributeName="y2" dur="2s" repeatCount="indefinite" values="60;55;60" />
        </line>
        <polyline className="stroke-blue-500 dark:stroke-blue-400" fill="none" points="42,52 50,45 58,52" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
          <animate attributeName="points" dur="2s" repeatCount="indefinite" values="42,52 50,45 58,52;42,47 50,40 58,47;42,52 50,45 58,52" />
        </polyline>
      </g>
    </svg>
  </div>
);

const UploadingAnimation = ({ progress }: { progress: number }) => (
  <div className="relative h-16 w-16">
    <svg aria-label={`Upload progress: ${Math.round(progress)}%`} className="h-full w-full" fill="none" viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg">
      <title>Upload Progress Indicator</title>
      <defs>
        <mask id="progress-mask">
          <rect fill="black" height="240" width="240" />
          <circle cx="120" cy="120" fill="white" r="120" strokeDasharray={`${(progress / 100) * 754}, 754`} transform="rotate(-90 120 120)" />
        </mask>
      </defs>
      <style>{`
        @keyframes rotate-cw { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes rotate-ccw { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
        .g-spin circle { transform-origin: 120px 120px; }
        .g-spin circle:nth-child(odd)  { animation: rotate-cw  8s linear infinite; }
        .g-spin circle:nth-child(even) { animation: rotate-ccw 8s linear infinite; }
      `}</style>
      <g className="g-spin" mask="url(#progress-mask)" strokeDasharray="18% 40%" strokeWidth="10">
        {[150,140,130,120,110,100,90,80,70,60,50,40,30,20].map((r, i) => (
          <circle key={r} cx="120" cy="120" opacity="0.95" r={r}
            stroke={['#FF2E7E','#FFD600','#00E5FF','#FF3D71','#4ADE80','#2196F3','#FFA726','#FF1493','#FFEB3B','#00BCD4','#FF4081','#76FF03','#448AFF','#FF3D00'][i]} />
        ))}
      </g>
    </svg>
  </div>
);

// Upload cloud icon (no lucide-react dep)
const UploadCloudIcon = () => (
  <svg className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
  </svg>
);

interface WallpaperUploadProps {
  onUploadSuccess: (file: File) => void;
  onFileRemove?: () => void;
  className?: string;
}

export default function WallpaperUpload({ onUploadSuccess, onFileRemove, className }: WallpaperUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<FileStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<FileError | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (uploadIntervalRef.current) clearInterval(uploadIntervalRef.current);
  }, []);

  const handleError = useCallback((err: FileError) => {
    setError(err);
    setStatus('error');
    setTimeout(() => { setError(null); setStatus('idle'); }, 3000);
  }, []);

  const simulateUpload = useCallback((uploadingFile: File) => {
    let currentProgress = 0;
    if (uploadIntervalRef.current) clearInterval(uploadIntervalRef.current);
    uploadIntervalRef.current = setInterval(() => {
      currentProgress += UPLOAD_STEP_SIZE;
      if (currentProgress >= 100) {
        if (uploadIntervalRef.current) clearInterval(uploadIntervalRef.current);
        setProgress(0);
        setStatus('idle');
        setFile(null);
        onUploadSuccess(uploadingFile);
      } else {
        setStatus(prev => {
          if (prev === 'uploading') { setProgress(currentProgress); return 'uploading'; }
          if (uploadIntervalRef.current) clearInterval(uploadIntervalRef.current);
          return prev;
        });
      }
    }, UPLOAD_DELAY / (100 / UPLOAD_STEP_SIZE));
  }, [onUploadSuccess]);

  const handleFileSelect = useCallback((selectedFile: File | null) => {
    if (!selectedFile) return;
    setError(null);
    if (selectedFile.size > MAX_FILE_SIZE) {
      handleError({ message: 'File size exceeds 4 MB', code: 'FILE_TOO_LARGE' });
      return;
    }
    if (!selectedFile.type.startsWith('image/')) {
      handleError({ message: 'Only image files are supported', code: 'INVALID_FILE_TYPE' });
      return;
    }
    setFile(selectedFile);
    setStatus('uploading');
    setProgress(0);
    simulateUpload(selectedFile);
  }, [simulateUpload, handleError]);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation();
    setStatus(prev => prev !== 'uploading' ? 'dragging' : prev);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation();
    setStatus(prev => prev === 'dragging' ? 'idle' : prev);
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation();
    if (status === 'uploading') return;
    setStatus('idle');
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) handleFileSelect(droppedFile);
  }, [status, handleFileSelect]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    handleFileSelect(selectedFile ?? null);
    if (e.target) e.target.value = '';
  }, [handleFileSelect]);

  const triggerFileInput = useCallback(() => {
    if (status === 'uploading') return;
    fileInputRef.current?.click();
  }, [status]);

  const resetState = useCallback(() => {
    setFile(null); setStatus('idle'); setProgress(0);
    onFileRemove?.();
  }, [onFileRemove]);

  return (
    <div aria-label="File upload" className={cn('relative mx-auto w-full', className)} role="complementary">
      <div className="group relative w-full rounded-xl bg-white p-0.5 ring-1 ring-gray-200 dark:bg-black dark:ring-white/10">
        <div className="absolute inset-x-0 -top-px h-px w-full bg-gradient-to-r from-transparent via-blue-500/20 to-transparent" />
        <div className="relative w-full rounded-[10px] bg-gray-50/50 p-1.5 dark:bg-white/[0.02]">
          <div className={cn(
            'relative mx-auto w-full overflow-hidden rounded-lg border border-gray-100 bg-white dark:border-white/[0.08] dark:bg-black/50',
            error ? 'border-red-500/50' : ''
          )}>
            {/* Drag-over highlight */}
            <div className={cn('absolute inset-0 transition-opacity duration-300', status === 'dragging' ? 'opacity-100' : 'opacity-0')}>
              <div className="absolute inset-x-0 top-0 h-[20%] bg-gradient-to-b from-blue-500/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 h-[20%] bg-gradient-to-t from-blue-500/10 to-transparent" />
              <div className="absolute inset-y-0 left-0 w-[20%] bg-gradient-to-r from-blue-500/10 to-transparent" />
              <div className="absolute inset-y-0 right-0 w-[20%] bg-gradient-to-l from-blue-500/10 to-transparent" />
              <div className="absolute inset-[20%] animate-pulse rounded-lg bg-blue-500/5" />
            </div>

            <div className="absolute -top-4 -right-4 h-8 w-8 bg-gradient-to-br from-blue-500/20 to-transparent opacity-0 blur-md transition-opacity duration-500 group-hover:opacity-100" />

            <div className="relative h-[220px]">
              <AnimatePresence mode="wait">
                {(status === 'idle' || status === 'dragging') && (
                  <motion.div
                    key="dropzone"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: status === 'dragging' ? 0.8 : 1, y: 0, scale: status === 'dragging' ? 0.98 : 1 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-0 flex flex-col items-center justify-center p-6"
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <div className="mb-4"><UploadIllustration /></div>
                    <div className="mb-4 space-y-1.5 text-center">
                      <h3 className="font-semibold text-gray-900 text-lg tracking-tight dark:text-white">Drag and drop or</h3>
                      <p className="text-gray-500 text-xs dark:text-gray-400">PNG, JPG, GIF or WEBP up to {formatBytes(MAX_FILE_SIZE)}</p>
                    </div>
                    <button
                      type="button"
                      className="group flex w-4/5 items-center justify-center gap-2 rounded-lg bg-gray-100 px-4 py-2.5 font-semibold text-gray-900 text-sm transition-all duration-200 hover:bg-gray-200 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                      onClick={triggerFileInput}
                    >
                      <span>Upload Image</span>
                      <UploadCloudIcon />
                    </button>
                    <p className="mt-3 text-gray-500 text-xs dark:text-gray-400">or drag and drop your image here</p>
                    <input ref={fileInputRef} accept="image/*" aria-label="File input" className="sr-only" onChange={handleFileInputChange} type="file" />
                  </motion.div>
                )}

                {status === 'uploading' && (
                  <motion.div
                    key="uploading"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute inset-0 flex flex-col items-center justify-center p-6"
                  >
                    <div className="mb-4"><UploadingAnimation progress={progress} /></div>
                    <div className="mb-4 space-y-1.5 text-center">
                      <h3 className="truncate font-semibold text-gray-900 text-sm dark:text-white">{file?.name}</h3>
                      <div className="flex items-center justify-center gap-2 text-xs">
                        <span className="text-gray-500 dark:text-gray-400">{formatBytes(file?.size ?? 0)}</span>
                        <span className="font-medium text-blue-500">{Math.round(progress)}%</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="flex w-4/5 items-center justify-center gap-2 rounded-lg bg-gray-100 px-4 py-2.5 font-semibold text-gray-900 text-sm transition-all duration-200 hover:bg-gray-200 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                      onClick={resetState}
                    >
                      Cancel
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute bottom-4 left-1/2 -translate-x-1/2 transform rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2"
                >
                  <p className="text-red-500 text-sm dark:text-red-400">{error.message}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

WallpaperUpload.displayName = 'WallpaperUpload';
