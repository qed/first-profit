const SEGMENT_COLORS = [
  "bg-sell",
  "bg-build",
  "bg-validate",
  "bg-grow",
  "bg-scale",
] as const;

export function ToolFlowProgress({
  current,
  steps,
}: {
  current: number;
  steps: readonly string[];
}) {
  const safeCurrent = Math.min(Math.max(current, 1), steps.length);
  return (
    <div className="w-full" aria-label={`Step ${safeCurrent} of ${steps.length}: ${steps[safeCurrent - 1]}`}>
      <div className="flex gap-1.5" aria-hidden>
        {steps.map((step, index) => (
          <span
            key={step}
            className={`h-1.5 min-w-0 flex-1 rounded-full transition-colors ${
              index < safeCurrent
                ? SEGMENT_COLORS[index % SEGMENT_COLORS.length]
                : "bg-[hsl(25_34%_20%/0.13)]"
            }`}
          />
        ))}
      </div>
      <p className="mt-2 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[hsl(25_20%_38%)]">
        Step {safeCurrent} of {steps.length} · {steps[safeCurrent - 1]}
      </p>
    </div>
  );
}
