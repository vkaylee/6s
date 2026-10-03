import { PageContainer } from "../../components/PageContainer.tsx";
import type { IssueCategory } from "../../types/index.ts";
import { IssueSubmitButton } from "./IssueSubmitButton.tsx";

interface IssueMobileSubmitBarProps {
  category: IssueCategory | null;
  isSubmitting: boolean;
  onSubmit: () => void;
  translate: (key: string) => string;
}

export function IssueMobileSubmitBar({
  category,
  isSubmitting,
  onSubmit,
  translate,
}: IssueMobileSubmitBarProps) {
  return (
    <div className="lg:hidden fixed bottom-0 inset-x-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] z-30">
      <PageContainer>
        <IssueSubmitButton
          category={category}
          isSubmitting={isSubmitting}
          onClick={onSubmit}
          translate={translate}
        />
      </PageContainer>
    </div>
  );
}
