// ============================================
// Spreadsheet-style Input Components
// These solve: select-on-focus, raw editing of formatted values,
// Enter/Tab to advance, Escape to revert
// ============================================

// Generic spreadsheet cell: selects all on focus, Enter advances to next input
// ============================================
// Spreadsheet Cell Components — select-on-focus, raw editing, same-column Enter nav
// ============================================
// Navigation helper: Enter moves to the same column in the next row (true spreadsheet behavior)
// Enter/Escape navigation for table cells
// Thin wrappers around plain <input>/<select> — matching the modal pattern.
// No onKeyDown, no editing state. Tab works natively.

// ============================================
// INPUT CELL COMPONENTS
// ============================================
// All number/percent/age cells follow a unified pattern that makes typing feel natural:
//
//   1. While focused: hold the user's typing as a raw string in local state. No
//      reformatting, no rounding, no division — what they type is what stays in
//      the field. This is critical because the previous implementation called
//      .toFixed(1) on every keystroke, which scrambled cursor position and
//      effectively prevented typing multi-digit numbers (e.g., typing "10"
//      registered as "1" because "1" → "1.0" → cursor jumped → next "0" replaced).
//
//   2. On change: store the raw string, parse-and-commit to parent only when
//      the string parses to a valid number. Empty string is allowed during typing.
//
//   3. On blur: format the final value cleanly and re-sync with parent (handles
//      cases like "1." or "" by treating them as 0).
//
//   4. On wheel: prevent the default behavior. Scroll-wheel on focused number
//      inputs is a common source of accidental value changes — we disable it.
//
//   5. Backward compatible: existing call sites use either `onChange(event)` or
//      `onValueChange(number)`. We support both — `onValueChange` is preferred
//      and takes a parsed number; `onChange` receives a synthetic event-like
//      object for compatibility with the older `e => Number(e.target.value)` pattern.

// Spreadsheet text cell — used for free-form text (no number coercion)
const SpreadsheetCell = ({ value, onChange, onCommit, className, ...props }) => (
  <input type="text" value={value} onChange={onChange} onBlur={onCommit} className={className} {...props} />
);

// Shared hook for number input behavior. Returns the props an <input> needs.
// `value` = the parent's committed numeric value
// `formatForDisplay(num)` = converts numeric value to string for display when NOT focused
// `parseFromInput(str)` = converts raw input string to numeric value to commit
// `commit(num)` = called with parsed number on change (when valid) and on blur
const useNumberInput = (value, formatForDisplay, parseFromInput, commit) => {
  const [focused, setFocused] = React.useState(false);
  const [raw, setRaw] = React.useState('');
  
  const displayValue = focused ? raw : formatForDisplay(value);
  
  return {
    value: displayValue,
    onFocus: (e) => {
      setFocused(true);
      // Pre-fill the editor with the current value (without formatting suffixes).
      // For percent: show "5" not "5.0". For age/currency: show "65" not "65.0".
      setRaw(formatForDisplay(value));
      // Select all text on focus so the user can immediately overwrite by typing.
      // This is the common spreadsheet behavior and what most users expect.
      e.target.select();
    },
    onChange: (e) => {
      const newRaw = e.target.value;
      setRaw(newRaw);
      // Commit only if it parses cleanly. Empty string / "1." / "-" stay local.
      const parsed = parseFromInput(newRaw);
      if (parsed !== null) commit(parsed);
    },
    onBlur: () => {
      setFocused(false);
      // Final commit: ensure parent has the cleaned-up value, even if the user
      // left something like "1." or "" in the field (treat as 0 or last valid).
      const parsed = parseFromInput(raw);
      if (parsed !== null) commit(parsed);
      else commit(value); // Re-commit existing value to trigger any onCommit logic
    },
    // Suppress scroll-wheel value changes — a common UX pitfall with type=number
    onWheel: (e) => e.target.blur(),
  };
};

// Currency input. Stores a plain number (dollars). Displays without commas
// in the input itself (browser-native number input doesn't support them).
const CurrencyCell = ({ value, onValueChange, onCommit, className, prefix = true, ...props }) => {
  const inputProps = useNumberInput(
    value,
    (num) => (num == null || num === 0 ? '' : String(num)),
    (str) => {
      if (str === '' || str === '-') return 0;
      const n = Number(str);
      return Number.isFinite(n) ? n : null;
    },
    (num) => onValueChange && onValueChange(num)
  );
  return (
    <div className="flex items-center justify-end">
      {prefix && <span className="text-slate-500 mr-1 text-sm">$</span>}
      <input type="number" inputMode="decimal" {...inputProps} {...props}
        onBlur={(e) => { inputProps.onBlur(e); if (onCommit) onCommit(); }}
        className={className} />
    </div>
  );
};

// Percent input. Parent stores fraction (0.05 = 5%). User types percent (5 = 5%).
// We convert: display value × 100, user input ÷ 100 on commit.
const PercentCell = ({ value, onValueChange, onCommit, className, ...props }) => {
  // Parent's value is a fraction (0.05); we work in percent display (5).
  // useNumberInput's value should be the "raw percent" not the fraction.
  // We translate at the boundary.
  const percentValue = (value || 0) * 100;
  const inputProps = useNumberInput(
    percentValue,
    (num) => {
      if (num == null || num === 0) return '';
      // Trim trailing zeros: 10.00 → "10", 10.50 → "10.5", 10.55 → "10.55"
      return Number(num.toFixed(4)).toString();
    },
    (str) => {
      if (str === '' || str === '-' || str === '.') return 0;
      const n = Number(str);
      return Number.isFinite(n) ? n : null;
    },
    (num) => onValueChange && onValueChange(num / 100)
  );
  return (
    <div className="flex items-center justify-end">
      <input type="number" inputMode="decimal" step="any" {...inputProps} {...props}
        onBlur={(e) => { inputProps.onBlur(e); if (onCommit) onCommit(); }}
        className={className} />
      <span className="text-slate-500 ml-0.5 text-sm">%</span>
    </div>
  );
};

// Age input. Plain integer-valued number input with the same UX treatment.
// Supports both `onChange(event)` (legacy) and `onValueChange(number)` (preferred).
const AgeCell = ({ value, onChange, onValueChange, onCommit, className, ...props }) => {
  const inputProps = useNumberInput(
    value,
    (num) => (num == null || num === 0 ? '' : String(num)),
    (str) => {
      if (str === '' || str === '-') return 0;
      const n = Number(str);
      return Number.isFinite(n) ? Math.round(n) : null;
    },
    (num) => {
      if (onValueChange) onValueChange(num);
      if (onChange) onChange({ target: { value: String(num) } }); // legacy event shape
    }
  );
  return (
    <input type="number" inputMode="numeric" {...inputProps} {...props}
      onBlur={(e) => { inputProps.onBlur(e); if (onCommit) onCommit(); }}
      className={className} />
  );
};


// Retiring at the START of the named month: pick July and the retirement year
// carries six months of pay and six of pension. January is the default and the
// no-op — it is what the engine has always modelled, since the app's convention
// already ends salaries at retirementAge − 1.
const RETIREMENT_MONTHS = [
  { value: 1, label: 'January (full year retired)' }, { value: 2, label: 'February' },
  { value: 3, label: 'March' },   { value: 4, label: 'April' },
  { value: 5, label: 'May' },     { value: 6, label: 'June' },
  { value: 7, label: 'July' },    { value: 8, label: 'August' },
  { value: 9, label: 'September' }, { value: 10, label: 'October' },
  { value: 11, label: 'November' }, { value: 12, label: 'December' },
];

const GridSelect = ({ value, onChange, options, className, children, ...props }) => (
  <select value={value} onChange={onChange} className={className} {...props}>
    {children || options?.map(o => typeof o === 'string'
      ? <option key={o} value={o}>{o}</option>
      : <option key={o.value} value={o.value}>{o.label}</option>
    )}
  </select>
);

const InfoCard = React.memo(({ title, sections, isOpen, onToggle }) => {
  if (!isOpen) {
    return (
      <button
        tabIndex={-1}
        onClick={onToggle}
        className="flex items-center gap-1.5 text-amber-400 hover:text-amber-300 transition-colors px-2.5 py-1 rounded-full border border-amber-500/30 hover:border-amber-500/50 hover:bg-amber-500/10 text-xs font-medium"
        title={`What is ${title}?`}
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
          <text x="10" y="14.5" textAnchor="middle" fill="currentColor" fontSize="12" fontWeight="600">i</text>
        </svg>
        <span>Guide</span>
      </button>
    );
  }

  return (
    <div className="mt-3 mb-1 bg-slate-800/90 border border-amber-500/30 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20">
        <span className="text-sm font-semibold text-amber-400">ℹ️ Understanding: {title}</span>
        <button
          onClick={onToggle}
          className="text-slate-400 hover:text-slate-200 text-lg leading-none px-1"
        >
          ✕
        </button>
      </div>
      <div className="px-4 py-3 space-y-3 max-h-[28rem] overflow-y-auto">
        {sections.map((section, idx) => (
          <div key={idx}>
            {section.heading && (
              <div className="text-xs font-semibold text-amber-400/80 uppercase tracking-wide mb-1">{section.heading}</div>
            )}
            {section.body && (
              <p className="text-sm text-slate-300 leading-relaxed">{section.body}</p>
            )}
            {section.items && (
              <div className="space-y-1.5 mt-1">
                {section.items.map((item, i) => (
                  <div key={i} className="flex gap-2 text-sm">
                    <span className="flex-shrink-0 mt-0.5">{item.color && (
                      <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
                    )}{item.icon && <span>{item.icon}</span>}</span>
                    <div>
                      <span className="text-slate-200 font-medium">{item.label}</span>
                      {item.desc && <span className="text-slate-400"> — {item.desc}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {section.tip && (
              <div className="mt-1.5 px-3 py-2 bg-amber-500/5 border-l-2 border-amber-500/40 rounded-r">
                <p className="text-xs text-amber-300/90">💡 {section.tip}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});
InfoCard.displayName = 'InfoCard';

// ============================================
// Shared Style Constants (Module Scope)
// Lifted out of RetirementPlanner so child components can be defined at module
// scope and avoid the unmount/remount cycle on every parent state change.
// ============================================
const cardStyle = "bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 shadow-xl";

// ── SECTION SHELL ───────────────────────────────────────────────────────────
// One card, one heading, one hide control, driven by SECTION_MANIFEST. The
// dashboard's version of this was hand-written per section, which is why the
// section list existed twice; here a tab declares its sections once and wraps
// each one.
const Section = ({ tab, id, title, vis, level, setVis, actions, children, className }) => {
  if (!sectionIsVisible(vis, level, tab, id)) return null;
  const entry = (SECTION_MANIFEST[tab] || []).find(e => e.id === id);
  return (
    <div className={className || cardStyle}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          {typeof title === 'string'
            ? <h4 className="text-lg font-semibold text-slate-100">{title}</h4>
            : title}
          {actions}
        </div>
        {/* No setter means no Sections strip to restore from, so the control
            would be one-way: click it and the section is gone for good. That is
            not a preference, it is a trap — the same reasoning that keeps the
            +Add and Run buttons out of hideable sections. */}
        {entry && setVis && (
          <button
            onClick={() => setVis(prev => ({ ...prev, [tab]: { ...(prev[tab] || {}), [id]: false } }))}
            className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded hover:bg-slate-700/50 transition-colors shrink-0"
            title="Hide this section — restore it from Sections at the top of the tab"
          >
            Hide
          </button>
        )}
      </div>
      {children}
    </div>
  );
};

// Some panels draw their own card and their own heading — the conversion
// simulator, the optimizer, the year snapshot. Wrapping those in <Section> would
// print the title twice, which is a mistake this file has already made once. So
// this supplies only what they lack: a hide control and a manifest entry. Same
// visibility store, same restore path through SectionControls, no second title.
const HideableBlock = ({ tab, id, level, vis, setVis, children }) => {
  if (!sectionIsVisible(vis, level, tab, id)) return null;
  // No setter: see Section above — without the restore strip the Hide button is
  // one-way, so it is not offered.
  if (!setVis) return <div>{children}</div>;
  return (
    <div>
      <div className="flex justify-end">
        <button
          onClick={() => setVis(prev => ({ ...prev, [tab]: { ...(prev[tab] || {}), [id]: false } }))}
          className="text-xs text-slate-500 hover:text-slate-300 px-2 py-0.5 rounded hover:bg-slate-700/50 transition-colors"
          title="Hide this — restore it from Sections at the top of the tab"
        >
          Hide
        </button>
      </div>
      {children}
    </div>
  );
};

// Reports print on white with inline styles, so they get their own banner rather
// than the app-themed ones — and unlike the tabs, a report ALWAYS states its
// basis, in both directions. A tab has a toggle on screen saying which yardstick
// is in force; a printed page handed to a spouse or an advisor has nothing, and
// "$9.1M at 95" means two very different things depending on an answer the page
// does not otherwise give.
const ReportBasisLine = ({ pi, follows }) => {
  const real = pi.displayBasis === 'real';
  const shown = follows ? real : false;
  return (
    <p style={{ fontSize: 12, color: shown || !follows ? '#475569' : '#475569',
                margin: '6px 0 0', fontStyle: 'italic' }}>
      {shown
        ? `All amounts in TODAY'S dollars — this plan restated at ${(((pi.inflationRate ?? 0.03) * 100)).toFixed(1)}% inflation.`
        : `All amounts in FUTURE dollars — the actual dollar figures in each year, inflation included.`}
      {!follows && real
        ? " This report always uses future dollars, because every figure on it is measured against a tax threshold the IRS indexes in those same dollars."
        : ''}
    </p>
  );
};

// The counterpart to BasisNote, for surfaces that DO follow the setting. It
// prints only in the real basis: "future dollars" is the engine's own output and
// what every planning tool means by default, so labelling it everywhere would be
// noise. "Today's dollars" is the unusual reading and has to announce itself —
// especially on a report, which is a document someone may read away from the app
// with no toggle in sight to tell them which yardstick they are holding.
const BasisLabel = ({ pi, className = '' }) => {
  if (pi.displayBasis !== 'real') return null;
  return (
    <div className={`text-xs text-slate-500 ${className}`}>
      All amounts in <strong className="text-slate-400">today's dollars</strong> — the same plan restated at{' '}
      {(((pi.inflationRate ?? 0.03) * 100)).toFixed(1)}% inflation, not future dollar counts.
    </div>
  );
};

// A tab that cannot follow the global basis has to say so, in the place the
// figures are. Silently opting out is how a reader ends up comparing today's
// dollars on one tab with future dollars on the next and concluding the tool is
// broken — which is exactly what happened with the Monte Carlo percentiles.
const BasisNote = ({ pi, reason }) => {
  if (pi.displayBasis !== 'real') return null;
  return (
    <div className="text-xs text-amber-300/90 bg-amber-500/5 border border-amber-500/25 rounded-lg px-3 py-2">
      ⓘ You have the app set to <strong>today's dollars</strong>, but the figures on this tab are in
      <strong> future dollars</strong>. {reason}
    </div>
  );
};

// The three tax treatments, in the palette, in ONE place. They had been written
// out by hand in four: the withdrawal-priority chips, two traditional-vs-Roth
// verdicts, and the balances table. No two agreed — Roth was purple in one, sky
// in another, emerald in a third, and green (correct) only in the table that had
// already been fixed. A reader who learned the colours from the charts read
// three of the four backwards.
//
// A function, not a const: applyThemeMode repaints SERIES in place, so this has
// to read it when it is called or it freezes at whichever mode loaded first.
const treatmentInk = (kind) => ({
  pretax: SERIES.preTax, traditional: SERIES.preTax,
  roth: SERIES.roth,
  brokerage: SERIES.brokerage,
  hsa: SERIES.hsa,
}[kind] || THEME.inkSecondary);

// The same three as a chip — tint, border and text derived from the one colour
// rather than three hand-picked Tailwind steps.
const treatmentChip = (kind) => {
  const c = treatmentInk(kind);
  return { background: `${c}33`, borderColor: `${c}80`, color: c };
};

// One switch for the yardstick every money figure on the page is quoted in.
// Small, and next to the section controls rather than buried in a settings
// panel, because the answer to "is that $3M real money?" has to be visible at
// the same moment the $3M is.
const BasisToggle = ({ pi, setPersonalInfo, className = '' }) => {
  const real = pi.displayBasis === 'real';
  return (
    <div className={`flex items-center gap-2 text-xs ${className}`}>
      <span className="text-slate-500">Amounts in</span>
      <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700 gap-0.5">
        {[['nominal', 'Future $'], ['real', "Today's $"]].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setPersonalInfo(prev => ({ ...prev, displayBasis: id }))}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
              (id === 'real') === real ? 'bg-slate-600 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
            title={id === 'real'
              ? `The same plan restated in today's purchasing power, at ${(((pi.inflationRate ?? 0.03) * 100)).toFixed(1)}% inflation`
              : 'The actual number of dollars in that future year, inflation included'}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
};

// v2.50.0 retired the Essentials/Standard/Everything level: the mode switch
// already does that job (simple shows essentials, the full app the standard
// set). A plan saved at another level keeps exactly what it showed — each
// section that level decided differently from the full app's default becomes
// an explicit choice. Choices the reader already made are left alone. Pure,
// and a no-op at 'standard', so running it on every load and import is safe.
const pinDetailLevel = (vis, level) => {
  const out = { ...(vis || {}) };
  if (!level || level === 'standard' || !(level in LEVEL_SHOWS)) return out;
  Object.entries(SECTION_MANIFEST).forEach(([tab, entries]) => {
    const tabVis = { ...(out[tab] || {}) };
    let changed = false;
    entries.forEach(e => {
      if (typeof tabVis[e.id] === 'boolean') return;
      const was = LEVEL_RANK[e.level] <= LEVEL_SHOWS[level];
      const now = LEVEL_RANK[e.level] <= LEVEL_SHOWS.standard;
      if (was !== now) { tabVis[e.id] = was; changed = true; }
    });
    if (changed) out[tab] = tabVis;
  });
  return out;
};

// The per-tab Sections control: every hideable section on the tab, each one a
// switch, with a way to show them all and a way back to the defaults. This is
// also where a section put away with its own Hide button comes back from.
// No setter (simple mode) means no control — and the sections then have no
// Hide buttons either, because there would be nowhere to restore them from.
const SectionControls = ({ tab, vis, setVis, level }) => {
  const [open, setOpen] = useState(false);
  const entries = SECTION_MANIFEST[tab] || [];
  if (!entries.length) return null;
  if (!setVis) return null;
  const isOn = (id) => sectionIsVisible(vis, level, tab, id);
  const byDefault = (e) => LEVEL_RANK[e.level] <= LEVEL_SHOWS[level || 'standard'];
  const shown = entries.filter(e => isOn(e.id)).length;
  const hidden = entries.length - shown;
  const showAll = () => setVis(prev => ({
    ...prev, [tab]: Object.fromEntries(entries.map(e => [e.id, true])) }));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1 rounded-lg border border-slate-700/40 hover:bg-slate-700/40 transition-colors"
        >
          {open ? 'Done' : hidden > 0 ? `Sections · ${hidden} hidden` : `Sections (${shown}/${entries.length})`}
        </button>
      </div>
      {open && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {entries.map(e => {
            const on = isOn(e.id);
            return (
              <button
                key={e.id}
                onClick={() => setVis(prev => ({ ...prev, [tab]: { ...(prev[tab] || {}), [e.id]: !on } }))}
                className={`px-3 py-2 rounded-lg border text-left text-xs transition-all ${
                  on ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                     : 'bg-slate-800/40 border-slate-700/40 text-slate-500'
                }`}
              >
                <div className="font-medium">{e.label}</div>
                <div className="mt-0.5 opacity-70">
                  {on ? '✓ Visible' : '✗ Hidden'} · {byDefault(e) ? 'shown by default' : 'hidden by default'}
                </div>
              </button>
            );
          })}
          <div className="flex gap-2">
            <button
              onClick={showAll}
              className="flex-1 px-3 py-2 rounded-lg border border-slate-700/40 text-xs text-slate-300 hover:text-slate-100 hover:bg-slate-700/40 transition-colors"
            >
              Show all
            </button>
            <button
              onClick={() => setVis(prev => ({ ...prev, [tab]: {} }))}
              className="flex-1 px-3 py-2 rounded-lg border border-slate-700/40 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700/40 transition-colors"
            >
              Back to defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
// The input look without a width or padding, for the inputs that need their
// own. Appending "w-24" to inputStyle does NOT override its "w-full": two
// classes setting one property on one element are settled by where their rules
// sit in the stylesheet, not by the order they are written in the class list —
// and that order differs between Tailwind's in-browser compiler and the build
// (found when the stylesheet moved to the build in v2.53.0). Overrides replace;
// they never append.
const inputSkin = "bg-slate-900/80 border border-slate-600/50 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all";
const inputStyle = "w-full px-4 py-2.5 " + inputSkin;
// Replace one class of a shared style with another, for the same reason.
const swapClass = (style, from, to) => style.split(/\s+/).map(c => (c === from ? to : c)).join(' ');
const labelStyle = "block text-sm font-medium text-slate-400 mb-1.5";
const buttonPrimary = "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-900 font-semibold px-6 py-2.5 rounded-lg transition-all shadow-lg";
const buttonSecondary = "bg-slate-700 hover:bg-slate-600 text-slate-100 font-medium px-4 py-2 rounded-lg transition-all";

