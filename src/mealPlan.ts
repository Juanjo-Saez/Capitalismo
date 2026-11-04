export type MealSlot = 'lunch' | 'dinner';

export type Recipe = {
  id: string;
  name: string;
  allowed: MealSlot[];
  prepMinutes: number | null;
  note: string;
  archived: boolean;
  createdAt: number;
};

export type RecipeEntry = { status: 'recipe'; recipeId: string; recipeName: string; locked: boolean };

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

// Fills empty and unlocked slots. Locked recipes are kept and excluded from the week.
export const generateWeek = (
  entries: Record<string, MealEntry>,
  weekStart: string,
  recipes: Recipe[],
): GenerationResult => {
  const slots = getWeekDates(weekStart).flatMap((date) =>
    MEAL_SLOTS.map((slot) => ({ key: slotKey(date, slot), slot })),
  );
  const fixedRecipeIds = new Set(
    slots.flatMap(({ key }) => {
      const entry = getEntry(entries, key);
      return entry.status === 'recipe' && entry.locked ? [entry.recipeId] : [];
    }),
  );
  const openSlots = shuffle(
    slots.filter(({ key }) => {
      const entry = getEntry(entries, key);
      return entry.status === 'empty' || (entry.status === 'recipe' && !entry.locked);
    }),
  );
  const candidates = shuffle(recipes.filter((recipe) => !recipe.archived && !fixedRecipeIds.has(recipe.id)));
  const candidatesBySlot = openSlots.map(({ slot }) => candidates.filter((recipe) => isRecipeEligible(recipe, slot)));

  // Augmenting paths fill the most slots possible without repeating a recipe.
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
      nextEntries[key] = { status: 'recipe', recipeId: recipe.id, recipeName: recipe.name, locked: false };
    } else {
      delete nextEntries[key];
      unfilled[slot] += 1;
    }
  });
  return { entries: nextEntries, unfilled };
};

export const pickAlternative = (
  entries: Record<string, MealEntry>,
  key: string,
  slot: MealSlot,
  recipes: Recipe[],
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
  return options.length > 0 ? options[Math.floor(Math.random() * options.length)] : null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isSlot = (value: unknown): value is MealSlot => value === 'lunch' || value === 'dinner';

export const parseRecipes = (value: unknown): Recipe[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown): Recipe[] => {
    if (!isRecord(item)) return [];
    const { id, name, allowed: rawAllowed, prepMinutes, note, archived, createdAt } = item;
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
        archived: archived === true,
        createdAt: typeof createdAt === 'number' ? createdAt : Date.now(),
      },
    ];
  });
};

const parseEntry = (value: unknown): MealEntry | null => {
  if (!isRecord(value)) return null;
  const { status, recipeId, recipeName, locked } = value;
  if (status === 'out') return { status: 'out' };
  if (status === 'skipped') return { status: 'skipped' };
  if (status === 'recipe' && typeof recipeId === 'string' && typeof recipeName === 'string') {
    return { status: 'recipe', recipeId, recipeName, locked: locked === true };
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
