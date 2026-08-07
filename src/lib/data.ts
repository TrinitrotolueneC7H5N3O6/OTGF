import type { Artifact, LibraryCategory } from "./types";

export const defaultCategories: LibraryCategory[] = [
  { id: "cat-styles", name: "Styles" },
  { id: "cat-dishes", name: "Dishes" },
  { id: "cat-menus", name: "Menus" },
  { id: "cat-before-after", name: "Before / after" },
  { id: "cat-space", name: "Space" },
];

/** Legacy seed artifact ids — stripped on normalize so old spaces start empty. */
export const legacyDefaultArtifactIds = new Set([
  "a1",
  "a2",
  "a3",
  "a4",
  "a5",
  "a6",
  "a7",
  "a8",
]);

export const defaultArtifacts: Artifact[] = [];
