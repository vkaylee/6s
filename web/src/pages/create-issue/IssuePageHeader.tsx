import { ArrowLeft, Clock } from "lucide-react";
import { PageContainer } from "../../components/PageContainer.tsx";

interface IssuePageHeaderProps {
  lastDraftTime: string | null;
  onBack: () => void;
  translate: (key: string, params?: Record<string, string>) => string;
}

export function IssuePageHeader({ lastDraftTime, onBack, translate }: IssuePageHeaderProps) {
  return (
    <PageContainer className="pt-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 -ml-2 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label={translate("issue.back_aria")}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full bg-rose-600 animate-pulse" />
            <h1 className="text-lg font-black">{translate("issue.create_title")}</h1>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {lastDraftTime && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-[11px] font-medium text-zinc-500">
              <Clock className="w-3.5 h-3.5 text-zinc-400" />
              <span>{translate("issue.draft_saved_at", { time: lastDraftTime })}</span>
            </div>
          )}
          <button
            type="button"
            onClick={onBack}
            className="text-xs font-bold text-zinc-500 px-2 py-1"
          >
            {translate("common.cancel")}
          </button>
        </div>
      </div>
    </PageContainer>
  );
}
