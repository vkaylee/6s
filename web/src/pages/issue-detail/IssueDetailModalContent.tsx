import type React from "react";
import { CreateIssueModal } from "../CreateIssueModal.tsx";
import { IssueDetailConfirmation } from "./IssueDetailConfirmation.tsx";
import { IssueDetailHeader } from "./IssueDetailHeader.tsx";
import { IssueDetailMedia } from "./IssueDetailMedia.tsx";
import { IssueDetailSidebar } from "./IssueDetailSidebar.tsx";
import { IssuePhotoPreviewDialog } from "./IssuePhotoPreviewDialog.tsx";
import type { IssueDetailModalProps } from "./types.ts";
import { useIssueDetailModal } from "./useIssueDetailModal.tsx";

export function IssueDetailModal(props: IssueDetailModalProps) {
  const view = useIssueDetailModal(props);
  if (!props.isOpen) return null;
  const {
    t,
    dialogRef,
    currentIssue,
    locations,
    tags,
    isEditingFull,
    setIsEditingFull,
    setCurrentIssue,
    onRefresh,
    previewIndex,
    setPreviewIndex,
    photoList,
    onClose,
  } = view;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 2xl:p-8 bg-black/70 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <button
        type="button"
        aria-label={t("common.close")}
        onClick={onClose}
        className="fixed inset-0 w-full h-full cursor-default bg-transparent -z-10"
        tabIndex={-1}
      />
      <div
        ref={dialogRef as React.RefObject<HTMLDivElement>}
        role="dialog"
        aria-modal="true"
        aria-labelledby="issue-detail-modal-title"
        tabIndex={-1}
        className="flex w-full max-w-none sm:max-w-lg lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl flex-col overflow-hidden rounded-none sm:rounded-3xl border-0 sm:border border-zinc-200 dark:border-zinc-800 bg-white shadow-2xl dark:bg-zinc-900 h-[100dvh] sm:h-auto max-h-[100dvh] sm:max-h-[calc(100dvh-2rem)] lg:max-h-[90vh] 2xl:max-h-[85vh] my-0 sm:my-auto"
      >
        <IssueDetailHeader
          view={{
            currentIssue: view.currentIssue,
            t: view.t,
            canEdit: view.canEdit,
            setIsEditingCategory: view.setIsEditingCategory,
            setIsEditingLocation: view.setIsEditingLocation,
            isEditingCategory: view.isEditingCategory,
            locations: view.locations,
            isEditingLocation: view.isEditingLocation,
            handleQuickChangeCategory: view.handleQuickChangeCategory,
            handleQuickChangeLocation: view.handleQuickChangeLocation,
            locale: view.locale,
            resolvedLocationName: view.resolvedLocationName,
            isDeleted: view.isDeleted,
            canDeleteIssue: view.canDeleteIssue,
            canRestoreIssue: view.canRestoreIssue,
            actionMenuRef: view.actionMenuRef,
            isActionMenuOpen: view.isActionMenuOpen,
            setIsActionMenuOpen: view.setIsActionMenuOpen,
            mutationsOnline: view.mutationsOnline,
            isSubmitting: view.isSubmitting,
            recoveryPending: view.recoveryPending,
            setShowConfirmAction: view.setShowConfirmAction,
            setIsEditingFull: view.setIsEditingFull,
            onClose: view.onClose,
            activeTab: view.activeTab,
            setActiveTab: view.setActiveTab,
          }}
        />
        <div className="flex-1 overflow-y-auto overflow-x-hidden lg:overflow-hidden flex flex-col lg:grid lg:grid-cols-12 min-h-0">
          <IssueDetailMedia
            view={{
              currentIssue: view.currentIssue,
              t: view.t,
              anyPhotoError: view.anyPhotoError,
              photoList: view.photoList,
              setPreviewIndex: view.setPreviewIndex,
              setBeforePhotoError: view.setBeforePhotoError,
              setDetailPhotoError: view.setDetailPhotoError,
            }}
          />
          <IssueDetailSidebar view={view} />
        </div>
        <IssueDetailConfirmation
          view={{
            showConfirmAction: view.showConfirmAction,
            t: view.t,
            setShowConfirmAction: view.setShowConfirmAction,
            deleteReason: view.deleteReason,
            setDeleteReason: view.setDeleteReason,
            rejectReason: view.rejectReason,
            setRejectReason: view.setRejectReason,
            mutationsOnline: view.mutationsOnline,
            causeType: view.causeType,
            scoreRating: view.scoreRating,
            setScoreRating: view.setScoreRating,
            canVerifyCause: view.canVerifyCause,
            currentIssue: view.currentIssue,
            closeCauseTeamId: view.closeCauseTeamId,
            setCloseCauseTeamId: view.setCloseCauseTeamId,
            teams: view.teams,
            isSubmitting: view.isSubmitting,
            recoveryPending: view.recoveryPending,
            handleConfirmClose: view.handleConfirmClose,
            handleConfirmReopen: view.handleConfirmReopen,
            handleConfirmInvalid: view.handleConfirmInvalid,
            handleConfirmDelete: view.handleConfirmDelete,
            handleConfirmRestore: view.handleConfirmRestore,
          }}
        />
        {previewIndex !== null && (
          <IssuePhotoPreviewDialog
            previewIndex={previewIndex}
            photoList={photoList}
            onClose={() => setPreviewIndex(null)}
            onSelectIndex={setPreviewIndex}
            t={t}
          />
        )}
      </div>
      {isEditingFull && (
        <CreateIssueModal
          isOpen={isEditingFull}
          onClose={() => setIsEditingFull(false)}
          onSuccess={(updated) => {
            if (updated) setCurrentIssue(updated);
            setIsEditingFull(false);
            onRefresh();
          }}
          locations={locations}
          tags={tags}
          initialIssue={currentIssue}
        />
      )}
    </div>
  );
}
