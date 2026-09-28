import { ImageAnnotatorModal } from "../../components/ImageAnnotatorModal.tsx";

interface IssueAnnotatorModalProps {
  target: "wide" | "detail" | null;
  previewBefore: string | null;
  previewDetail: string | null;
  onSave: (blob: Blob, previewUrl: string, target: "wide" | "detail") => void;
  onClose: () => void;
  translate: (key: string) => string;
}

export function IssueAnnotatorModal({
  target,
  previewBefore,
  previewDetail,
  onSave,
  onClose,
  translate,
}: IssueAnnotatorModalProps) {
  if (!target) return null;
  const title = translate("issue.annotator_title");
  return (
    <ImageAnnotatorModal
      imageUrl={target === "wide" ? previewBefore || "" : previewDetail || ""}
      isOpen
      title={{
        vi: title,
        en: title,
        zh: title,
      }}
      onSave={(blob, preview) => onSave(blob, preview, target)}
      onClose={onClose}
    />
  );
}
