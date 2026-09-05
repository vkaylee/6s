import type { ReactNode } from "react";

interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

export function PageContainer({ children, className = "" }: PageContainerProps) {
  return <div className={`max-w-4xl mx-auto px-4 ${className}`.trim()}>{children}</div>;
}
