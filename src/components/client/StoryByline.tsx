import { storyDateLabel } from "@/lib/storytelling";
import styles from "./StoriesBrowseApp.module.css";

export function PostByline({ business, date }: { business: string; date: string }) {
  const initials = business.replace(/[_-]/g, " ").split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  return (
    <span className={styles.byline}>
      <span className={styles.avatar} aria-hidden="true">{initials || "W"}</span>
      <span className={styles.author}>
        <strong>{business}</strong>
        {date ? <time dateTime={date}>{storyDateLabel(date)}</time> : <span>From our work</span>}
      </span>
    </span>
  );
}

