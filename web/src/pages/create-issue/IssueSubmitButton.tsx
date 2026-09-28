import { Check, ShieldAlert } from "lucide-react";
import { IssueCategory } from "../../types/index.ts";

interface IssueSubmitButtonProps {
  category: IssueCategory | null;
  isSubmitting: boolean;
  onClick: () => void;
  translate: (key: string) => string;
}

export function IssueSubmitButton({
  category,
  isSubmitting,
  onClick,
  translate,
}: IssueSubmitButtonProps) {
  const safety = category === IssueCategory.S6;
  return (
    <button
      type="button"
      disabled={isSubmitting}
      onClick={onClick}
      className={`w-full font-black text-base py-4 px-6 rounded-2xl min-h-[64px] flex items-center justify-center space-x-2.5 shadow-xl ${safety ? "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/30 ring-4 ring-rose-500/20 animate-pulse" : "bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-900"}`}
    >
      {safety ? <ShieldAlert className="w-5 h-5" /> : <Check className="w-5 h-5" />}
      <span>
        {isSubmitting
          ? translate("issue.saving")
          : safety
            ? translate("issue.submit_safety")
            : translate("issue.submit_standard")}
      </span>
    </button>
  );
}
