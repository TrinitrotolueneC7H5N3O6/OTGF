"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { FeedbackKind, FeedbackPost } from "@/lib/types";
import { IconChevronUp } from "@/components/shared/Icons";

interface FeedbackBoardPanelProps {
  posts: FeedbackPost[];
  authorId: string;
  authorName: string;
  onCreate: (post: FeedbackPost) => void;
  onComment: (postId: string, body: string) => void;
  onVote: (postId: string) => void;
}

const KINDS: { id: FeedbackKind; label: string }[] = [
  { id: "idea", label: "Idea" },
  { id: "issue", label: "Issue" },
  { id: "other", label: "Other" },
];

const FILTERS: { id: "all" | FeedbackKind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "idea", label: "Ideas" },
  { id: "issue", label: "Issues" },
  { id: "other", label: "Other" },
];

function kindLabel(kind: FeedbackKind) {
  return KINDS.find((item) => item.id === kind)?.label ?? "Idea";
}

function postedLabel(iso: string) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(ms));
}

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function FeedbackBoardPanel({
  posts,
  authorId,
  authorName,
  onCreate,
  onComment,
  onVote,
}: FeedbackBoardPanelProps) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [kind, setKind] = useState<FeedbackKind>("idea");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const visible = useMemo(() => {
    const filtered = posts.filter((item) => filter === "all" || item.kind === filter);
    return [...filtered].sort((a, b) => {
      const votes = b.voterIds.length - a.voterIds.length;
      if (votes) return votes;
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    });
  }, [filter, posts]);

  function submitPost(event: FormEvent) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) return;
    const post: FeedbackPost = {
      id: newId("fb"),
      kind,
      title: nextTitle,
      body: body.trim(),
      authorId,
      authorName,
      createdAt: new Date().toISOString(),
      voterIds: [authorId],
      comments: [],
    };
    onCreate(post);
    setTitle("");
    setBody("");
    setKind("idea");
    setOpenId(post.id);
  }

  function submitComment(postId: string) {
    const next = (drafts[postId] ?? "").trim();
    if (!next) return;
    onComment(postId, next);
    setDrafts((current) => ({ ...current, [postId]: "" }));
  }

  return (
    <div className="dashboard-panel-body schedule-panel feedback-board">
      <header className="schedule-chrome">
        <div className="schedule-chrome-title">
          <h2 className="dashboard-panel-title">Feedback board</h2>
          <p>{posts.length} {posts.length === 1 ? "post" : "posts"} from the team</p>
        </div>
        <div className="schedule-toolbar">
          <div className="insights-range schedule-filters" role="tablist" aria-label="Filter feedback">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                className={filter === item.id ? "is-on" : undefined}
                aria-selected={filter === item.id}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <form className="feedback-compose" onSubmit={submitPost}>
        <div className="insights-range" role="group" aria-label="Post type">
          {KINDS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={kind === item.id ? "is-on" : undefined}
              onClick={() => setKind(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What’s on your mind?"
          maxLength={120}
          aria-label="Title"
        />
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Add a little context if it helps."
          rows={3}
          maxLength={4000}
          aria-label="Details"
        />
        <div className="feedback-compose-actions">
          <button type="submit" className="btn-solid" disabled={!title.trim()}>
            Post
          </button>
        </div>
      </form>

      {visible.length === 0 ? (
        <p className="dashboard-empty">
          {posts.length === 0
            ? "Share an idea or an issue. The team can comment and upvote it."
            : "Nothing in this view."}
        </p>
      ) : (
        <ul className="feedback-list">
          {visible.map((item) => {
            const open = openId === item.id;
            const voted = item.voterIds.includes(authorId);
            return (
              <li key={item.id} className={`feedback-card${open ? " is-open" : ""}`}>
                <button
                  type="button"
                  className={`feedback-vote${voted ? " is-on" : ""}`}
                  aria-pressed={voted}
                  aria-label={voted ? "Remove upvote" : "Upvote"}
                  onClick={() => onVote(item.id)}
                >
                  <IconChevronUp size={16} />
                  <span>{item.voterIds.length}</span>
                </button>
                <div className="feedback-card-body">
                  <button
                    type="button"
                    className="feedback-card-main"
                    onClick={() => setOpenId(open ? null : item.id)}
                    aria-expanded={open}
                  >
                    <span className={`feedback-kind is-${item.kind}`}>{kindLabel(item.kind)}</span>
                    <strong>{item.title}</strong>
                    {item.body ? <p>{item.body}</p> : null}
                    <span className="feedback-card-meta">
                      {item.authorName} · {postedLabel(item.createdAt)} · {item.comments.length} {item.comments.length === 1 ? "comment" : "comments"}
                    </span>
                  </button>
                  {open ? (
                    <div className="feedback-comments">
                      {item.comments.length ? (
                        <ul>
                          {item.comments.map((comment) => (
                            <li key={comment.id}>
                              <strong>{comment.authorName}</strong>
                              <span>{postedLabel(comment.createdAt)}</span>
                              <p>{comment.body}</p>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="feedback-comments-empty">No comments yet.</p>
                      )}
                      <div className="feedback-comment-form">
                        <textarea
                          value={drafts[item.id] ?? ""}
                          onChange={(event) =>
                            setDrafts((current) => ({ ...current, [item.id]: event.target.value }))
                          }
                          placeholder="Write a comment"
                          rows={2}
                          maxLength={2000}
                          aria-label="Comment"
                        />
                        <button
                          type="button"
                          className="btn-solid"
                          disabled={!(drafts[item.id] ?? "").trim()}
                          onClick={() => submitComment(item.id)}
                        >
                          Comment
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
