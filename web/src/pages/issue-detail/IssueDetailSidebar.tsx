import { Package, User } from "lucide-react";
import { AIReviewPanel } from "../../components/AIReviewPanel.tsx";
import { CauseType } from "../../types/index.ts";
import { IssueDetailActionBar } from "./IssueDetailActionBar.tsx";
import { IssueDetailAssignment } from "./IssueDetailAssignment.tsx";
import { IssueDetailDescription } from "./IssueDetailDescription.tsx";
import { IssueDetailScore } from "./IssueDetailScore.tsx";
import type { IssueDetailViewModel } from "./types.ts";

type IssueDetailSidebarView = Pick<
  IssueDetailViewModel,
  | "currentIssue"
  | "isDeleted"
  | "t"
  | "causeType"
  | "statusBadge"
  | "activeTab"
  | "dateLocale"
  | "translatedDesc"
  | "locale"
  | "showOriginal"
  | "translatedLangRef"
  | "tags"
  | "aiEnabled"
  | "isReviewing"
  | "handleAIReview"
  | "isTranslating"
  | "handleTranslate"
  | "aiReview"
  | "followUpQuestion"
  | "selectedProposedTags"
  | "setSelectedProposedTags"
  | "followUpHistory"
  | "followUpLimit"
  | "pendingFollowUpQuestion"
  | "streamingFollowUpAnswer"
  | "setFollowUpQuestion"
  | "isAskingFollowUp"
  | "handleApplySuggestion"
  | "handleFollowUp"
  | "canAssignResponsibility"
  | "isResponsibilityEditing"
  | "setIsResponsibilityEditing"
  | "canVerifyCause"
  | "isCauseVerificationOpen"
  | "setIsCauseVerificationOpen"
  | "assignmentAssetId"
  | "assignmentTeamId"
  | "assignmentAssigneeId"
  | "setAssignmentAssetId"
  | "setAssignmentTeamId"
  | "setAssignmentAssigneeId"
  | "syncCauseWithAssignment"
  | "setSyncCauseWithAssignment"
  | "handleSaveResponsibility"
  | "isSavingResponsibility"
  | "asset"
  | "team"
  | "assigneeLabel"
  | "mayAssign"
  | "membersStatus"
  | "assigneeLookupError"
  | "loadMembers"
  | "causeTeam"
  | "causeStatus"
  | "setCauseStatus"
  | "causeTeamId"
  | "setCauseTeamId"
  | "teams"
  | "isSavingCause"
  | "handleVerifyCause"
  | "issueScoreLogs"
  | "loadingScores"
  | "canResolveIssue"
  | "user"
  | "isSubmitting"
  | "handleResolveOfflineOrOnline"
  | "setShowConfirmAction"
  | "canCloseIssue"
  | "closeDisabledReason"
>;

interface Props {
  view: IssueDetailSidebarView;
}
export function IssueDetailSidebar({ view }: Props) {
  const {
    currentIssue,
    isDeleted,
    t,
    causeType,
    statusBadge,
    activeTab,
    dateLocale,
    translatedDesc,
    locale,
    showOriginal,
    translatedLangRef,
    tags,
    aiEnabled,
    isReviewing,
    handleAIReview,
    isTranslating,
    handleTranslate,
    aiReview,
    followUpQuestion,
    selectedProposedTags,
    setSelectedProposedTags,
    followUpHistory,
    followUpLimit,
    pendingFollowUpQuestion,
    streamingFollowUpAnswer,
    setFollowUpQuestion,
    isAskingFollowUp,
    handleApplySuggestion,
    handleFollowUp,
    canAssignResponsibility,
    isResponsibilityEditing,
    setIsResponsibilityEditing,
    canVerifyCause,
    isCauseVerificationOpen,
    setIsCauseVerificationOpen,
    assignmentAssetId,
    assignmentTeamId,
    assignmentAssigneeId,
    setAssignmentAssetId,
    setAssignmentTeamId,
    setAssignmentAssigneeId,
    syncCauseWithAssignment,
    setSyncCauseWithAssignment,
    handleSaveResponsibility,
    isSavingResponsibility,
    asset,
    team,
    assigneeLabel,
    mayAssign,
    membersStatus,
    assigneeLookupError,
    loadMembers,
    causeTeam,
    causeStatus,
    setCauseStatus,
    causeTeamId,
    setCauseTeamId,
    teams,
    isSavingCause,
    handleVerifyCause,
    issueScoreLogs,
    loadingScores,
    canResolveIssue,
    user,
    isSubmitting,
    handleResolveOfflineOrOnline,
    setShowConfirmAction,
    canCloseIssue,
    closeDisabledReason,
  } = view;

  return (
    <div className="lg:col-span-5 xl:col-span-5 2xl:col-span-4 p-4 lg:p-6 space-y-4 lg:overflow-y-auto bg-zinc-50/50 dark:bg-zinc-900/50 flex flex-col justify-between">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {statusBadge}
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap ${
              causeType === CauseType.BEHAVIOR
                ? "bg-amber-500/10 text-amber-800 dark:text-amber-300"
                : "bg-blue-500/10 text-blue-800 dark:text-blue-300"
            }`}
          >
            {causeType === CauseType.BEHAVIOR ? (
              <User className="h-3 w-3 shrink-0" aria-hidden="true" />
            ) : (
              <Package className="h-3 w-3 shrink-0" aria-hidden="true" />
            )}
            <span>
              {causeType === CauseType.BEHAVIOR
                ? t("issue.badge_behavior")
                : t("issue.badge_condition")}
            </span>
          </span>
          <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
            v{currentIssue.version}
          </span>
        </div>

        <IssueDetailDescription
          currentIssue={currentIssue}
          tags={tags}
          activeTab={activeTab}
          locale={locale}
          dateLocale={dateLocale}
          translatedDesc={translatedDesc}
          showOriginal={showOriginal}
          translatedLangRef={translatedLangRef}
          aiEnabled={aiEnabled}
          isReviewing={isReviewing}
          handleAIReview={handleAIReview}
          isTranslating={isTranslating}
          handleTranslate={handleTranslate}
          t={t}
        />

        {activeTab !== "history" && aiReview && (
          <AIReviewPanel
            review={aiReview}
            currentIssue={currentIssue}
            tags={tags}
            value={followUpQuestion}
            selectedProposedTags={selectedProposedTags}
            onSelectedProposedTagsChange={setSelectedProposedTags}
            followUpCount={followUpHistory.length}
            followUpLimit={followUpLimit}
            followUpHistory={followUpHistory}
            pendingFollowUpQuestion={pendingFollowUpQuestion}
            streamingFollowUpAnswer={streamingFollowUpAnswer}
            onFollowUpQuestionChange={setFollowUpQuestion}
            isAskingFollowUp={isAskingFollowUp}
            onApplySuggestion={handleApplySuggestion}
            onFollowUp={handleFollowUp}
          />
        )}

        <IssueDetailAssignment
          currentIssue={currentIssue}
          activeTab={activeTab}
          canAssignResponsibility={canAssignResponsibility}
          isResponsibilityEditing={isResponsibilityEditing}
          setIsResponsibilityEditing={setIsResponsibilityEditing}
          canVerifyCause={canVerifyCause}
          isCauseVerificationOpen={isCauseVerificationOpen}
          setIsCauseVerificationOpen={setIsCauseVerificationOpen}
          assignmentAssetId={assignmentAssetId}
          setAssignmentAssetId={setAssignmentAssetId}
          assignmentTeamId={assignmentTeamId}
          setAssignmentTeamId={setAssignmentTeamId}
          assignmentAssigneeId={assignmentAssigneeId}
          setAssignmentAssigneeId={setAssignmentAssigneeId}
          syncCauseWithAssignment={syncCauseWithAssignment}
          setSyncCauseWithAssignment={setSyncCauseWithAssignment}
          handleSaveResponsibility={handleSaveResponsibility}
          isSavingResponsibility={isSavingResponsibility}
          asset={asset}
          team={team}
          assigneeLabel={assigneeLabel}
          mayAssign={mayAssign}
          membersStatus={membersStatus}
          assigneeLookupError={assigneeLookupError}
          loadMembers={loadMembers}
          causeTeam={causeTeam}
          causeStatus={causeStatus}
          setCauseStatus={setCauseStatus}
          causeTeamId={causeTeamId}
          setCauseTeamId={setCauseTeamId}
          teams={teams}
          isSavingCause={isSavingCause}
          handleVerifyCause={handleVerifyCause}
          t={t}
        />

        <IssueDetailScore
          currentIssue={currentIssue}
          activeTab={activeTab}
          locale={locale}
          issueScoreLogs={issueScoreLogs}
          loadingScores={loadingScores}
          t={t}
        />
      </div>

      <IssueDetailActionBar
        status={currentIssue.status}
        isDeleted={isDeleted}
        canResolveIssue={canResolveIssue}
        canCloseIssue={canCloseIssue}
        closeDisabledReason={closeDisabledReason}
        causeType={causeType}
        user={user}
        isSubmitting={isSubmitting}
        handleResolveOfflineOrOnline={handleResolveOfflineOrOnline}
        setShowConfirmAction={setShowConfirmAction}
        t={t}
      />
    </div>
  );
}
