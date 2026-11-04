import { Dispatch, FormEvent, SetStateAction, useState } from 'react';
import { Archive, ArchiveRestore, Check, ChevronLeft, ChevronRight, Lock, Pencil, Plus, Shuffle, Undo2, Unlock } from 'lucide-react';
import {
  MEAL_SLOTS,
  MealEntry,
  MealSlot,
  MealWeek,
  Recipe,
  RecipeEntry,
  SLOT_LABELS,
  VarietyConflict,
  VarietyPrefs,
  addDays,
  createMealId,
  createPlanContext,
  findVarietyConflicts,
  generateWeek,
  getEntry,
  getNextWeekStart,
  getWeekDates,
  isRecipeEligible,
  isRecipeUsed,
  makeRecipeEntry,
  normalizeTags,
  parseTagInput,
  pickAlternative,
  slotKey,
} from './mealPlan';
import './MealPlanner.css';

type MealPlannerProps = {
  recipes: Recipe[];
  setRecipes: Dispatch<SetStateAction<Recipe[]>>;
  mealWeeks: MealWeek[];
  setMealWeeks: Dispatch<SetStateAction<MealWeek[]>>;
  varietyPrefs: VarietyPrefs;
  setVarietyPrefs: Dispatch<SetStateAction<VarietyPrefs>>;
  onNotice: (message: string) => void;
};

type MealView = 'week' | 'recipes';
type RecipeFilter = 'all' | MealSlot | 'archived';

type RecipeForm = {
  id: string | null;
  name: string;
  allowed: MealSlot[];
  prepMinutes: string;
  note: string;
  tags: string;
};

type UndoState = { weekStart: string; entries: Record<string, MealEntry> };

const FILTERS: { value: RecipeFilter; label: string }[] = [
  { value: 'all', label: 'Activas' },
  { value: 'lunch', label: 'Comidas' },
  { value: 'dinner', label: 'Cenas' },
  { value: 'archived', label: 'Archivadas' },
];

const formatWeekday = (dateKey: string) =>
  new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(`${dateKey}T12:00:00`));

const formatShortDate = (dateKey: string) =>
  new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(new Date(`${dateKey}T12:00:00`));

const formatWeekdayName = (dateKey: string) =>
  new Intl.DateTimeFormat('es-ES', { weekday: 'long' }).format(new Date(`${dateKey}T12:00:00`));

// Returns undefined when the input is not a positive whole number.
const parsePrepMinutes = (value: string): number | null | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const describeGeneration = (unfilled: Record<MealSlot, number>, conflictCount: number) => {
  const parts = MEAL_SLOTS.filter((slot) => unfilled[slot] > 0).map(
    (slot) => `${unfilled[slot]} ${slot === 'lunch' ? 'comidas' : 'cenas'}`,
  );
  const base =
    parts.length === 0
      ? 'Menú generado sin huecos pendientes.'
      : `Menú generado. Faltan recetas distintas para ${parts.join(' y ')}.`;
  if (conflictCount === 0) return base;
  return `${base} Quedan ${conflictCount} ${conflictCount === 1 ? 'aviso' : 'avisos'} de variedad.`;
};

const selectValue = (entry: MealEntry) => (entry.status === 'recipe' ? entry.recipeId : entry.status);

const describeConflict = (conflict: VarietyConflict, entries: Record<string, MealEntry>) => {
  const label = (key: string) => {
    const [date, slot] = key.split(':') as [string, MealSlot];
    const entry = entries[key];
    const name = entry?.status === 'recipe' ? entry.recipeName : 'receta';
    return `${name} (${formatWeekdayName(date)}, ${SLOT_LABELS[slot].toLowerCase()})`;
  };
  if (conflict.kind === 'repeat') {
    return `«${conflict.tag}»: ${label(conflict.keys[0])} y ${label(conflict.keys[1])}`;
  }
  return `Más de ${conflict.limit} con «${conflict.tag}» esta semana: ${conflict.keys.map(label).join(', ')}`;
};

export function MealPlanner({
  recipes,
  setRecipes,
  mealWeeks,
  setMealWeeks,
  varietyPrefs,
  setVarietyPrefs,
  onNotice,
}: MealPlannerProps) {
  const [view, setView] = useState<MealView>('week');
  const [weekStart, setWeekStart] = useState(() => getNextWeekStart(new Date()));
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [recipeForm, setRecipeForm] = useState<RecipeForm | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<RecipeFilter>('all');

  const entries: Record<string, MealEntry> = mealWeeks.find((week) => week.weekStart === weekStart)?.entries ?? {};
  const dates = getWeekDates(weekStart);
  const hasActiveRecipes = recipes.some((recipe) => !recipe.archived);
  const hasPlannedRecipes = Object.values(entries).some((entry) => entry.status === 'recipe');
  const unlockedCount = Object.values(entries).filter((entry) => entry.status === 'recipe' && !entry.locked).length;
  const canUndo = undoState?.weekStart === weekStart;
  const planContext = createPlanContext(mealWeeks, weekStart, varietyPrefs);
  const allEntries = { ...planContext.others, ...entries };
  const conflicts = findVarietyConflicts(entries, planContext);
  const conflictKeys = new Set(conflicts.flatMap((conflict) => conflict.keys));
  const knownTags = normalizeTags([
    ...recipes.filter((recipe) => !recipe.archived).flatMap((recipe) => recipe.tags),
    ...Object.keys(varietyPrefs.tagLimits),
  ]).sort((a, b) => a.localeCompare(b, 'es'));

  const writeEntries = (nextEntries: Record<string, MealEntry>) => {
    setMealWeeks((current) => [
      ...current.filter((week) => week.weekStart !== weekStart),
      { weekStart, entries: nextEntries },
    ]);
  };

  const changeEntry = (key: string, entry: MealEntry) => {
    const nextEntries = { ...entries };
    if (entry.status === 'empty') {
      delete nextEntries[key];
    } else {
      nextEntries[key] = entry;
    }
    setUndoState(null);
    writeEntries(nextEntries);
  };

  const generate = () => {
    if (!hasActiveRecipes) {
      onNotice('Añade recetas activas en el catálogo antes de generar el menú.');
      return;
    }
    if (unlockedCount > 0 && !window.confirm(`Se sustituirán ${unlockedCount} platos sin bloquear. ¿Continuar?`)) return;
    const result = generateWeek(entries, recipes, planContext);
    setUndoState({ weekStart, entries });
    writeEntries(result.entries);
    onNotice(describeGeneration(result.unfilled, findVarietyConflicts(result.entries, planContext).length));
  };

  const undoGeneration = () => {
    if (!undoState || undoState.weekStart !== weekStart) return;
    writeEntries(undoState.entries);
    setUndoState(null);
    onNotice('Generación deshecha.');
  };

  const toggleLock = (key: string, entry: RecipeEntry) => changeEntry(key, { ...entry, locked: !entry.locked });

  const chooseEntry = (key: string, value: string) => {
    if (value === 'empty' || value === 'out' || value === 'skipped') {
      changeEntry(key, { status: value });
      return;
    }
    const recipe = recipes.find((item) => item.id === value);
    if (!recipe) return;
    if (isRecipeUsed(entries, recipe.id, key)) {
      onNotice(`${recipe.name} ya está en este menú. Se permite, pero revisa la variedad.`);
    }
    changeEntry(key, makeRecipeEntry(recipe));
  };

  const chooseAlternative = (key: string, slot: MealSlot) => {
    const recipe = pickAlternative(entries, key, slot, recipes, planContext);
    if (!recipe) {
      onNotice('No hay otra alternativa disponible para este hueco.');
      return;
    }
    changeEntry(key, makeRecipeEntry(recipe));
  };

  const optionsFor = (slot: MealSlot, entry: MealEntry) => {
    const currentId = entry.status === 'recipe' ? entry.recipeId : null;
    return recipes
      .filter((recipe) => isRecipeEligible(recipe, slot) || recipe.id === currentId)
      .map((recipe) => ({
        value: recipe.id,
        label:
          entry.status === 'recipe' && recipe.id === currentId
            ? entry.recipeName
            : recipe.archived
              ? `${recipe.name} (archivada)`
              : recipe.name,
      }));
  };

  const openNewRecipe = () =>
    setRecipeForm({ id: null, name: '', allowed: [...MEAL_SLOTS], prepMinutes: '', note: '', tags: '' });

  const openEditRecipe = (recipe: Recipe) =>
    setRecipeForm({
      id: recipe.id,
      name: recipe.name,
      allowed: [...recipe.allowed],
      prepMinutes: recipe.prepMinutes ? String(recipe.prepMinutes) : '',
      note: recipe.note,
      tags: recipe.tags.join(', '),
    });

  const updateTagLimit = (tag: string, value: string) => {
    const trimmed = value.trim();
    const limit = Number(trimmed);
    if (trimmed !== '' && (!Number.isInteger(limit) || limit <= 0)) return;
    setVarietyPrefs((current) => {
      const tagLimits = { ...current.tagLimits };
      if (trimmed === '') {
        delete tagLimits[tag];
      } else {
        tagLimits[tag] = limit;
      }
      return { ...current, tagLimits };
    });
  };

  const toggleAllowed = (slot: MealSlot) =>
    setRecipeForm((current) =>
      current && {
        ...current,
        allowed: current.allowed.includes(slot)
          ? current.allowed.filter((item) => item !== slot)
          : [...current.allowed, slot],
      },
    );

  const saveRecipe = (event: FormEvent) => {
    event.preventDefault();
    if (!recipeForm) return;
    const name = recipeForm.name.trim();
    const prepMinutes = parsePrepMinutes(recipeForm.prepMinutes);
    if (!name) {
      onNotice('Añade un nombre para la receta.');
      return;
    }
    if (recipeForm.allowed.length === 0) {
      onNotice('Indica si la receta es para comida, cena o ambas.');
      return;
    }
    if (prepMinutes === undefined) {
      onNotice('El tiempo debe ser un número entero de minutos.');
      return;
    }
    const data = {
      name,
      allowed: recipeForm.allowed,
      prepMinutes,
      note: recipeForm.note.trim(),
      tags: parseTagInput(recipeForm.tags),
    };
    setRecipes((current) =>
      recipeForm.id
        ? current.map((recipe) => (recipe.id === recipeForm.id ? { ...recipe, ...data } : recipe))
        : [...current, { ...data, id: createMealId(), archived: false, createdAt: Date.now() }],
    );
    setRecipeForm(null);
    onNotice('Receta guardada.');
  };

  const toggleArchived = (id: string) => {
    const recipe = recipes.find((item) => item.id === id);
    if (!recipe) return;
    setRecipes((current) => current.map((item) => (item.id === id ? { ...item, archived: !item.archived } : item)));
    onNotice(recipe.archived ? 'Receta reactivada.' : 'Receta archivada. Los menús guardados no cambian.');
  };

  const matchesFilter = (recipe: Recipe) => {
    if (filter === 'archived') return recipe.archived;
    if (recipe.archived) return false;
    return filter === 'all' || recipe.allowed.includes(filter);
  };

  const query = search.trim().toLowerCase();
  const visibleRecipes = recipes
    .filter((recipe) => matchesFilter(recipe) && recipe.name.toLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  return (
    <>
      <div className="segmented-control" role="tablist" aria-label="Vistas de menús">
        <button role="tab" aria-selected={view === 'week'} className={view === 'week' ? 'selected' : ''} onClick={() => setView('week')}>Semana</button>
        <button role="tab" aria-selected={view === 'recipes'} className={view === 'recipes' ? 'selected' : ''} onClick={() => setView('recipes')}>Recetas</button>
      </div>

      {view === 'week' && (
        <section className="meal-view">
          <div className="meal-week-header">
            <button className="icon-button" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Semana anterior" title="Semana anterior">
              <ChevronLeft size={18} />
            </button>
            <div>
              <p className="eyebrow">menú semanal</p>
              <h2>{formatShortDate(dates[0])} – {formatShortDate(dates[6])}</h2>
            </div>
            <button className="icon-button" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Semana siguiente" title="Semana siguiente">
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="meal-actions">
            <button className="primary-button" onClick={generate}>
              <Shuffle size={17} /> {hasPlannedRecipes ? 'Regenerar pendientes' : 'Generar menú'}
            </button>
            {canUndo && <button className="secondary-button" onClick={undoGeneration}><Undo2 size={16} /> Deshacer</button>}
            <span className="form-tip">Bloquea los platos que quieras conservar al regenerar.</span>
          </div>

          {conflicts.length > 0 && (
            <section className="meal-warnings">
              <p className="eyebrow">avisos de variedad</p>
              <ul>
                {conflicts.map((conflict, index) => (
                  <li key={`${conflict.kind}-${conflict.tag}-${index}`}>{describeConflict(conflict, allEntries)}</li>
                ))}
              </ul>
            </section>
          )}

          <div className="meal-days">
            {dates.map((date) => (
              <article className="meal-day" key={date}>
                <h3>{formatWeekday(date)}</h3>
                {MEAL_SLOTS.map((slot) => {
                  const key = slotKey(date, slot);
                  const entry = getEntry(entries, key);
                  const canReplace = entry.status === 'empty' || (entry.status === 'recipe' && !entry.locked);
                  return (
                    <div className={`meal-slot ${conflictKeys.has(key) ? 'is-conflict' : ''}`} key={key}>
                      <span className="meal-slot-label">{SLOT_LABELS[slot]}</span>
                      <select
                        value={selectValue(entry)}
                        onChange={(event) => chooseEntry(key, event.target.value)}
                        aria-label={`${SLOT_LABELS[slot]} del ${formatShortDate(date)}`}
                      >
                        <option value="empty">Pendiente</option>
                        <option value="out">Fuera de casa</option>
                        <option value="skipped">Sin planificar</option>
                        {optionsFor(slot, entry).map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <div className="meal-slot-tools">
                        {canReplace && (
                          <button className="icon-button" onClick={() => chooseAlternative(key, slot)} aria-label="Elegir otra receta" title="Elegir otra receta">
                            <Shuffle size={15} />
                          </button>
                        )}
                        {entry.status === 'recipe' && (
                          <button
                            className={`icon-button ${entry.locked ? 'locked' : ''}`}
                            onClick={() => toggleLock(key, entry)}
                            aria-label={entry.locked ? 'Desbloquear receta' : 'Bloquear receta'}
                            title={entry.locked ? 'Desbloquear' : 'Bloquear'}
                          >
                            {entry.locked ? <Lock size={15} /> : <Unlock size={15} />}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </article>
            ))}
          </div>
        </section>
      )}

      {view === 'recipes' && (
        <section className="meal-view">
          <div className="meal-header-row">
            <div>
              <p className="eyebrow">tu catálogo</p>
              <h2>Recetas</h2>
            </div>
            <button className="primary-button" onClick={openNewRecipe}><Plus size={17} /> Nueva receta</button>
          </div>

          <section className="variety-panel">
            <label className="check-row">
              <input
                type="checkbox"
                checked={varietyPrefs.separateSimilar}
                onChange={(event) => setVarietyPrefs((current) => ({ ...current, separateSimilar: event.target.checked }))}
              />
              <span>Evitar la misma etiqueta el mismo día o en días seguidos</span>
            </label>
            {knownTags.length === 0 ? (
              <p className="form-tip">Añade etiquetas a tus recetas, por ejemplo sopa o pasta, para usar estas reglas.</p>
            ) : (
              <div className="variety-limits">
                {knownTags.map((tag) => (
                  <label className="field" key={tag}>
                    <span>
                      {tag} <span className="field-hint">máx. por semana</span>
                    </span>
                    <input
                      inputMode="numeric"
                      value={varietyPrefs.tagLimits[tag] ?? ''}
                      onChange={(event) => updateTagLimit(tag, event.target.value)}
                      placeholder="Sin límite"
                    />
                  </label>
                ))}
              </div>
            )}
          </section>

          {recipeForm && (
            <section className="form-panel">
              <div className="form-heading">
                <div>
                  <p className="eyebrow">{recipeForm.id ? 'editar receta' : 'nueva receta'}</p>
                  <h2>{recipeForm.id ? 'Ajustar receta' : 'Añadir al catálogo'}</h2>
                </div>
              </div>
              <form onSubmit={saveRecipe}>
                <div className="form-grid">
                  <label className="field field-wide">
                    <span>Nombre</span>
                    <input autoFocus value={recipeForm.name} onChange={(event) => setRecipeForm({ ...recipeForm, name: event.target.value })} placeholder="Ej. lentejas con chorizo" />
                  </label>
                  <fieldset className="field field-wide">
                    <legend>Apta para</legend>
                    <div className="segmented-control">
                      {MEAL_SLOTS.map((slot) => (
                        <button type="button" key={slot} className={recipeForm.allowed.includes(slot) ? 'selected' : ''} onClick={() => toggleAllowed(slot)}>
                          {SLOT_LABELS[slot]}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <label className="field">
                    <span>Tiempo <span className="field-hint">minutos, opcional</span></span>
                    <input inputMode="numeric" value={recipeForm.prepMinutes} onChange={(event) => setRecipeForm({ ...recipeForm, prepMinutes: event.target.value })} placeholder="30" />
                  </label>
                  <label className="field">
                    <span>Nota <span className="field-hint">opcional</span></span>
                    <input value={recipeForm.note} onChange={(event) => setRecipeForm({ ...recipeForm, note: event.target.value })} placeholder="Ej. con pan para mojar" />
                  </label>
                  <label className="field field-wide">
                    <span>Etiquetas <span className="field-hint">separadas por comas</span></span>
                    <input
                      list="meal-tags"
                      value={recipeForm.tags}
                      onChange={(event) => setRecipeForm({ ...recipeForm, tags: event.target.value })}
                      placeholder="Ej. sopa, legumbre"
                    />
                    <datalist id="meal-tags">
                      {knownTags.map((tag) => (
                        <option key={tag} value={tag} />
                      ))}
                    </datalist>
                  </label>
                </div>
                <div className="form-footer">
                  <span className="form-tip">Las recetas archivadas no entran en nuevos menús.</span>
                  <button className="primary-button" type="submit"><Check size={17} /> Guardar receta</button>
                </div>
              </form>
            </section>
          )}

          <div className="meal-recipe-tools">
            <label className="field meal-search">
              <span>Buscar</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ej. crema de calabacín" />
            </label>
            <div className="segmented-control">
              {FILTERS.map((item) => (
                <button key={item.value} className={filter === item.value ? 'selected' : ''} onClick={() => setFilter(item.value)}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {recipes.length === 0 ? (
            <p className="meal-empty">Aún no tienes recetas. Añade tus platos habituales para empezar a generar menús.</p>
          ) : visibleRecipes.length === 0 ? (
            <p className="meal-empty">Ninguna receta coincide con la búsqueda o el filtro.</p>
          ) : (
            <section className="meal-recipe-list">
              {visibleRecipes.map((recipe) => (
                <article className={`meal-recipe ${recipe.archived ? 'is-archived' : ''}`} key={recipe.id}>
                  <div>
                    <h3>{recipe.name}</h3>
                    <p>
                      {recipe.allowed.map((slot) => SLOT_LABELS[slot]).join(' · ')}
                      {recipe.prepMinutes ? ` · ${recipe.prepMinutes} min` : ''}
                      {recipe.archived ? ' · archivada' : ''}
                    </p>
                    {recipe.note && <small>{recipe.note}</small>}
                    {recipe.tags.length > 0 && <small className="meal-tags">{recipe.tags.join(' · ')}</small>}
                  </div>
                  <div className="movement-actions">
                    <button className="icon-button" onClick={() => openEditRecipe(recipe)} aria-label={`Editar ${recipe.name}`} title="Editar">
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => toggleArchived(recipe.id)}
                      aria-label={recipe.archived ? `Reactivar ${recipe.name}` : `Archivar ${recipe.name}`}
                      title={recipe.archived ? 'Reactivar' : 'Archivar'}
                    >
                      {recipe.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                    </button>
                  </div>
                </article>
              ))}
            </section>
          )}
        </section>
      )}
    </>
  );
}
