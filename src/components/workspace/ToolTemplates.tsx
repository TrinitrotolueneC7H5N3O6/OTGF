export function ToolTemplates({
  help,
  limitMessage,
  disabled,
  templates,
  selectedId,
  onPick,
}: {
  help: string;
  limitMessage?: string;
  disabled?: boolean;
  selectedId?: string;
  templates: { id: string; name: string; blurb: string; meta: string }[];
  onPick: (id: string) => void;
}) {
  return (
    <section className="tool-templates">
      <div className="schedule-card-head">
        <h3>Start from a template</h3>
        <p>{help}</p>
      </div>
      {limitMessage ? <p className="floor-settings-help">{limitMessage}</p> : null}
      <div className="tool-templates-grid">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            className={selectedId === template.id ? "tool-template-card is-active" : "tool-template-card"}
            aria-pressed={selectedId ? selectedId === template.id : undefined}
            disabled={disabled}
            onClick={() => onPick(template.id)}
          >
            <strong>{template.name}</strong>
            <span>{template.blurb}</span>
            <em>{template.meta}</em>
          </button>
        ))}
      </div>
    </section>
  );
}
