import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  Download,
  FileJson,
  Heart,
  Pencil,
  Plus,
  RotateCcw,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  WalletCards,
  X,
} from 'lucide-react';

type Person = 'Juanjo' | 'Ana';
type SplitMode = 'equal' | 'full-other';
type Tab = 'summary' | 'activity' | 'backup';
type CategorySource = 'automatic' | 'manual' | 'review';

type CategoryDefinition = {
  id: string;
  label: string;
  keywords: string[];
};

type CategoryRule = {
  term: string;
  categoryId: string;
};

type Expense = {
  id: string;
  kind: 'expense';
  concept: string;
  amountCents: number;
  date: string;
  payer: Person;
  split: SplitMode;
  note: string;
  categoryId: string;
  categorySource: CategorySource;
  createdAt: number;
};

type Settlement = {
  id: string;
  kind: 'settlement';
  concept: string;
  amountCents: number;
  date: string;
  from: Person;
  to: Person;
  createdAt: number;
};

type LedgerItem = Expense | Settlement;

type Preferences = {
  payerOverrideUntil: number;
  payerOverride: Person;
  dateOverrideUntil: number;
  dateOverride: string;
  categoryRules: CategoryRule[];
};

type BackupPayload = {
  version: number;
  exportedAt: string;
  items: LedgerItem[];
  preferences: Preferences;
};

const ITEMS_KEY = 'gastos:items';
const PREFERENCES_KEY = 'gastos:preferences';
const AUTO_BACKUP_KEY = 'gastos:auto-backup';
const AUTO_BACKUP_AT_KEY = 'gastos:auto-backup-at';
const THREE_HOURS = 3 * 60 * 60 * 1000;
const FIVE_DAYS = 5 * 24 * 60 * 60 * 1000;
const PEOPLE: Person[] = ['Juanjo', 'Ana'];
const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
  { id: 'review', label: 'Por revisar', keywords: [] },
  { id: 'food', label: 'Alimentación', keywords: ['alimentacion', 'supermercado', 'consum', 'carrefour', 'mercadona', 'lidl', 'aldi', 'dia'] },
  { id: 'home', label: 'Vivienda', keywords: ['alquiler', 'hipoteca', 'luz', 'agua', 'gas', 'internet', 'comunidad'] },
  { id: 'transport', label: 'Transporte', keywords: ['gasolina', 'repsol', 'cepsa', 'parking', 'uber', 'taxi', 'metro', 'tren', 'renfe', 'autobus'] },
  { id: 'leisure', label: 'Ocio', keywords: ['cine', 'teatro', 'concierto', 'bar', 'restaurante', 'ocio'] },
  { id: 'health', label: 'Salud', keywords: ['farmacia', 'medico', 'dentista', 'salud', 'fisioterapia'] },
  { id: 'shopping', label: 'Compras', keywords: ['amazon', 'ropa', 'zara', 'ikea', 'fnac', 'compras'] },
  { id: 'travel', label: 'Viajes', keywords: ['hotel', 'vuelo', 'booking', 'airbnb', 'viaje', 'avion'] },
  { id: 'subscriptions', label: 'Suscripciones', keywords: ['netflix', 'spotify', 'disney', 'hbo', 'prime', 'suscripcion'] },
  { id: 'other', label: 'Otros', keywords: [] },
];

const today = () => new Date().toISOString().slice(0, 10);

const defaultPreferences = (): Preferences => ({
  payerOverrideUntil: 0,
  payerOverride: 'Juanjo',
  dateOverrideUntil: 0,
  dateOverride: today(),
  categoryRules: [],
});

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const normalizePreferences = (value?: Partial<Preferences>): Preferences => ({
  ...defaultPreferences(),
  ...value,
  categoryRules: Array.isArray(value?.categoryRules)
    ? value.categoryRules.filter((rule) => typeof rule?.term === 'string' && typeof rule?.categoryId === 'string')
    : [],
});

const normalizeLedgerItem = (item: LedgerItem): LedgerItem =>
  item.kind === 'expense'
    ? { ...item, categoryId: item.categoryId || 'review', categorySource: item.categorySource || 'review' }
    : item;

const loadItems = (): LedgerItem[] => {
  const storedItems = loadJson<unknown>(ITEMS_KEY, []);
  if (!Array.isArray(storedItems)) return [];
  return storedItems.filter((item): item is LedgerItem => Boolean(item && typeof item === 'object' && 'kind' in item)).map(normalizeLedgerItem);
};

const getCategorySuggestion = (concept: string, rules: CategoryRule[]) => {
  const normalizedConcept = normalizeText(concept);
  if (!normalizedConcept) return { categoryId: 'review', source: 'review' as CategorySource };

  const learnedRule = [...rules].sort((a, b) => b.term.length - a.term.length).find((rule) => normalizedConcept.includes(rule.term));
  if (learnedRule) return { categoryId: learnedRule.categoryId, source: 'automatic' as CategorySource };

  const match = CATEGORY_DEFINITIONS.find(
    (category) => category.id !== 'review' && category.id !== 'other' && category.keywords.some((keyword) => normalizedConcept.includes(keyword)),
  );
  return match
    ? { categoryId: match.id, source: 'automatic' as CategorySource }
    : { categoryId: 'review', source: 'review' as CategorySource };
};

const rememberCategoryRule = (rules: CategoryRule[], concept: string, categoryId: string) => {
  const term = normalizeText(concept);
  if (term.length < 3 || categoryId === 'review') return rules;
  return [{ term, categoryId }, ...rules.filter((rule) => rule.term !== term)];
};

const getCategoryLabel = (categoryId: string) =>
  CATEGORY_DEFINITIONS.find((category) => category.id === categoryId)?.label || 'Por revisar';

const loadJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(cents / 100);

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(`${value}T12:00:00`),
  );

const parseAmount = (value: string) => {
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : null;
};

const expenseEffect = (expense: Expense) => {
  const owed = expense.split === 'equal' ? Math.ceil(expense.amountCents / 2) : expense.amountCents;
  return expense.payer === 'Juanjo' ? owed : -owed;
};

const itemEffect = (item: LedgerItem) =>
  item.kind === 'expense' ? expenseEffect(item) : item.from === 'Ana' ? -item.amountCents : item.amountCents;

const getBalance = (items: LedgerItem[]) => items.reduce((total, item) => total + itemEffect(item), 0);

const getDefaults = (preferences: Preferences) => {
  const now = Date.now();
  return {
    payer: preferences.payerOverrideUntil > now ? preferences.payerOverride : 'Juanjo' as Person,
    date: preferences.dateOverrideUntil > now ? preferences.dateOverride : today(),
  };
};

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function App() {
  const [items, setItems] = useState<LedgerItem[]>(loadItems);
  const [preferences, setPreferences] = useState<Preferences>(() =>
    normalizePreferences(loadJson<Partial<Preferences>>(PREFERENCES_KEY, {})),
  );
  const [tab, setTab] = useState<Tab>('summary');
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showSettlementForm, setShowSettlementForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [defaultTick, setDefaultTick] = useState(Date.now());
  const [expenseForm, setExpenseForm] = useState(() => ({
    concept: '',
    amount: '',
    date: getDefaults(preferences).date,
    payer: getDefaults(preferences).payer,
    split: 'equal' as SplitMode,
    note: '',
    categoryId: 'review',
    categorySource: 'review' as CategorySource,
  }));
  const [settlementForm, setSettlementForm] = useState(() => ({
    amount: '',
    date: today(),
    from: 'Ana' as Person,
    to: 'Juanjo' as Person,
  }));
  const importRef = useRef<HTMLInputElement>(null);

  const balance = useMemo(() => getBalance(items), [items]);
  const sortedItems = useMemo(
    () => [...items].sort((a, b) => b.createdAt - a.createdAt),
    [items],
  );
  const expenses = items.filter((item): item is Expense => item.kind === 'expense');
  const settlements = items.filter((item): item is Settlement => item.kind === 'settlement');
  const lastSettlement = [...settlements].sort((a, b) => b.createdAt - a.createdAt)[0];
  const sinceLastSettlement = lastSettlement
    ? items
        .filter((item) => item.createdAt > lastSettlement.createdAt)
        .reduce((total, item) => total + itemEffect(item), 0)
    : balance;
  const activeDefaults = getDefaults(preferences);
  void defaultTick;

  useEffect(() => {
    localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
    const lastAutoBackup = Number(localStorage.getItem(AUTO_BACKUP_AT_KEY) || 0);
    if (items.length > 0 && Date.now() - lastAutoBackup >= FIVE_DAYS) {
      const payload = createBackup(items, preferences);
      localStorage.setItem(AUTO_BACKUP_KEY, JSON.stringify(payload));
      localStorage.setItem(AUTO_BACKUP_AT_KEY, String(Date.now()));
    }
  }, [items, preferences]);

  useEffect(() => {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    const interval = window.setInterval(() => setDefaultTick(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const resetExpenseForm = () => {
    const defaults = getDefaults(preferences);
    setExpenseForm({ concept: '', amount: '', date: defaults.date, payer: defaults.payer, split: 'equal', note: '', categoryId: 'review', categorySource: 'review' });
    setEditingId(null);
  };

  const openNewExpense = () => {
    resetExpenseForm();
    setShowSettlementForm(false);
    setShowExpenseForm(true);
  };

  const openEditExpense = (expense: Expense) => {
    setExpenseForm({
      concept: expense.concept,
      amount: (expense.amountCents / 100).toFixed(2).replace('.', ','),
      date: expense.date,
      payer: expense.payer,
      split: expense.split,
      note: expense.note,
      categoryId: expense.categoryId,
      categorySource: expense.categorySource,
    });
    setEditingId(expense.id);
    setShowSettlementForm(false);
    setShowExpenseForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const updateExpenseConcept = (concept: string) => {
    setExpenseForm((current) => {
      if (current.categorySource === 'manual') return { ...current, concept };
      const suggestion = getCategorySuggestion(concept, preferences.categoryRules);
      return { ...current, concept, categoryId: suggestion.categoryId, categorySource: suggestion.source };
    });
  };

  const submitExpense = (event: FormEvent) => {
    event.preventDefault();
    const amountCents = parseAmount(expenseForm.amount);
    if (!expenseForm.concept.trim() || amountCents === null) {
      setNotice('Añade un concepto y un importe válido.');
      return;
    }

    if (editingId) {
      setItems((current) =>
        current.map((item) =>
          item.id === editingId && item.kind === 'expense'
            ? { ...item, ...expenseForm, concept: expenseForm.concept.trim(), amountCents }
            : item,
        ),
      );
      setNotice('Gasto actualizado.');
    } else {
      const expense: Expense = {
        id: createId(),
        kind: 'expense',
        concept: expenseForm.concept.trim(),
        amountCents,
        date: expenseForm.date,
        payer: expenseForm.payer,
        split: expenseForm.split,
        note: expenseForm.note.trim(),
        categoryId: expenseForm.categoryId,
        categorySource: expenseForm.categorySource,
        createdAt: Date.now(),
      };
      setItems((current) => [...current, expense]);
      setNotice('Gasto guardado.');
    }

    const nextCategoryRules = expenseForm.categorySource === 'manual'
      ? rememberCategoryRule(preferences.categoryRules, expenseForm.concept, expenseForm.categoryId)
      : preferences.categoryRules;
    const nextPreferences: Preferences = {
      ...preferences,
      payerOverride: expenseForm.payer,
      payerOverrideUntil: expenseForm.payer === 'Ana' ? Date.now() + THREE_HOURS : 0,
      dateOverride: expenseForm.date,
      dateOverrideUntil: expenseForm.date === today() ? 0 : Date.now() + THREE_HOURS,
      categoryRules: nextCategoryRules,
    };
    setPreferences(nextPreferences);
    setShowExpenseForm(false);
    resetExpenseForm();
  };

  const startSettlement = () => {
    const positive = balance > 0;
    setSettlementForm({
      amount: balance === 0 ? '' : (Math.abs(balance) / 100).toFixed(2).replace('.', ','),
      date: today(),
      from: positive ? 'Ana' : 'Juanjo',
      to: positive ? 'Juanjo' : 'Ana',
    });
    setShowExpenseForm(false);
    setShowSettlementForm(true);
  };

  const submitSettlement = (event: FormEvent) => {
    event.preventDefault();
    const amountCents = parseAmount(settlementForm.amount);
    if (amountCents === null) {
      setNotice('Añade un importe válido para la liquidación.');
      return;
    }
    const settlement: Settlement = {
      id: createId(),
      kind: 'settlement',
      concept: `Pago de ${settlementForm.from} a ${settlementForm.to}`,
      amountCents,
      date: settlementForm.date,
      from: settlementForm.from,
      to: settlementForm.to,
      createdAt: Date.now(),
    };
    setItems((current) => [...current, settlement]);
    setShowSettlementForm(false);
    setNotice('Liquidación registrada. El histórico sigue intacto.');
  };

  const deleteItem = (id: string) => {
    if (window.confirm('¿Eliminar este movimiento?')) {
      setItems((current) => current.filter((item) => item.id !== id));
      setNotice('Movimiento eliminado.');
    }
  };

  const createBackup = (currentItems = items, currentPreferences = preferences): BackupPayload => ({
    version: 2,
    exportedAt: new Date().toISOString(),
    items: currentItems,
    preferences: currentPreferences,
  });

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(createBackup(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `gastos-backup-${today()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice('Copia JSON descargada.');
  };

  const importBackup = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result)) as BackupPayload;
        if (!Array.isArray(payload.items)) throw new Error('Formato inválido');
        setItems(payload.items.map(normalizeLedgerItem));
        if (payload.preferences) setPreferences(normalizePreferences(payload.preferences));
        setNotice('Copia restaurada correctamente.');
      } catch {
        setNotice('No se pudo leer esa copia JSON.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const renderMovement = (item: LedgerItem) => {
    const isSettlement = item.kind === 'settlement';
    const effect = itemEffect(item);
    return (
      <article className={`movement ${isSettlement ? 'movement-settlement' : ''}`} key={item.id}>
        <div className={`movement-icon ${effect >= 0 ? 'icon-in' : 'icon-out'}`}>
          {isSettlement ? <RotateCcw size={18} /> : effect >= 0 ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
        </div>
        <div className="movement-content">
          <div className="movement-title-row">
            <h3>{item.concept}</h3>
            {isSettlement ? (
              <strong className={effect >= 0 ? 'amount-positive' : 'amount-negative'}>
                {effect >= 0 ? '+' : '-'}{formatCurrency(Math.abs(effect))}
              </strong>
            ) : (
              <div className="movement-amount">
                <strong className="expense-total">{formatCurrency(item.amountCents)}</strong>
                <span className={effect >= 0 ? 'amount-positive' : 'amount-negative'}>
                  Balance: {effect >= 0 ? '+' : '-'}{formatCurrency(Math.abs(effect))}
                </span>
              </div>
            )}
          </div>
          <p>
            {formatDate(item.date)} <span className="dot">·</span>{' '}
            {isSettlement ? `${item.from} pagó a ${item.to}` : `Pagó ${item.payer} · ${item.split === 'equal' ? 'mitad y mitad' : 'íntegro para la otra persona'}`}
          </p>
          {!isSettlement && <span className={`category-badge ${item.categoryId === 'review' ? 'category-review' : ''}`}>{getCategoryLabel(item.categoryId)}</span>}
          {!isSettlement && item.note && <small>{item.note}</small>}
        </div>
        <div className="movement-actions">
          {!isSettlement && (
            <button className="icon-button" onClick={() => openEditExpense(item)} aria-label={`Editar ${item.concept}`} title="Editar">
              <Pencil size={16} />
            </button>
          )}
          <button className="icon-button danger" onClick={() => deleteItem(item.id)} aria-label={`Eliminar ${item.concept}`} title="Eliminar">
            <Trash2 size={16} />
          </button>
        </div>
      </article>
    );
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Gastos, volver al inicio">
          <span className="brand-mark"><Heart size={18} fill="currentColor" /></span>
          <span>gastos</span>
        </a>
        <div className="header-meta"><span>Juanjo</span><span className="meta-heart">&amp;</span><span>Ana</span></div>
        <button className="avatar-button" onClick={() => setTab('backup')} aria-label="Abrir ajustes y copias">
          J<span>&amp;</span>A
        </button>
      </header>

      <main id="top" className="page-content">
        <section className="intro-row">
          <div>
            <p className="eyebrow"><Sparkles size={14} /> vuestro rincón compartido</p>
            <h1>Hola, Juanjo <span className="title-mark">✦</span></h1>
            <p className="intro-copy">Un vistazo suave a todo lo que vais compartiendo.</p>
          </div>
          <button className="primary-button add-top-button" onClick={openNewExpense}><Plus size={18} /> Añadir gasto</button>
        </section>

        <nav className="tabbar" aria-label="Secciones principales">
          <button className={tab === 'summary' ? 'active' : ''} onClick={() => setTab('summary')}>Resumen</button>
          <button className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}>Movimientos <span className="tab-count">{items.length}</span></button>
          <button className={tab === 'backup' ? 'active' : ''} onClick={() => setTab('backup')}>Copias y ajustes</button>
        </nav>

        {notice && <div className="notice" role="status"><Check size={16} />{notice}<button onClick={() => setNotice('')} aria-label="Cerrar aviso"><X size={15} /></button></div>}

        {tab !== 'backup' && (
          <>
            <section className="balance-layout">
              <div className={`balance-card ${balance === 0 ? 'balanced' : balance > 0 ? 'owed-to-juanjo' : 'owed-to-ana'}`}>
                <div className="balance-card-top"><span>Balance actual</span><WalletCards size={20} /></div>
                <div className="balance-amount">{formatCurrency(Math.abs(balance))}</div>
                <p>{balance === 0 ? 'Todo está a cero, qué gusto.' : balance > 0 ? 'Ana te debe a ti' : 'Tú le debes a Ana'}</p>
                {balance !== 0 && <button className="settle-button" onClick={startSettlement}>Registrar liquidación <ChevronRight size={16} /></button>}
              </div>
              <div className="balance-side">
                <div className="mini-stat"><span className="stat-label">Desde el último pago</span><strong>{formatCurrency(Math.abs(sinceLastSettlement))}</strong><span className={sinceLastSettlement === 0 ? 'stat-neutral' : sinceLastSettlement > 0 ? 'stat-positive' : 'stat-negative'}>{sinceLastSettlement === 0 ? 'Sin cambios pendientes' : sinceLastSettlement > 0 ? 'A favor de Juanjo' : 'A favor de Ana'}</span></div>
                <div className="mini-stat"><span className="stat-label">Este mes</span><strong>{formatCurrency(expenses.filter((expense) => expense.date.slice(0, 7) === today().slice(0, 7)).reduce((total, expense) => total + expense.amountCents, 0))}</strong><span className="stat-neutral">{expenses.filter((expense) => expense.date.slice(0, 7) === today().slice(0, 7)).length} gastos compartidos</span></div>
              </div>
            </section>

            {(showExpenseForm || showSettlementForm) && (
              <section className="form-panel">
                <div className="form-heading"><div><p className="eyebrow">{showSettlementForm ? 'cerrar cuentas' : editingId ? 'editar movimiento' : 'nuevo movimiento'}</p><h2>{showSettlementForm ? 'Registrar una liquidación' : editingId ? 'Ajustar gasto' : 'Apuntar un gasto'}</h2></div><button className="icon-button" onClick={() => { setShowExpenseForm(false); setShowSettlementForm(false); }} aria-label="Cerrar formulario"><X size={19} /></button></div>
                {showExpenseForm ? (
                  <form onSubmit={submitExpense}>
                    <div className="form-grid">
                      <label className="field field-wide"><span>Concepto</span><input autoFocus value={expenseForm.concept} onChange={(event) => updateExpenseConcept(event.target.value)} placeholder="Ej. compra del súper" /></label>
                      <label className="field"><span>Importe</span><div className="input-with-suffix"><input inputMode="decimal" value={expenseForm.amount} onChange={(event) => setExpenseForm({ ...expenseForm, amount: event.target.value })} placeholder="0,00" /><b>EUR</b></div></label>
                      <label className="field"><span>Fecha <span className="field-hint">{activeDefaults.date === expenseForm.date && '· sugerida'}</span></span><div className="input-with-icon"><input type="date" value={expenseForm.date} onChange={(event) => setExpenseForm({ ...expenseForm, date: event.target.value })} /><CalendarDays size={16} /></div></label>
                      <label className="field"><span>Categoría <span className={`field-hint ${expenseForm.categorySource === 'review' ? 'field-warning' : ''}`}>{expenseForm.categorySource === 'automatic' ? '· sugerida' : expenseForm.categorySource === 'manual' ? '· elegida por ti' : '· pendiente'}</span></span><select value={expenseForm.categoryId} onChange={(event) => setExpenseForm({ ...expenseForm, categoryId: event.target.value, categorySource: event.target.value === 'review' ? 'review' : 'manual' })}>{CATEGORY_DEFINITIONS.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
                      <fieldset className="field field-wide"><legend>¿Quién pagó?</legend><div className="segmented-control">{PEOPLE.map((person) => <button type="button" key={person} className={expenseForm.payer === person ? 'selected' : ''} onClick={() => setExpenseForm({ ...expenseForm, payer: person })}>{person}{person === activeDefaults.payer && <span className="default-dot" />}</button>)}</div></fieldset>
                      <fieldset className="field field-wide"><legend>¿Cómo se reparte?</legend><div className="split-options"><button type="button" className={expenseForm.split === 'equal' ? 'selected' : ''} onClick={() => setExpenseForm({ ...expenseForm, split: 'equal' })}><span className="option-title">Mitad y mitad</span><span className="option-copy">Cada uno asume la mitad</span></button><button type="button" className={expenseForm.split === 'full-other' ? 'selected' : ''} onClick={() => setExpenseForm({ ...expenseForm, split: 'full-other' })}><span className="option-title">Íntegro para la otra persona</span><span className="option-copy">El pagador adelanta todo</span></button></div></fieldset>
                      <label className="field field-wide"><span>Nota <span className="field-hint">opcional</span></span><input value={expenseForm.note} onChange={(event) => setExpenseForm({ ...expenseForm, note: event.target.value })} placeholder="Algún detalle para recordarlo" /></label>
                    </div>
                    <div className="form-footer"><span className="form-tip"><CircleHelp size={15} /> El pagador y la fecha se recordarán 3 horas.</span><button className="primary-button" type="submit"><Check size={17} /> Guardar gasto</button></div>
                  </form>
                ) : (
                  <form onSubmit={submitSettlement}>
                    <div className="settlement-explainer"><div className="settlement-avatars"><span>J</span><ChevronRight size={16} /><span>A</span></div><p>El pago se guardará como movimiento y no borrará ningún gasto anterior.</p></div>
                    <div className="form-grid settlement-grid"><label className="field"><span>Importe</span><div className="input-with-suffix"><input autoFocus inputMode="decimal" value={settlementForm.amount} onChange={(event) => setSettlementForm({ ...settlementForm, amount: event.target.value })} placeholder="0,00" /><b>EUR</b></div></label><label className="field"><span>Fecha</span><input type="date" value={settlementForm.date} onChange={(event) => setSettlementForm({ ...settlementForm, date: event.target.value })} /></label><label className="field"><span>Quién paga</span><select value={settlementForm.from} onChange={(event) => setSettlementForm({ ...settlementForm, from: event.target.value as Person, to: event.target.value === 'Ana' ? 'Juanjo' : 'Ana' })}>{PEOPLE.map((person) => <option key={person}>{person}</option>)}</select></label><label className="field"><span>Quién recibe</span><select value={settlementForm.to} onChange={(event) => setSettlementForm({ ...settlementForm, to: event.target.value as Person, from: event.target.value === 'Ana' ? 'Juanjo' : 'Ana' })}>{PEOPLE.map((person) => <option key={person}>{person}</option>)}</select></label></div>
                    <div className="form-footer"><span className="form-tip">{balance === 0 ? 'No hay balance pendiente ahora mismo.' : `Sugerencia: ${formatCurrency(Math.abs(balance))}`}</span><button className="primary-button" type="submit"><Check size={17} /> Guardar liquidación</button></div>
                  </form>
                )}
              </section>
            )}

            <section className="section-heading"><div><p className="eyebrow">tu historial</p><h2>{tab === 'activity' ? 'Todos los movimientos' : 'Últimos movimientos'}</h2></div>{tab === 'summary' && items.length > 5 && <button className="text-button" onClick={() => setTab('activity')}>Ver todos <ChevronRight size={15} /></button>}</section>
            <section className="movement-list">{sortedItems.length === 0 ? <div className="empty-state"><div className="empty-illustration"><WalletCards size={29} /></div><h3>El primer gasto empieza aquí</h3><p>Añade algo que hayáis compartido y el balance aparecerá al instante.</p><button className="primary-button" onClick={openNewExpense}><Plus size={17} /> Añadir primer gasto</button></div> : (tab === 'summary' ? sortedItems.slice(0, 5) : sortedItems).map(renderMovement)}</section>
          </>
        )}

        {tab === 'backup' && (
          <section className="settings-view"><div className="settings-hero"><p className="eyebrow"><Settings2 size={14} /> tranquilidad para tus datos</p><h1>Copias y ajustes</h1><p>Los datos viven en este dispositivo. Guarda una copia JSON para llevarlos contigo o recuperarlos si cambias de móvil.</p></div><div className="backup-grid"><article className="backup-card primary-backup"><div className="backup-icon"><FileJson size={22} /></div><h2>Guardar una copia</h2><p>Descarga todos tus gastos, liquidaciones y preferencias en un archivo JSON.</p><button className="primary-button" onClick={exportBackup}><Download size={17} /> Descargar copia</button></article><article className="backup-card"><div className="backup-icon soft"><Upload size={22} /></div><h2>Restaurar una copia</h2><p>Importa un archivo anterior para recuperar tu historial en este dispositivo.</p><input ref={importRef} type="file" accept="application/json,.json" onChange={importBackup} hidden /><button className="secondary-button" onClick={() => importRef.current?.click()}><Upload size={17} /> Elegir archivo</button></article></div><div className="auto-backup-note"><Check size={18} /><div><strong>Respaldo interno automático</strong><p>La app guarda una instantánea privada cada 5 días mientras está en uso. Para conservar un archivo fuera del navegador, descarga una copia manual.</p></div></div><div className="settings-note"><span className="note-number">01</span><div><strong>Todo permanece en el historial</strong><p>Las liquidaciones ajustan el balance, pero nunca hacen desaparecer los gastos ni los pagos anteriores.</p></div></div><div className="settings-note"><span className="note-number">02</span><div><strong>Importes precisos</strong><p>Los euros se guardan internamente en céntimos para que los cálculos sean consistentes.</p></div></div></section>
        )}
      </main>
      <footer className="app-footer"><span>Hecho para dos <Heart size={13} fill="currentColor" /></span><span>Los datos se quedan en este dispositivo</span></footer>
    </div>
  );
}

function createBackup(items: LedgerItem[], preferences: Preferences): BackupPayload {
  return { version: 2, exportedAt: new Date().toISOString(), items, preferences };
}

export default App;
