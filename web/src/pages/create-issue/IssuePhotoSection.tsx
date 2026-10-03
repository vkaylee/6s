import type { RefObject } from "react";
import { IssueMediaAttachments } from "./IssueMediaAttachments.tsx";

interface IssuePhotoSectionProps {
  causeType: Parameters<typeof IssueMediaAttachments>[0]["causeType"];
  previewBefore: string | null;
  previewDetail: string | null;
  translate: (key: string) => string;
  onCapture: (event: React.ChangeEvent<HTMLInputElement>, isWide: boolean) => void;
  onDrop?: (event: React.DragEvent<HTMLElement>, isWide: boolean) => void;
  onRemove: (isWide: boolean) => void;
  onAnnotate: (target: "wide" | "detail") => void;
  wideInputRef: RefObject<HTMLInputElement>;
  detailInputRef: RefObject<HTMLInputElement>;
  dragOverWide: boolean;
  dragOverDetail: boolean;
  onDragOver: (isWide: boolean) => void;
  onDragLeave: (isWide: boolean) => void;
  touched: boolean;
  photoError: boolean;
}

export function IssuePhotoSection({
  causeType,
  previewBefore,
  previewDetail,
  translate,
  onCapture,
  onDrop,
  onRemove,
  onAnnotate,
  wideInputRef,
  detailInputRef,
  dragOverWide,
  dragOverDetail,
  onDragOver,
  onDragLeave,
  touched,
  photoError,
}: IssuePhotoSectionProps) {
  return (
    <section
      className={`bg-white dark:bg-zinc-900 rounded-3xl p-5 border shadow-sm space-y-3 ${touched && photoError ? "border-rose-500 ring-2 ring-rose-500/20" : "border-zinc-200 dark:border-zinc-800"}`}
    >
      <div className="flex items-center justify-between">
        <span className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">
          {translate("issue.step_photos")}
        </span>
        {touched && photoError && (
          <span className="text-xs font-bold text-rose-600 animate-pulse">
            * {translate("issue.missing_photo")}
          </span>
        )}
      </div>
      <IssueMediaAttachments
        causeType={causeType}
        previewBefore={previewBefore}
        previewDetail={previewDetail}
        translate={translate}
        onCapture={onCapture}
        onDrop={onDrop}
        onRemove={onRemove}
        onAnnotate={onAnnotate}
        wideInputRef={wideInputRef}
        detailInputRef={detailInputRef}
        dragOverWide={dragOverWide}
        dragOverDetail={dragOverDetail}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      />
    </section>
  );
}
