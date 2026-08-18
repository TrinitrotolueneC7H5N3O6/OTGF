export function ChatSystemLine({
  body,
  at,
  showTime = false,
}: {
  body: string;
  at?: string;
  showTime?: boolean;
}) {
  return (
    <div className="chat-system-line" role="status">
      <p>{body}</p>
      {showTime && at ? <time>{at}</time> : null}
    </div>
  );
}
