export interface BlogCategorySummary {
  name: string;
  count: number;
}

/** Collapse case and spacing so "Dry Eye", "dry  eye" and "DRY EYE" count as one category. */
function categoryKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function parseBlocks(value: unknown): any {
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return null; }
  }
  return value && typeof value === 'object' ? value : null;
}

/**
 * Category names a blog uses. Template 1/2 keep it in blocks.hero.category; Custom Template blogs keep it on
 * their Hero custom instance(s). Deliberately lenient (no schema validation) so one malformed blog never
 * hides the others' categories.
 */
export function extractBlogCategories(blocksJson: unknown): string[] {
  const doc = parseBlocks(blocksJson);
  if (!doc) return [];
  const names: unknown[] = [doc.blocks?.hero?.category];
  const instances = doc.custom_instances;
  if (instances && typeof instances === 'object') {
    for (const instance of Object.values(instances as Record<string, any>)) {
      if (instance?.componentKey === 'hero') names.push(instance.category);
    }
  }
  return names
    .filter((name): name is string => typeof name === 'string')
    .map((name) => name.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
}

/**
 * Distinct categories across blogs. Each entry of `blogsBlocks` is ONE blog's block documents (e.g. its draft and
 * its published version), so a blog is counted once per category. The most used spelling is shown; ties keep the
 * first one seen. Sorted by popularity, then alphabetically.
 */
export function aggregateBlogCategories(blogsBlocks: unknown[][]): BlogCategorySummary[] {
  const groups = new Map<string, { count: number; spellings: Map<string, number> }>();
  for (const blocksOfBlog of blogsBlocks) {
    const seenForBlog = new Set<string>();
    for (const blocks of blocksOfBlog) {
      for (const name of extractBlogCategories(blocks)) {
        const key = categoryKey(name);
        const group = groups.get(key) ?? { count: 0, spellings: new Map<string, number>() };
        group.spellings.set(name, (group.spellings.get(name) ?? 0) + 1);
        if (!seenForBlog.has(key)) {
          group.count += 1;
          seenForBlog.add(key);
        }
        groups.set(key, group);
      }
    }
  }
  return [...groups.values()]
    .map((group) => ({
      name: [...group.spellings.entries()].sort((a, b) => b[1] - a[1])[0]![0],
      count: group.count
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
