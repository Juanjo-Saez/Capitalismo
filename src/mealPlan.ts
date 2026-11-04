export type MealSlot = 'lunch' | 'dinner';

export type Recipe = {
  id: string;
  name: string;
  allowed: MealSlot[];
  prepMinutes: number | null;
  note: string;
  tags: string[];
  archived: boolean;
  createdAt: number;
};

export type RecipeEntry = {
  status: 'recipe';
  recipeId: string;
  recipeName: string;
  tags: string[];
  locked: boolean;
};

export type MealEntry = { status: 'empty' } | { status: 'out' } | { status: 'skipped' } | RecipeEntry;

export type MealWeek = {
  weekStart: string;
  entries: Record<string, MealEntry>;
};

export type GenerationResult = {
  entries: Record<string, MealEntry>;
  unfilled: Record<MealSlot, number>;
};

export const MEAL_SLOTS: MealSlot[] = ['lunch', 'dinner'];
export const SLOT_LABELS: Record<MealSlot, string> = { lunch: 'Comida', dinner: 'Cena' };

const EMPTY_ENTRY: MealEntry = { status: 'empty' };

const pad = (value: number) => String(value).padStart(2, '0');

export const toDateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const addDays = (dateKey: string, days: number) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return toDateKey(new Date(year, month - 1, day + days));
};

export const getWeekDates = (weekStart: string) => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

// Next Monday strictly after the given date; on Sunday it returns tomorrow.
export const getNextWeekStart = (from: Date) => {
  const daysUntilMonday = ((8 - from.getDay()) % 7) || 7;
  return toDateKey(new Date(from.getFullYear(), from.getMonth(), from.getDate() + daysUntilMonday));
};

export const slotKey = (dateKey: string, slot: MealSlot) => `${dateKey}:${slot}`;

export const getEntry = (entries: Record<string, MealEntry>, key: string): MealEntry => entries[key] ?? EMPTY_ENTRY;

export const isRecipeEligible = (recipe: Recipe, slot: MealSlot) => !recipe.archived && recipe.allowed.includes(slot);

export const isRecipeUsed = (entries: Record<string, MealEntry>, recipeId: string, exceptKey: string) =>
  Object.entries(entries).some(
    ([key, entry]) => key !== exceptKey && entry.status === 'recipe' && entry.recipeId === recipeId,
  );

export const createMealId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const shuffle = <T,>(items: T[]): T[] => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
};

export type VarietyPrefs = { separateSimilar: boolean; tagLimits: Record<string, number> };

const DEFAULT_VARIETY_PREFS: VarietyPrefs = { separateSimilar: true, tagLimits: {} };

export type PlanContext = {
  weekStart: string;
  // Entries of neighbouring weeks: they affect adjacent days and recency only.
  others: Record<string, MealEntry>;
  prefs: VarietyPrefs;
};

export type VarietyConflict =
  | { kind: 'repeat'; tag: string; keys: [string, string] }
  | { kind: 'limit'; tag: string; limit: number; keys: string[] };

type OpenSlot = { key: string; slot: MealSlot };
type PlacedRecipe = { key: string; date: string; tags: string[] };

const GENERATION_ATTEMPTS = 200;
const CONFLICT_WEIGHT = 1000;
const RECENT_WINDOW_DAYS = 28;

export const normalizeTag = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

export const normalizeTags = (values: string[]) => [...new Set(values.map(normalizeTag).filter(Boolean))];

export const parseTagInput = (input: string) => normalizeTags(input.split(','));

const parseTagList = (value: unknown): string[] =>
  Array.isArray(value) ? normalizeTags(value.filter((tag): tag is string => typeof tag === 'string')) : [];

export const makeRecipeEntry = (recipe: Recipe): RecipeEntry => ({
  status: 'recipe',
  recipeId: recipe.id,
  recipeName: recipe.name,
  tags: recipe.tags,
  locked: false,
});

// Only entries inside the recency window and the adjacent days can affect a week.
export const flattenWeeks = (weeks: MealWeek[], weekStart: string): Record<string, MealEntry> => {
  const from = addDays(weekStart, -RECENT_WINDOW_DAYS);
  const to = addDays(weekStart, 7);
  const others: Record<string, MealEntry> = {};
  weeks.forEach((week) => {
    if (week.weekStart === weekStart) return;
    Object.entries(week.entries).forEach(([key, entry]) => {
      const date = key.split(':')[0];
      if (date >= from && date <= to) others[key] = entry;
    });
  });
  return others;
};

export const createPlanContext = (weeks: MealWeek[], weekStart: string, prefs: VarietyPrefs): PlanContext => ({
  weekStart,
  others: flattenWeeks(weeks, weekStart),
  prefs,
});

const placedRecipes = (entries: Record<string, MealEntry>): PlacedRecipe[] =>
  Object.entries(entries).flatMap(([key, entry]) =>
    entry.status === 'recipe' ? [{ key, date: key.split(':')[0], tags: entry.tags }] : [],
  );

export const findVarietyConflicts = (entries: Record<string, MealEntry>, ctx: PlanContext): VarietyConflict[] => {
  const { weekStart, prefs } = ctx;
  const weekEnd = addDays(weekStart, 6);
  const inWeek = (placed: PlacedRecipe) => placed.date >= weekStart && placed.date <= weekEnd;
  const placed = placedRecipes({ ...ctx.others, ...entries }).filter(
    (item) => item.date >= addDays(weekStart, -1) && item.date <= addDays(weekStart, 7),
  );
  const conflicts: VarietyConflict[] = [];

  if (prefs.separateSimilar) {
    placed.forEach((first, index) => {
      placed.slice(index + 1).forEach((second) => {
        if (!inWeek(first) && !inWeek(second)) return;
        const sameOrNextDay =
          first.date === second.date || addDays(first.date, 1) === second.date || addDays(second.date, 1) === first.date;
        const tag = first.tags.find((item) => second.tags.includes(item));
        if (sameOrNextDay && tag) conflicts.push({ kind: 'repeat', tag, keys: [first.key, second.key] });
      });
    });
  }

  const weekPlaced = placed.filter(inWeek);
  Object.entries(prefs.tagLimits).forEach(([tag, limit]) => {
    const keys = weekPlaced.filter((item) => item.tags.includes(tag)).map((item) => item.key);
    if (keys.length > limit) conflicts.push({ kind: 'limit', tag, limit, keys });
  });
  return conflicts;
};

// Times each recipe was planned in the recent weeks before the target week.
const recentUsage = (ctx: PlanContext): Map<string, number> => {
  const from = addDays(ctx.weekStart, -RECENT_WINDOW_DAYS);
  const counts = new Map<string, number>();
  Object.entries(ctx.others).forEach(([key, entry]) => {
    const date = key.split(':')[0];
    if (entry.status === 'recipe' && date >= from && date < ctx.weekStart) {
      counts.set(entry.recipeId, (counts.get(entry.recipeId) ?? 0) + 1);
    }
  });
  return counts;
};

// Kuhn matching: fills the most slots possible without repeating a recipe.
const proposeWeek = (
  entries: Record<string, MealEntry>,
  openSlots: OpenSlot[],
  candidates: Recipe[],
): GenerationResult => {
  const candidatesBySlot = openSlots.map(({ slot }) => candidates.filter((recipe) => isRecipeEligible(recipe, slot)));
  const ownerByRecipe = new Map<string, number>();
  const assign = (slotIndex: number, visited: Set<string>): boolean => {
    for (const recipe of candidatesBySlot[slotIndex]) {
      if (visited.has(recipe.id)) continue;
      visited.add(recipe.id);
      const owner = ownerByRecipe.get(recipe.id);
      if (owner === undefined || assign(owner, visited)) {
        ownerByRecipe.set(recipe.id, slotIndex);
        return true;
      }
    }
    return false;
  };
  openSlots.forEach((_, slotIndex) => assign(slotIndex, new Set()));

  const recipeById = new Map<string, Recipe>(candidates.map((recipe): [string, Recipe] => [recipe.id, recipe]));
  const recipeBySlot = new Map<number, Recipe>();
  ownerByRecipe.forEach((slotIndex, recipeId) => {
    const recipe = recipeById.get(recipeId);
    if (recipe) recipeBySlot.set(slotIndex, recipe);
  });

  const nextEntries = { ...entries };
  const unfilled: Record<MealSlot, number> = { lunch: 0, dinner: 0 };
  openSlots.forEach(({ key, slot }, slotIndex) => {
    const recipe = recipeBySlot.get(slotIndex);
    if (recipe) {
      nextEntries[key] = makeRecipeEntry(recipe);
    } else {
      delete nextEntries[key];
      unfilled[slot] += 1;
    }
  });
  return { entries: nextEntries, unfilled };
};

// Lower is better: variety conflicts dominate, recent recipes break ties.
const scoreProposal = (proposal: Record<string, MealEntry>, ctx: PlanContext, recentUse: Map<string, number>) => {
  const conflicts = findVarietyConflicts(proposal, ctx).length;
  const recency = Object.values(proposal).reduce(
    (total, entry) => (entry.status === 'recipe' ? total + (recentUse.get(entry.recipeId) ?? 0) : total),
    0,
  );
  return conflicts * CONFLICT_WEIGHT + recency;
};

// Fills empty and unlocked slots. Locked recipes are kept and excluded from the week.
export const generateWeek = (
  entries: Record<string, MealEntry>,
  recipes: Recipe[],
  ctx: PlanContext,
): GenerationResult => {
  const slots: OpenSlot[] = getWeekDates(ctx.weekStart).flatMap((date) =>
    MEAL_SLOTS.map((slot) => ({ key: slotKey(date, slot), slot })),
  );
  const fixedRecipeIds = new Set(
    slots.flatMap(({ key }) => {
      const entry = getEntry(entries, key);
      return entry.status === 'recipe' && entry.locked ? [entry.recipeId] : [];
    }),
  );
  const openSlots = slots.filter(({ key }) => {
    const entry = getEntry(entries, key);
    return entry.status === 'empty' || (entry.status === 'recipe' && !entry.locked);
  });
  if (openSlots.length === 0) return { entries: { ...entries }, unfilled: { lunch: 0, dinner: 0 } };

  const candidates = recipes.filter((recipe) => !recipe.archived && !fixedRecipeIds.has(recipe.id));
  const recentUse = recentUsage(ctx);
  const attempts = Array.from({ length: GENERATION_ATTEMPTS }, () => {
    const proposal = proposeWeek(entries, openSlots, shuffle(candidates));
    return { ...proposal, score: scoreProposal(proposal.entries, ctx, recentUse) };
  });
  const best = attempts.reduce((current, next) => (next.score < current.score ? next : current));
  return { entries: best.entries, unfilled: best.unfilled };
};

// Prefers alternatives that add the fewest variety conflicts, then random.
export const pickAlternative = (
  entries: Record<string, MealEntry>,
  key: string,
  slot: MealSlot,
  recipes: Recipe[],
  ctx: PlanContext,
): Recipe | null => {
  const current = getEntry(entries, key);
  const currentId = current.status === 'recipe' ? current.recipeId : null;
  const usedIds = new Set(
    Object.entries(entries).flatMap(([entryKey, entry]) =>
      entry.status === 'recipe' && entryKey !== key ? [entry.recipeId] : [],
    ),
  );
  const options = recipes.filter(
    (recipe) => isRecipeEligible(recipe, slot) && !usedIds.has(recipe.id) && recipe.id !== currentId,
  );
  if (options.length === 0) return null;

  const scored = options.map((recipe) => ({
    recipe,
    conflicts: findVarietyConflicts({ ...entries, [key]: makeRecipeEntry(recipe) }, ctx).length,
  }));
  const fewest = Math.min(...scored.map((item) => item.conflicts));
  const pool = scored.filter((item) => item.conflicts === fewest);
  return pool[Math.floor(Math.random() * pool.length)].recipe;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isSlot = (value: unknown): value is MealSlot => value === 'lunch' || value === 'dinner';

export const parseRecipes = (value: unknown): Recipe[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown): Recipe[] => {
    if (!isRecord(item)) return [];
    const { id, name, allowed: rawAllowed, prepMinutes, note, tags: rawTags, archived, createdAt } = item;
    if (typeof id !== 'string' || typeof name !== 'string' || !Array.isArray(rawAllowed)) return [];
    const allowed = rawAllowed.filter(isSlot);
    if (allowed.length === 0) return [];
    return [
      {
        id,
        name,
        allowed,
        prepMinutes: typeof prepMinutes === 'number' ? prepMinutes : null,
        note: typeof note === 'string' ? note : '',
        tags: parseTagList(rawTags),
        archived: archived === true,
        createdAt: typeof createdAt === 'number' ? createdAt : Date.now(),
      },
    ];
  });
};

const parseEntry = (value: unknown): MealEntry | null => {
  if (!isRecord(value)) return null;
  const { status, recipeId, recipeName, tags, locked } = value;
  if (status === 'out') return { status: 'out' };
  if (status === 'skipped') return { status: 'skipped' };
  if (status === 'recipe' && typeof recipeId === 'string' && typeof recipeName === 'string') {
    return { status: 'recipe', recipeId, recipeName, tags: parseTagList(tags), locked: locked === true };
  }
  return null;
};

export const parseMealWeeks = (value: unknown): MealWeek[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown): MealWeek[] => {
    if (!isRecord(item)) return [];
    const { weekStart, entries: rawEntries } = item;
    if (typeof weekStart !== 'string' || !isRecord(rawEntries)) return [];
    const entries: Record<string, MealEntry> = {};
    Object.entries(rawEntries).forEach(([key, entry]) => {
      const parsed = parseEntry(entry);
      if (parsed) entries[key] = parsed;
    });
    return [{ weekStart, entries }];
  });
};

export const parseVarietyPrefs = (value: unknown): VarietyPrefs => {
  if (!isRecord(value)) return { ...DEFAULT_VARIETY_PREFS, tagLimits: {} };
  const tagLimits: Record<string, number> = {};
  if (isRecord(value.tagLimits)) {
    Object.entries(value.tagLimits).forEach(([tag, limit]) => {
      const normalized = normalizeTag(tag);
      if (normalized && typeof limit === 'number' && Number.isInteger(limit) && limit > 0) {
        tagLimits[normalized] = limit;
      }
    });
  }
  return { separateSimilar: value.separateSimilar !== false, tagLimits };
};
