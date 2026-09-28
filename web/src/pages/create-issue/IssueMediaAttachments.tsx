import { Camera, Pen, RotateCcw, Trash2, Upload } from "lucide-react";
import type { RefObject } from "react";
import { AuthenticatedImage } from "../../components/AuthenticatedImage.tsx";
import type { CauseType } from "../../types/index.ts";

interface IssueMediaAttachmentsProps {
  causeType: CauseType;
  previewBefore: string | null;
  previewDetail: string | null;
  translate: (key: string) => string;
  onCapture: (event: React.ChangeEvent<HTMLInputElement>, isWide: boolean) => void;
  onDrop?: (event: React.DragEvent<HTMLElement>, isWide: boolean) => void;
  onRemove?: (isWide: boolean) => void;
  onAnnotate?: (target: "wide" | "detail") => void;
  wideInputRef?: RefObject<HTMLInputElement>;
  detailInputRef?: RefObject<HTMLInputElement>;
  dragOverWide?: boolean;
  dragOverDetail?: boolean;
  onDragOver?: (isWide: boolean) => void;
  onDragLeave?: (isWide: boolean) => void;
  compact?: boolean;
}

function PhotoCard({
  isWide,
  preview,
  causeType,
  translate,
  onCapture,
  onDrop,
  onRemove,
  onAnnotate,
  inputRef,
  dragOver,
  onDragOver,
  onDragLeave,
  compact,
}: {
  isWide: boolean;
  preview: string | null;
  causeType: CauseType;
  translate: (key: string) => string;
  onCapture: (event: React.ChangeEvent<HTMLInputElement>, isWide: boolean) => void;
  onDrop?: (event: React.DragEvent<HTMLElement>, isWide: boolean) => void;
  onRemove?: (isWide: boolean) => void;
  onAnnotate?: (target: "wide" | "detail") => void;
  inputRef?: RefObject<HTMLInputElement>;
  dragOver?: boolean;
  onDragOver?: (isWide: boolean) => void;
  onDragLeave?: (isWide: boolean) => void;
  compact?: boolean;
}) {
  const label = isWide ? "issue.photo_wide_label" : "issue.photo_detail_label";
  const alt = isWide ? "issue.photo_wide_alt" : "issue.photo_detail_alt";
  const icon = isWide ? <Camera className="w-6 h-6" /> : <Upload className="w-6 h-6" />;
  if (compact) {
    return (
      <label className="cursor-pointer border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-blue-500 rounded-2xl aspect-[4/3] flex flex-col items-center justify-center p-2 text-center bg-zinc-50 dark:bg-zinc-800/40 relative overflow-hidden">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => onCapture(event, isWide)}
          className="hidden"
        />
        {preview ? (
          <AuthenticatedImage
            imageUrl={preview}
            alt={translate(alt)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <>
            {icon}
            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
              {translate(label)}
            </span>
            <span className="text-[10px] text-zinc-400 mt-1">
              {isWide
                ? translate(
                    causeType === "BEHAVIOR"
                      ? "issue.photo_before_hint_behavior"
                      : "issue.photo_before_hint_condition",
                  )
                : translate("issue.photo_detail_optional")}
            </span>
          </>
        )}
      </label>
    );
  }
  return (
    <div className="flex flex-col space-y-2">
      <div className="flex items-center justify-between text-xs font-bold">
        <span className="text-zinc-800 dark:text-zinc-200">{translate(label)}</span>
        <span
          className={`text-[10px] font-black ${isWide ? "text-rose-600 dark:text-rose-400" : "text-zinc-400"}`}
        >
          {translate(isWide ? "issue.photo_wide_required" : "issue.photo_detail_optional")}
        </span>
      </div>
      {preview ? (
        <div className="relative rounded-2xl overflow-hidden aspect-[4/3] border border-zinc-200 dark:border-zinc-700 bg-zinc-950 group">
          <img src={preview} alt={translate(alt)} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
            <button
              type="button"
              onClick={() => onAnnotate?.(isWide ? "wide" : "detail")}
              className="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold shadow-lg hover:bg-rose-700 flex items-center gap-1.5"
            >
              <Pen className="w-3.5 h-3.5" /> <span>{translate("issue.photo_annotate_btn")}</span>
            </button>
            <button
              type="button"
              onClick={() => inputRef?.current?.click()}
              className="px-3 py-1.5 rounded-xl bg-white text-zinc-900 text-xs font-bold shadow-lg hover:bg-zinc-100 flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />{" "}
              <span>{translate("issue.photo_retake_btn")}</span>
            </button>
            <button
              type="button"
              onClick={() => onRemove?.(isWide)}
              className="p-2 rounded-xl bg-zinc-900/80 text-rose-400 hover:text-rose-300 font-bold"
              title={translate("issue.photo_remove_btn")}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <div className="sm:hidden absolute bottom-2 left-2 right-2 flex items-center justify-between bg-black/70 backdrop-blur-md rounded-xl p-1 text-white text-xs">
            <button
              type="button"
              onClick={() => onAnnotate?.(isWide ? "wide" : "detail")}
              className="flex-1 py-1 text-center font-bold text-rose-400 flex items-center justify-center gap-1"
            >
              <Pen className="w-3 h-3" />
              <span>{translate("issue.photo_annotate_btn")}</span>
            </button>
            <span className="text-zinc-600">|</span>
            <button
              type="button"
              onClick={() => inputRef?.current?.click()}
              className="flex-1 py-1 text-center font-bold flex items-center justify-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>{translate("issue.photo_retake_btn")}</span>
            </button>
            <span className="text-zinc-600">|</span>
            <button
              type="button"
              onClick={() => onRemove?.(isWide)}
              className="px-2.5 py-1 text-rose-400"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onDragOver={(event) => {
            event.preventDefault();
            onDragOver?.(isWide);
          }}
          onDragLeave={() => onDragLeave?.(isWide)}
          onDrop={(event) => onDrop?.(event, isWide)}
          onClick={() => inputRef?.current?.click()}
          className={`w-full cursor-pointer border-2 border-dashed rounded-2xl aspect-[4/3] flex flex-col items-center justify-center p-4 text-center transition-all ${dragOver ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 scale-[1.01]" : "border-zinc-300 dark:border-zinc-700 hover:border-blue-500 dark:hover:border-blue-400 bg-zinc-50 dark:bg-zinc-800/40"}`}
        >
          <div
            className={`w-12 h-12 rounded-2xl ${isWide ? "bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"} flex items-center justify-center mb-2 shadow-xs`}
          >
            {icon}
          </div>
          <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
            {translate(label)}
          </span>
          <span className="text-[11px] text-zinc-400 mt-1">
            {dragOver
              ? translate("issue.drop_photo_active")
              : isWide
                ? translate(
                    causeType === "BEHAVIOR"
                      ? "issue.photo_before_hint_behavior"
                      : "issue.photo_before_hint_condition",
                  )
                : translate("issue.drag_drop_photo")}
          </span>
        </button>
      )}
    </div>
  );
}

export function IssueMediaAttachments(props: IssueMediaAttachmentsProps) {
  return (
    <div
      className={`grid ${props.compact ? "grid-cols-2 gap-3" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3.5"}`}
    >
      <PhotoCard
        {...props}
        isWide
        preview={props.previewBefore}
        inputRef={props.wideInputRef}
        dragOver={props.dragOverWide}
      />
      <PhotoCard
        {...props}
        isWide={false}
        preview={props.previewDetail}
        inputRef={props.detailInputRef}
        dragOver={props.dragOverDetail}
      />
    </div>
  );
}
