import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "../../api/client.ts";
import { type DraftIssue, saveDraftIssue } from "../../db/indexeddb.ts";
import { useI18nStore } from "../../i18n/index.ts";
import { modalDialog } from "../../store/dialogStore.ts";
import { syncEngine } from "../../sync/syncEngine.ts";
import {
  CauseType,
  type CauseType as CauseTypeValue,
  detectCauseType,
  IssueCategory,
  type IssueItem,
  isBehaviorTag,
  type LocationItem,
  LocationSnapshotSource,
  type ProposedTagItem,
  SyncStatus,
  type TagItem,
  TagStatus,
} from "../../types/index.ts";
import { compressImage } from "../../utils/compress.ts";
import { haptics } from "../../utils/haptics.ts";
import { resolvePhotoUrl } from "../../utils/photo.ts";
import { generateUuid } from "../../utils/uuid.ts";

export interface UseIssueFormOptions {
  locations: LocationItem[];
  tags: TagItem[];
  initialIssue?: IssueItem | null;
}

export type PhotoTarget = "wide" | "detail";
export type IssueFormValidationError = "category" | "location" | "photo";

export function useIssueForm({ locations, tags, initialIssue }: UseIssueFormOptions) {
  const { t } = useI18nStore();
  const [category, setCategory] = useState<IssueCategory | null>(initialIssue?.category || null);
  const [causeType, setCauseType] = useState<CauseTypeValue>(() =>
    detectCauseType(initialIssue?.category, initialIssue?.tags),
  );
  const [locationCode, setLocationCode] = useState(
    initialIssue?.location_code || locations[0]?.code || "",
  );
  const [selectedTags, setSelectedTags] = useState<string[]>(initialIssue?.tags || []);
  const [description, setDescription] = useState(initialIssue?.description || "");
  const [photoBefore, setPhotoBefore] = useState<Blob | null>(null);
  const [photoDetail, setPhotoDetail] = useState<Blob | null>(null);
  const [previewBefore, setPreviewBefore] = useState<string | null>(
    initialIssue ? resolvePhotoUrl(initialIssue.photo_before, "before") : null,
  );
  const [previewDetail, setPreviewDetail] = useState<string | null>(
    initialIssue?.photo_detail ? resolvePhotoUrl(initialIssue.photo_detail, "detail") : null,
  );
  const [assetId, setAssetId] = useState<number | null>(initialIssue?.asset_id ?? null);
  const [assignedTeamId, setAssignedTeamId] = useState<number | null>(
    initialIssue?.assigned_team_id ?? null,
  );
  const [assigneeId, setAssigneeId] = useState<number | null>(initialIssue?.assignee_id ?? null);
  const [availableTags, setAvailableTags] = useState<TagItem[]>(tags);
  const [proposedTags, setProposedTags] = useState<ProposedTagItem[]>([]);
  const [autoFeedback, setAutoFeedback] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (tags.length === 0) return;
    setAvailableTags((previous) => {
      const existingCodes = new Set(previous.map((tag) => tag.code || tag.tag_code));
      const newItems = tags.filter((tag) => !existingCodes.has(tag.code || tag.tag_code));
      return newItems.length > 0
        ? [...previous, ...newItems]
        : previous.length === 0
          ? tags
          : previous;
    });
  }, [tags]);

  useEffect(() => {
    if (!initialIssue) return;
    setCategory(initialIssue.category);
    setCauseType(detectCauseType(initialIssue.category, initialIssue.tags));
    setLocationCode(initialIssue.location_code);
    setSelectedTags(initialIssue.tags || []);
    setDescription(initialIssue.description || "");
    setPhotoBefore(null);
    setPhotoDetail(null);
    setAssetId(initialIssue.asset_id ?? null);
    setAssignedTeamId(initialIssue.assigned_team_id ?? null);
    setAssigneeId(initialIssue.assignee_id ?? null);
    setPreviewBefore(resolvePhotoUrl(initialIssue.photo_before, "before"));
    setPreviewDetail(
      initialIssue.photo_detail ? resolvePhotoUrl(initialIssue.photo_detail, "detail") : null,
    );
  }, [initialIssue]);

  const selectCategory = useCallback((nextCategory: IssueCategory) => {
    setCategory(nextCategory);
    if (nextCategory === IssueCategory.S5) setCauseType(CauseType.BEHAVIOR);
    else if (nextCategory !== IssueCategory.S6) setCauseType(CauseType.CONDITION);
    if (nextCategory === IssueCategory.S6) haptics.safetyAlert();
    else haptics.success();
  }, []);

  const toggleTag = useCallback(
    (tagCode: string) => {
      haptics.success();
      const tag = availableTags.find((item) => (item.code || item.tag_code) === tagCode);
      if (tag && isBehaviorTag(tagCode, tag.category)) setCauseType(CauseType.BEHAVIOR);
      setSelectedTags((previous) => {
        if (previous.includes(tagCode)) return previous.filter((code) => code !== tagCode);
        return [...previous, tagCode];
      });
      if (tag?.category && Object.values(IssueCategory).includes(tag.category as IssueCategory)) {
        const mappedCategory = tag.category as IssueCategory;
        setCategory(mappedCategory);
        setAutoFeedback(mappedCategory);
        setTimeout(() => setAutoFeedback(null), 2500);
      }
    },
    [availableTags],
  );

  const addCustomTag = useCallback(
    (newTag: TagItem) => {
      const code = newTag.code || newTag.tag_code;
      if (!code) return;
      setAvailableTags((previous) => [{ ...newTag, status: TagStatus.PENDING }, ...previous]);
      setProposedTags((previous) => {
        if (previous.some((tag) => tag.name_vi === newTag.name_vi)) return previous;
        return [
          ...previous,
          {
            name_vi: newTag.name_vi || code,
            name_zh: newTag.name_zh || newTag.name_vi || code,
            name_en: newTag.name_en || newTag.name_vi || code,
            category: newTag.category || category || IssueCategory.S3,
          },
        ];
      });
    },
    [category],
  );

  const processImageFile = useCallback(
    async (file: File | Blob, isWide: boolean): Promise<PhotoTarget | undefined> => {
      try {
        const compressed = await compressImage(file, { maxDimension: 1280, quality: 0.7 });
        const previewUrl = URL.createObjectURL(compressed);
        if (isWide) {
          setPhotoBefore(compressed);
          setPreviewBefore(previewUrl);
        } else {
          setPhotoDetail(compressed);
          setPreviewDetail(previewUrl);
        }
        haptics.success();
        return isWide ? "wide" : "detail";
      } catch {
        haptics.errorOrConflict();
        modalDialog.alert(t("issue.compress_error"));
        return undefined;
      }
    },
    [t],
  );

  const handleCapturePhoto = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>, isWide: boolean) => {
      const file = event.target.files?.[0];
      if (file) await processImageFile(file, isWide);
    },
    [processImageFile],
  );

  const filteredTags = useMemo(
    () => availableTags.filter((tag) => !tag.category || (category && tag.category === category)),
    [availableTags, category],
  );

  const getValidationError = useCallback(
    (requirePhoto = true): IssueFormValidationError | undefined => {
      if (!category) return "category";
      if (!locationCode) return "location";
      if (requirePhoto && !photoBefore) return "photo";
      return undefined;
    },
    [category, locationCode, photoBefore],
  );

  const submitIssue = useCallback(
    async (onSuccess: (updatedIssue?: IssueItem) => void, requirePhoto = !initialIssue) => {
      const validationError = getValidationError(requirePhoto);
      if (validationError) {
        const messages: Record<IssueFormValidationError, string> = {
          category: "issue.missing_category",
          location: "issue.missing_location",
          photo: "issue.missing_photo",
        };
        modalDialog.alert(t(messages[validationError]));
        return false;
      }

      setIsSubmitting(true);
      try {
        if (initialIssue) {
          const formData = new FormData();
          formData.append("category", category as string);
          formData.append("cause_type", causeType);
          formData.append("location_code", locationCode);
          formData.append("description", description.trim());
          formData.append("tags", JSON.stringify(selectedTags));
          if (photoBefore) formData.append("photo_before", photoBefore, "before.jpg");
          if (photoDetail) formData.append("photo_detail", photoDetail, "detail.jpg");
          const classificationUpdated = await apiClient<IssueItem>(
            `/api/issues/${initialIssue.id}`,
            {
              method: "PATCH",
              body: formData,
            },
          );
          const responsibilityChanged =
            assetId !== (initialIssue.asset_id ?? null) ||
            assignedTeamId !== (initialIssue.assigned_team_id ?? null) ||
            assigneeId !== (initialIssue.assignee_id ?? null);
          const updated = responsibilityChanged
            ? await apiClient<IssueItem>(`/api/issues/${initialIssue.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  expected_version: classificationUpdated?.version ?? initialIssue.version,
                  asset_id: assetId,
                  assigned_team_id: assignedTeamId,
                  assignee_id: assigneeId,
                }),
              })
            : classificationUpdated;
          haptics.success();
          onSuccess(updated);
        } else {
          const capturedLocation = locations.find((location) => location.code === locationCode);
          const newDraft: DraftIssue = {
            client_uuid: generateUuid(),
            category: category as IssueCategory,
            cause_type: causeType,
            location_code: locationCode,
            location_name_vi_snapshot: capturedLocation?.name_vi,
            location_name_zh_snapshot: capturedLocation?.name_zh,
            location_name_en_snapshot: capturedLocation?.name_en,
            location_snapshot_source: capturedLocation
              ? LocationSnapshotSource.CLIENT_CAPTURE
              : undefined,
            asset_id: assetId,
            assigned_team_id: assignedTeamId,
            assignee_id: assigneeId,
            tags: selectedTags,
            proposed_tags: proposedTags.length ? proposedTags : undefined,
            description: description.trim(),
            photo_before_blob: photoBefore as Blob,
            photo_detail_blob: photoDetail || undefined,
            created_at: Date.now(),
            sync_status: SyncStatus.PENDING,
          };
          await saveDraftIssue(newDraft);
          haptics.success();
          syncEngine.triggerSync();
          onSuccess();
        }
        return true;
      } catch {
        haptics.errorOrConflict();
        modalDialog.alert(t(initialIssue ? "issue.update_error" : "issue.draft_save_error"));
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      getValidationError,
      initialIssue,
      t,
      category,
      causeType,
      locationCode,
      description,
      selectedTags,
      photoBefore,
      photoDetail,
      assetId,
      assignedTeamId,
      assigneeId,
      locations,
      proposedTags,
    ],
  );

  return {
    category,
    setCategory,
    causeType,
    setCauseType,
    locationCode,
    setLocationCode,
    selectedTags,
    setSelectedTags,
    description,
    setDescription,
    photoBefore,
    setPhotoBefore,
    photoDetail,
    setPhotoDetail,
    previewBefore,
    setPreviewBefore,
    previewDetail,
    setPreviewDetail,
    assetId,
    setAssetId,
    assignedTeamId,
    setAssignedTeamId,
    assigneeId,
    setAssigneeId,
    availableTags,
    filteredTags,
    proposedTags,
    autoFeedback,
    isSubmitting,
    selectCategory,
    toggleTag,
    addCustomTag,
    processImageFile,
    handleCapturePhoto,
    getValidationError,
    submitIssue,
  };
}
