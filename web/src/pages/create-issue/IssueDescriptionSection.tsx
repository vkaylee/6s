interface IssueDescriptionSectionProps {
  value: string;
  onChange: (value: string) => void;
  translate: (key: string) => string;
}

export function IssueDescriptionSection({
  value,
  onChange,
  translate,
}: IssueDescriptionSectionProps) {
  return (
    <section className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
      <span className="block text-xs font-bold text-zinc-500 uppercase tracking-wider">
        {translate("issue.step_description")}
      </span>
      <textarea
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={translate("issue.description_placeholder")}
        className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3.5 text-base"
      />
    </section>
  );
}
