// ── THE DASHBOARD'S TWO BIG CHARTS, AS COMPONENTS ────────────────────────────
// These were written inline inside DashboardTab, which is why the Sandbox
// originally grew its own thinner versions of the same two pictures rather than
// showing these. Two charts answering one question is the bug this codebase
// keeps producing; a second DRAWING of one is the same mistake in another form.
//
// Extracted verbatim — same series, same annotations, same explanatory text —
// and now given a projections array rather than reading a closure. Each owns
// its own age range and info-card state, so two of them on two tabs do not
// fight over one. `onHide` is optional: the Dashboard passes one that
// unticks the panel in its picker; a caller with no way back passes nothing.
// The Dashboard timeline's selected year. It changes up to five times a second
// while the plan plays, so it is NOT page state: a setState on the Dashboard
// re-rendered all seventeen panels per step (~90 ms, measured), where only the
// timeline and the two charts that draw the cursor need to. A tiny store they
// subscribe to keeps every other panel still.
const makeFocusStore = () => {
  let value = null;
  const subs = new Set();
  return {
    get: () => value,
    set: (v) => { if (v !== value) { value = v; subs.forEach(f => f()); } },
    subscribe: (f) => { subs.add(f); return () => subs.delete(f); },
  };
};
const useFocusAge = (store) => {
  const [, bump] = useState(0);
  useEffect(() => (store ? store.subscribe(() => bump(n => n + 1)) : undefined), [store]);
  return store ? store.get() : null;
};

// The selected year drawn through a chart as a solid cursor, and a click on the
// chart picking the year under the pointer. Both are optional: a chart given no
// store draws exactly as it always has.
//
// The cursor is laid OVER the chart rather than drawn inside it. As a Recharts
// ReferenceLine it re-rendered the whole chart on every step (~25 ms each for
// these two); as an overlay the chart never re-renders, and the line just slides.
// Its x comes from the chart's own rendered axis ticks — the first and last
// visible, interpolated — so it lands exactly where Recharts put that age,
// whatever the scale, range or width.
const ChartYearCursor = ({ focus, retirementAge, hostRef, range }) => {
  const picked = useFocusAge(focus);
  const age = focus ? (picked != null ? picked : retirementAge) : null;
  const [pos, setPos] = useState(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host || age == null || age < range.start || age > range.end) { setPos(null); return undefined; }
    let tries = 0, timer = 0;
    const place = () => {
      const svg = host.querySelector('svg.recharts-surface');
      const grid = host.querySelector('.recharts-cartesian-grid');
      const ticks = [...host.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick')].map(t => {
        const line = t.querySelector('line'), text = t.querySelector('text');
        return { age: Number(text && text.textContent), x: Number(line && line.getAttribute('x1')) };
      }).filter(t => Number.isFinite(t.age) && Number.isFinite(t.x));
      if (!svg || !grid || ticks.length < 2) {
        // ResponsiveContainer draws after it has measured; try again shortly.
        if (tries++ < 20) timer = setTimeout(place, 100);
        return;
      }
      const a = ticks[0], b = ticks[ticks.length - 1];
      const x = a.x + (age - a.age) * (b.x - a.x) / ((b.age - a.age) || 1);
      const g = grid.getBBox();
      const off = svg.getBoundingClientRect().left - host.getBoundingClientRect().left;
      const next = { x: x + off, top: g.y, height: g.height };
      // Only a real move is a state change, or re-measuring after every render
      // (below) would render forever.
      setPos(prev => (prev && Math.abs(prev.x - next.x) < 0.5 && prev.top === next.top
        && prev.height === next.height ? prev : next));
    };
    place();
    const ro = window.ResizeObserver ? new ResizeObserver(() => { tries = 0; place(); }) : null;
    if (ro) ro.observe(host);
    return () => { clearTimeout(timer); if (ro) ro.disconnect(); };
    // No dependency list: re-measured after every render of the chart it sits
    // in, since an edit to the plan can move the axis without moving the age.
  });
  if (!pos) return null;
  return (
    <div aria-hidden="true" className="chart-year-cursor" style={{
      position: 'absolute', left: 0, top: pos.top, height: pos.height, width: 2, marginLeft: -1,
      background: THEME.focus, pointerEvents: 'none', transform: `translateX(${pos.x}px)`,
      transition: prefersReducedMotion() ? 'none' : 'transform .16s ease', boxShadow: `0 0 8px ${THEME.focus}66`,
    }} />
  );
};
const pickYearProps = (onPickAge) => (onPickAge ? {
  onClick: (s) => { if (s && s.activeLabel != null && Number.isFinite(Number(s.activeLabel))) onPickAge(Number(s.activeLabel)); },
  style: { cursor: 'pointer' },
} : {});

function NetWorthProjectionChart({ data, personalInfo, retirementAge, badge, onHide, focus }) {
  const onPickAge = focus ? focus.set : undefined;
  const plotRef = useRef(null);
  const [range, setRange] = useState({ start: personalInfo.myAge, end: personalInfo.legacyAge || MAX_AGE });
  const [infoOpen, setInfoOpen] = useState(false);
  const rows = useMemo(
    () => (data || []).filter(p => p.myAge >= range.start && p.myAge <= range.end),
    [data, range.start, range.end]);
  return (
      <div className={cardStyle}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-100">Net Worth Projection</h3>{badge}
            <InfoCard
              title="Net Worth Projection"
              isOpen={infoOpen}
              onToggle={() => setInfoOpen(v => !v)}
              sections={[
                {
                  heading: 'What This Shows',
                  body: `This chart projects your total net worth from today through age ${personalInfo.legacyAge || 95}, broken down by the type of money you hold. The stacked colored areas show how your wealth is distributed, while the cyan line traces your combined total.`
                },
                {
                  heading: 'The Colored Layers',
                  items: [
                    { color: SERIES.preTax, label: 'Pre-Tax', desc: '401(k), Traditional IRA, 403(b), 457(b). Contributions reduced your taxable income, but every dollar withdrawn in retirement will be taxed as ordinary income. This is typically your largest bucket during accumulation.' },
                    { color: SERIES.roth, label: 'Roth', desc: 'Roth IRA, Roth 401(k), etc. You paid tax on contributions upfront, so withdrawals in retirement are completely tax-free. This layer growing large is very favorable for retirement flexibility.' },
                    { color: SERIES.brokerage, label: 'Brokerage', desc: 'Taxable investment accounts. Withdrawals may generate capital gains taxes, but there are no age restrictions or required minimum distributions, and heirs inherit with a stepped-up cost basis.' },
                    { color: SERIES.hsa, label: 'HSA', desc: 'Health Savings Accounts, shown only when you have one. Tax-free for medical expenses at any age; other withdrawals are ordinary income, plus a 20% penalty before 65. A spouse can keep an inherited HSA tax-free, but for anyone else the whole balance becomes taxable income in the year of death — which is why the after-tax legacy discounts it like a pre-tax account.' },
                    { color: SERIES.nonLiquid, label: 'Non-Liquid Assets', desc: 'Real estate, vehicles, business equity — things with value but not easily converted to spending cash. Shown net of any remaining mortgages or debt.' }
                  ]
                },
                {
                  heading: 'The Lines & Markers',
                  items: [
                    { color: '#22d3ee', label: 'Cyan Line — Total Net Worth', desc: 'The sum of all four layers. This is your complete financial picture at each age.' },
                    { color: '#ef4444', label: 'Red Dashed Line — Retirement Age', desc: 'Marks when you plan to stop working. Expect the curve to shift from growing (contributions + returns) to declining (withdrawals for living expenses).' }
                  ]
                },
                {
                  heading: 'How to Read It',
                  body: `Before retirement the chart should climb as contributions and market returns build wealth. After retirement it typically descends as you draw down savings. A chart that stays above zero through age ${personalInfo.legacyAge || 95} suggests your plan is sustainable. If the total drops to zero before age ${personalInfo.legacyAge || 95}, you may need to save more, delay retirement, or reduce spending.`,
                  tip: 'Use the age range buttons above the chart to zoom into specific periods. "To Retire" focuses on the accumulation phase, "Retire-85" focuses on the critical early drawdown years when sequence-of-returns risk is highest.'
                },
                {
                  heading: 'What\'s NOT Included',
                  body: 'All values are shown in future (nominal) dollars — they include inflation, so the numbers look larger than today\'s purchasing power. Taxes are accounted for in withdrawals but not shown as a separate deduction on the chart. The projection uses your fixed expected return rates (CAGR) for each account — real markets will be more volatile (see Monte Carlo for stress-testing).'
                }
              ]}
            />
              {onHide && (
                <button onClick={onHide} className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded hover:bg-slate-700/50 transition-colors">Hide</button>
              )}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-400">Age:</span>
            <input
              type="number"
              value={range.start}
              onChange={e => setRange(prev => ({ ...prev, start: Math.max(personalInfo.myAge, Number(e.target.value)) }))}
              className="w-16 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-100 text-center"
            />
            <span className="text-slate-500">to</span>
            <input
              type="number"
              value={range.end}
              onChange={e => setRange(prev => ({ ...prev, end: Math.min(personalInfo.legacyAge || MAX_AGE, Number(e.target.value)) }))}
              className="w-16 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-100 text-center"
            />
            <div className="flex gap-1 ml-2">
              <button 
                onClick={() => setRange({ start: personalInfo.myAge, end: retirementAge + 5 })}
                className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-300"
              >
                To Retire
              </button>
              <button 
                onClick={() => setRange({ start: retirementAge, end: 85 })}
                className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-300"
              >
                Retire-85
              </button>
              <button 
                onClick={() => setRange({ start: personalInfo.myAge, end: personalInfo.legacyAge || MAX_AGE })}
                className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-300"
              >
                All
              </button>
            </div>
          </div>
        </div>
        <div ref={plotRef} style={{ ...chartBox(288), position: 'relative' }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} {...pickYearProps(onPickAge)}>
              <CartesianGrid strokeDasharray="3 3" stroke={THEME.grid} />
              <XAxis dataKey="myAge" stroke={THEME.axis} tick={{ fill: THEME.axis }} />
              <YAxis stroke={THEME.axis} tick={{ fill: THEME.axis }} tickFormatter={v => `$${(v/1e6).toFixed(1)}M`} />
              <Tooltip contentStyle={{ backgroundColor: THEME.surfaceRaised, border: `1px solid ${THEME.grid}`, borderRadius: '8px' }} formatter={v => formatCurrency(v)} labelFormatter={l => `Age ${l}`} />
              <Legend formatter={legendInk} />
              {/* A 1px surface-coloured stroke between stacked bands: the gap is
                  what lets a reader see the boundary without relying on the two
                  fills being far enough apart on their own. */}
              <Area type="monotone" dataKey="preTaxBalance" stackId="1" fill={SERIES.preTax} stroke={SERIES.preTax} strokeWidth={1.5} fillOpacity={0.72} name="Pre-Tax" />
              <Area type="monotone" dataKey="rothBalance" stackId="1" fill={SERIES.roth} stroke={SERIES.roth} strokeWidth={1.5} fillOpacity={0.72} name="Roth" />
              <Area type="monotone" dataKey="brokerageBalance" stackId="1" fill={SERIES.brokerage} stroke={SERIES.brokerage} strokeWidth={1.5} fillOpacity={0.72} name="Brokerage" />
              {/* Only when there is one — an empty band still claims a legend entry. */}
              {(data || []).some(r => (r.hsaBalance || 0) > 0) && (
                <Area type="monotone" dataKey="hsaBalance" stackId="1" fill={SERIES.hsa} stroke={SERIES.hsa} strokeWidth={1.5} fillOpacity={0.72} name="HSA" />
              )}
              <Area type="monotone" dataKey="netAssetValue" stackId="1" fill={SERIES.nonLiquid} stroke={SERIES.nonLiquid} strokeWidth={1.5} fillOpacity={0.72} name="Non-Liquid Assets" />
              <Line type="monotone" dataKey="totalNetWorth" stroke={THEME.inkPrimary} strokeWidth={2} dot={false} name="Total Net Worth" />
              <ReferenceLine x={retirementAge} stroke={THEME.reference} strokeDasharray="5 5" />
            </ComposedChart>
          </ResponsiveContainer>
          <ChartYearCursor focus={focus} retirementAge={retirementAge} hostRef={plotRef} range={range} />
        </div>
      </div>
  );
}

function IncomeVsSpendingChart({ data, personalInfo, retirementAge, badge, onHide, focus }) {
  const onPickAge = focus ? focus.set : undefined;
  const plotRef = useRef(null);
  const [range, setRange] = useState({ start: personalInfo.myAge, end: personalInfo.legacyAge || MAX_AGE });
  const [infoOpen, setInfoOpen] = useState(false);
  const [showConversions, setShowConversions] = useState(true);
  const rows = useMemo(
    () => (data || []).filter(p => p.myAge >= range.start && p.myAge <= range.end),
    [data, range.start, range.end]);
  const planHasConversions = useMemo(
    () => (data || []).some(p => (p.rothConversion || 0) > 0), [data]);
  return (
      <div className={cardStyle}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-100">Retirement Income vs Spending Needs</h3>{badge}
            <InfoCard
              title="Retirement Income vs Spending"
              isOpen={infoOpen}
              onToggle={() => setInfoOpen(v => !v)}
              sections={[
                {
                  heading: 'What This Shows',
                  body: 'This chart answers the fundamental retirement question: will your income cover your spending? The stacked bars represent your total gross income from all sources at each age, while the lines show what you want to spend, what you actually take home after taxes, and how much goes to taxes.'
                },
                {
                  heading: 'The Income Bars (Stacked)',
                  body: 'Each colored bar segment is a different source of income. They stack on top of each other so the total bar height equals your total gross income for that year.',
                  items: [
                    { color: SERIES.earnedIncome, label: 'Earned Income', desc: 'Salary, wages, or business income while you\'re still working. This typically drops to zero at your retirement age.' },
                    { color: SERIES.socialSecurity, label: 'Social Security', desc: 'Your monthly Social Security benefit, shown annually. Starts at your claiming age (usually 62–70). Delaying increases the amount.' },
                    { color: SERIES.pension, label: 'Pension', desc: 'Any defined-benefit pension income. Starts at the age you specified in your income streams.' },
                    { color: SERIES.otherIncome, label: 'Other Income', desc: 'Rental income, annuities, part-time work, or any other income streams you\'ve entered.' },
                    { color: SERIES.withdrawalVoluntary, label: 'Portfolio Withdrawal', desc: 'Money pulled from your retirement accounts (401k, IRA, Roth, brokerage) to cover the gap between your guaranteed income and your spending needs. This is the piece the planner calculates for you.' },
                    { color: SERIES.rothConversion, label: 'Roth Conversion (translucent)', desc: 'Only shown when your plan includes Roth conversions. This is an account TRANSFER (pre-tax → Roth), not spendable income — that\'s why it\'s drawn translucent with a dashed outline, unlike the solid income segments. It\'s taxed as ordinary income in the year it happens, which is what drives the tax spike in conversion years. Use the checkbox above the chart to hide it if a large conversion dominates the scale.' }
                  ]
                },
                {
                  heading: 'The Lines',
                  items: [
                    { color: THEME.lines.target, label: 'Bright Solid — Desired Spending', desc: 'The annual income you said you need in retirement (from Personal Info), adjusted upward each year for inflation. If Spending Phases are enabled, this line also steps down at your go-go and slow-go boundary ages. This is your spending target.' },
                    { color: THEME.lines.netAfterTax, label: 'Green Dashed — Net Income After Tax', desc: 'What you actually take home after federal and state taxes. This is the number that matters — it needs to meet or exceed the red line for your plan to work.' },
                    { color: THEME.lines.taxBurden, label: 'Amber Dotted — Total Tax', desc: 'Your combined federal + state + FICA payroll tax burden. The gap between the top of the bars and the green dashed line.' }
                  ]
                },
                {
                  heading: 'How to Read It',
                  body: 'The key relationship is between the green dashed line (net income) and the red solid line (desired spending). When green is above red, you\'re in good shape — you have more income than you need. When they\'re close together, your plan is tight. If the bars shrink below the red line, your portfolio can\'t fully cover your spending. One important exception: in Roth conversion years, the green net-income line dips (sometimes below the red line) because the conversion tax is being prepaid that year. That\'s a deliberate transfer of tax from your future to your present — not a spending shortfall. The pink translucent segment marks those years.',
                  tip: 'Watch for the "income gap" in early retirement — the years between when earned income stops and when Social Security begins. This is often when portfolio withdrawals are heaviest and sequence-of-returns risk is greatest. Use "First 10yr Ret" to zoom in on this critical period.'
                },
                {
                  heading: 'Key Concepts',
                  items: [
                    { icon: '📊', label: 'Gross vs Net', desc: 'The bars show gross (pre-tax) income. You can\'t spend all of it — taxes take a portion. The green dashed line shows what\'s actually available to spend.' },
                    { icon: '📈', label: 'Inflation Effect', desc: 'Notice the red line climbs over time — that\'s inflation increasing your spending needs. Your income sources with COLA adjustments (like Social Security) help keep pace.' },
                    { icon: '💰', label: 'Portfolio Withdrawal', desc: 'The gold bar is calculated to bridge the gap between your other income and your spending target, accounting for taxes on the withdrawal itself. Larger gold bars mean heavier reliance on savings.' },
                    { icon: '🏛️', label: 'QCD Savings', desc: 'If you\'ve set a charitable giving percentage in Personal Info, Qualified Charitable Distributions can reduce your tax burden, which shows up as a higher green line (more net income) for the same gross income.' }
                  ]
                }
              ]}
            />
              {onHide && (
                <button onClick={onHide} className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded hover:bg-slate-700/50 transition-colors">Hide</button>
              )}
          </div>
          <div className="flex items-center gap-2 text-sm">
            {planHasConversions && (
              <label className="flex items-center gap-1.5 mr-2 text-slate-400 cursor-pointer select-none" title="Roth conversions are account transfers, not spendable income — shown as a distinct translucent segment so the tax spike in conversion years is explained. Uncheck if a large conversion dominates the chart scale.">
                <input
                  type="checkbox"
                  checked={showConversions}
                  onChange={e => setShowConversions(e.target.checked)}
                  className="accent-pink-500"
                />
                <span>Roth conversions</span>
              </label>
            )}
            <span className="text-slate-400">Age:</span>
            <input
              type="number"
              value={range.start}
              onChange={e => setRange(prev => ({ ...prev, start: Math.max(personalInfo.myAge, Number(e.target.value)) }))}
              className="w-16 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-100 text-center"
            />
            <span className="text-slate-500">to</span>
            <input
              type="number"
              value={range.end}
              onChange={e => setRange(prev => ({ ...prev, end: Math.min(personalInfo.legacyAge || 95, Number(e.target.value)) }))}
              className="w-16 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-100 text-center"
            />
            <div className="flex gap-1 ml-2">
              <button 
                onClick={() => setRange({ start: personalInfo.myAge, end: retirementAge + 5 })}
                className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-300"
              >
                To Retire
              </button>
              <button 
                onClick={() => setRange({ start: retirementAge, end: retirementAge + 10 })}
                className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-300"
              >
                First 10yr Ret
              </button>
              <button 
                onClick={() => setRange({ start: personalInfo.myAge, end: personalInfo.legacyAge || 95 })}
                className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-300"
              >
                All
              </button>
            </div>
          </div>
        </div>
        <div ref={plotRef} style={{ ...chartBox(288), position: 'relative' }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} {...pickYearProps(onPickAge)}>
              <CartesianGrid strokeDasharray="3 3" stroke={THEME.grid} />
              <XAxis dataKey="myAge" stroke={THEME.axis} tick={{ fill: THEME.axis }} />
              <YAxis stroke={THEME.axis} tick={{ fill: THEME.axis }} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
              <Tooltip contentStyle={{ backgroundColor: THEME.surfaceRaised, border: `1px solid ${THEME.grid}`, borderRadius: '8px' }} formatter={v => formatCurrency(v)} labelFormatter={l => `Age ${l}`} />
              <Legend formatter={legendInk} />
              <Bar dataKey="earnedIncome" stackId="income" fill={SERIES.earnedIncome} name="Earned Income" />
              <Bar dataKey="socialSecurity" stackId="income" fill={SERIES.socialSecurity} name="Social Security" />
              <Bar dataKey="pension" stackId="income" fill={SERIES.pension} name="Pension" />
              <Bar dataKey="otherIncome" stackId="income" fill={SERIES.otherIncome} name="Other Income" />
              <Bar dataKey="portfolioWithdrawal" stackId="income" fill={SERIES.withdrawalVoluntary} name="Portfolio Withdrawal" />
              {/* The conversion-tax draw is a REAL withdrawal (it pays the conversion's
                  tax bill), so it stacks as solid income; it flows straight out again
                  via the tax line. */}
              <Bar dataKey="conversionTaxWithdrawal" stackId="income" fill={SERIES.conversionTaxDraw} name="Conversion Tax Draw" />
              {/* Roth conversions ride on top of the stack but are styled translucent
                  with a dashed outline: they are account TRANSFERS (pre-tax → Roth),
                  not spendable income, so they must read as "different in kind" from
                  the solid income segments. Their presence explains why the tax line
                  spikes in conversion years. */}
              {planHasConversions && showConversions && (
                <Bar dataKey="rothConversion" stackId="income" fill={SERIES.rothConversion} fillOpacity={0.3} stroke={SERIES.rothConversion} strokeDasharray="4 2" name="Roth Conversion (transfer)" />
              )}
              <Line type="monotone" dataKey="desiredIncome" stroke={THEME.lines.target} strokeWidth={3} dot={false} name="Desired Spending" />
              <Line type="monotone" dataKey="netIncome" stroke={THEME.lines.netAfterTax} strokeWidth={2} dot={false} name="Net Income (after tax)" strokeDasharray="5 5" />
              <Line type="monotone" dataKey="totalTax" stroke={THEME.lines.taxBurden} strokeWidth={2} dot={false} name="Total Tax" strokeDasharray="2 3" />
              <ReferenceLine x={retirementAge} stroke={THEME.reference} strokeDasharray="5 5" />
            </ComposedChart>
          </ResponsiveContainer>
          <ChartYearCursor focus={focus} retirementAge={retirementAge} hostRef={plotRef} range={range} />
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Bars show gross income sources. <span style={{ color: THEME.lines.target }}>Bright solid line</span> = desired spending.
          <span style={{ color: THEME.lines.netAfterTax }} className="ml-1">Green dashed line</span> = net income after taxes (affected by QCD savings).
          <span style={{ color: THEME.lines.taxBurden }} className="ml-1">Amber dotted line</span> = total tax burden.
          {planHasConversions && showConversions && (
            <span style={{ color: SERIES.rothConversion }} className="ml-1">Translucent outlined segment</span>
          )}
          {planHasConversions && showConversions && (
            <span> = Roth conversion — an account transfer, not spendable income. Its tax is prepaid in that year, which is why the green line dips during the conversion window.</span>
          )}
        </p>
      </div>
  );
}

// ── EVERY DASHBOARD PANEL, AS A COMPONENT ────────────────────────────────────
// Extracted so the Sandbox can show any of them rather than growing its own
// thinner copies. Same code, same explanatory text, one definition — a change
// to a panel now lands on both tabs at once, which is the whole point.
//
// They share one prop contract: a `ctx` carrying everything a panel might need
// from the tab it sits on, an optional `badge` for marking a what-if, and an
// optional `onHide`. A single bag rather than bespoke prop lists is deliberate:
// it is what lets the registry below render any of them without knowing which.

// Two of the summary cards follow the Year by year timeline while it is shown.
// "At Retirement" becomes "At age N" and "Retirement Income" becomes "Income at
// age N"; the timeline starts on the retirement year, so until the reader moves
// it they read exactly as before. They subscribe to the year themselves, so the
// rest of the summary row does not re-render while the plan plays.
const useSelectedYear = (ctx) => {
  const picked = useFocusAge(ctx.focus);
  const age = picked != null ? picked : ctx.retirementAge;
  const rows = ctx.projections || [];
  const i = rows.findIndex(r => r.myAge === age);
  return { age, row: i >= 0 ? rows[i] : null, prev: i > 0 ? rows[i - 1] : null };
};
const YearDelta = ({ value, prev, upIsGood, label }) => {
  if (prev == null) return null;
  const d = value - prev;
  if (Math.abs(d) < 1) return <span className="text-slate-500">{label} same as last year</span>;
  const cls = upIsGood === null ? 'text-slate-500' : ((d > 0) === upIsGood ? 'text-emerald-400' : 'text-red-400');
  return <span className={cls}>{label} {d > 0 ? '+' : '−'}{formatCurrency(Math.abs(d))} vs last year</span>;
};
const yearCardTitle = (age, ctx) => `timeline: age ${age}${age === ctx.retirementAge ? ' (retirement)' : ''} — move the Year by year timeline below to change it`;
function SelectedYearWorthCard({ ctx }) {
  const { age, row, prev } = useSelectedYear(ctx);
  const worth = useTweened(row ? (row.totalNetWorth || 0) : 0);
  if (!row) return null;
  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-4 py-3" title={yearCardTitle(age, ctx)}>
      <div className="text-slate-500 text-xs mb-0.5">
        At age {age} · {row.year}{age === ctx.retirementAge ? ' · retirement' : ''}
      </div>
      <div className="text-xl font-bold text-slate-100 tabular-nums">{formatCurrency(Math.round(worth))}</div>
      <div className="text-xs text-slate-500 tabular-nums">Portfolio: {formatCurrency(row.totalPortfolio)}</div>
      <div className="text-xs tabular-nums">
        <YearDelta label="portfolio" value={row.totalPortfolio || 0} prev={prev && (prev.totalPortfolio || 0)} upIsGood={true} />
      </div>
    </div>
  );
}
function SelectedYearIncomeCard({ ctx }) {
  const { age, row, prev } = useSelectedYear(ctx);
  const income = useTweened(row ? (row.totalIncome || 0) : 0);
  if (!row) return null;
  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-4 py-3" title={yearCardTitle(age, ctx)}>
      <div className="text-slate-500 text-xs mb-0.5">Income at age {age}</div>
      <div className="text-xl font-bold text-slate-100 tabular-nums">{formatCurrency(Math.round(income))}</div>
      <div className="text-xs text-slate-500 tabular-nums">SS + Pension + Other: {formatCurrency(row.totalGuaranteedIncome || 0)}</div>
      <div className="text-xs text-slate-500 tabular-nums">
        Taxes {formatCurrency(row.totalTax || 0)}
        {(row.rothConversion || 0) > 0 && <> · converting {formatCurrency(row.rothConversion)} to Roth</>}
      </div>
      <div className="text-xs tabular-nums">
        <YearDelta label="taxes" value={row.totalTax || 0} prev={prev && (prev.totalTax || 0)} upIsGood={false} />
      </div>
    </div>
  );
}

function SummaryCardsPanel({ ctx, badge, onHide }) {
  const { projections, personalInfo, retirementAge, accounts, assets, incomeStreams,
          oneTimeEvents, recurringExpenses, computeProjections, current,
          retirementProjection, isPreRetirement, dashSavingsRate,
          dashAfterTaxSavingsRate, dashMyContributions, dashTotalContributions } = ctx;
  // Each panel owns its own info-card state, so two copies of one panel on two
  // tabs cannot open and close each other's explanations.
  const [openInfoCard, setOpenInfoCard] = useState(null);
  const toggleInfoCard = (id) => setOpenInfoCard(v => (v === id ? null : id));
  // The Dashboard passes one that unticks the panel in its picker, which is
  // also where it comes back from.
  const toggleVisibility = () => { if (onHide) onHide(); };
  // One rule, in the engine: the estate value and what it is worth after the
  // heirs' tax on inherited pre-tax dollars.
  const legacy = afterTaxLegacyValue(projections, {
    legacyAge: personalInfo.legacyAge || 95,
    heirTaxRate: personalInfo.heirTaxRate ?? 0.25,
  });
return (
      <div>
        <div className="flex items-center gap-2 mb-2">
          {badge}
          <InfoCard
            title="Summary Cards"
            isOpen={openInfoCard === 'summaryCards'}
            onToggle={() => toggleInfoCard('summaryCards')}
            sections={[
              {
                heading: 'What These Show',
                body: 'These cards are your financial dashboard at a glance — the key numbers that summarize your entire retirement plan. Each card answers a different question about where you stand.'
              },
              {
                heading: 'The Cards',
                items: [
                  { icon: '💰', label: 'Total Net Worth', desc: 'Everything you own minus everything you owe, right now. This includes retirement accounts, brokerage, HSA, plus non-liquid assets like real estate (net of mortgages). It\'s your complete financial snapshot today.' },
                  { icon: '📊', label: 'Liquid Portfolio', desc: 'Just your investable retirement accounts (401k, IRA, Roth, brokerage, HSA) — money that can be converted to income. This excludes real estate and other illiquid assets since you can\'t easily spend those in retirement.' },
                  { icon: '🎯', label: 'At Retirement', desc: 'Your projected total net worth on the day you retire, based on continued contributions and expected growth rates. The subtitle shows just the liquid portfolio portion. This is the nest egg that needs to fund your retirement.' },
                  { icon: '📥', label: 'Retirement Income', desc: 'Your projected guaranteed annual income at retirement — Social Security, pensions, and any other recurring income streams. This is money that arrives regardless of market performance.' },
                  { icon: '🏦', label: `Legacy at ${personalInfo.legacyAge || 95}`, desc: `What's projected to be left at age ${personalInfo.legacyAge || 95} if you follow your plan. A positive number means you have money to leave to heirs or as a safety margin. Zero or negative means your plan may not sustain you that long.` },
                  { icon: '💵', label: 'Savings Rate', desc: 'Only shown if you\'re still working. Your annual retirement contributions as a percentage of earned income. Financial planners typically recommend 15–20% minimum. This card shows your personal contributions and total (including employer match).' }
                ]
              },
              {
                heading: 'How to Use These',
                body: `Think of these as your retirement vital signs. The most important relationship is between your "At Retirement" portfolio and "Retirement Income" — together they determine if your plan is sustainable. The "Legacy at ${personalInfo.legacyAge || 95}" card is your bottom-line indicator: positive means your plan works, near-zero means it's tight.`,
                tip: 'All dollar amounts are in future (nominal) dollars, meaning they include inflation. A retirement portfolio of $3M in 20 years has less purchasing power than $3M today. The planner accounts for this in its calculations, but the raw numbers may look larger than expected.'
              }
            ]}
          />
          {onHide && (
          <button
            onClick={() => toggleVisibility('summaryCards')}
            className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded hover:bg-slate-700/50 transition-colors"
            title="Hide this section"
          >
            Hide
          </button>
          )}
        </div>
        {/* KPI tiles. These used to be five unrelated hues — emerald, sky, amber,
            purple, pink — one per tile. That reads as a category legend, which
            invites the eye to look for a meaning the colours do not have: they
            are five money figures, and none of them is "the green one" in any
            sense the palette can defend. Colour on a KPI tile has to earn its
            place by encoding something, so it is now reserved for the one number
            here that has a good/bad reading — the savings rate, which already has
            savingsRateStatus() to say which. The rest are ink, and the label
            underneath does the wayfinding the colour was pretending to do. */}
        <div className={`grid gap-3 ${isPreRetirement && dashSavingsRate !== null ? 'grid-cols-2 md:grid-cols-3 2xl:grid-cols-6' : 'grid-cols-2 md:grid-cols-3 2xl:grid-cols-5'}`}>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-4 py-3">
          <div className="text-slate-500 text-xs mb-0.5">Total Net Worth</div>
          <div className="text-xl font-bold text-slate-100">{formatCurrency(current?.totalNetWorth)}</div>
          <div className="text-xs text-slate-500">Portfolio + Assets</div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-4 py-3">
          <div className="text-slate-500 text-xs mb-0.5">Liquid Portfolio</div>
          <div className="text-xl font-bold text-slate-100">{formatCurrency(current?.totalPortfolio)}</div>
          <div className="text-xs text-slate-500">Retirement funds</div>
        </div>
        {ctx.focus ? <SelectedYearWorthCard ctx={ctx} /> : (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-4 py-3">
          <div className="text-slate-500 text-xs mb-0.5">At Retirement (Age {retirementAge})</div>
          <div className="text-xl font-bold text-slate-100">{formatCurrency(retirementProjection?.totalNetWorth)}</div>
          <div className="text-xs text-slate-500">Portfolio: {formatCurrency(retirementProjection?.totalPortfolio)}</div>
        </div>
        )}
        {ctx.focus ? <SelectedYearIncomeCard ctx={ctx} /> : (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-4 py-3">
          <div className="text-slate-500 text-xs mb-0.5">Retirement Income</div>
          <div className="text-xl font-bold text-slate-100">{formatCurrency(retirementProjection?.totalGuaranteedIncome)}</div>
          <div className="text-xs text-slate-500">SS + Pension + Other</div>
        </div>
        )}
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-4 py-3">
          {/* The age MEASURED, not the age requested. With survivor modelling on
              the plan ends when both spouses have died, which can be before the
              planning age — and a tile headed "Legacy at 95" showing the balance
              at 88 is simply a wrong label. */}
          <div className="text-slate-500 text-xs mb-0.5">Legacy at {legacy ? legacy.age : (personalInfo.legacyAge || 95)}</div>
          <div className="text-xl font-bold text-slate-100">{formatCurrency(legacy?.estate)}</div>
          <div className="text-xs text-slate-500">Total estate value</div>
          {/* The headline counts a pre-tax dollar and a Roth dollar as the same
              dollar. They are not, and the gap between these two lines is the
              whole argument for converting: an earlier retirement that opens a
              conversion window can lower the top number and raise this one. */}
          {legacy && (
            <div className="mt-1.5 pt-1.5 border-t border-slate-700/50">
              <div className="text-base font-bold" style={{ color: SERIES.roth }}>{formatCurrency(legacy.afterTax)}</div>
              <div className="text-xs text-slate-500">
                after tax · heirs at {Math.round(legacy.heirTaxRate * 100)}%
                {legacy.taxOnPreTax > 0 && <> · −{formatCurrency(legacy.taxOnPreTax)}</>}
              </div>
              {/* The Roth optimizer ranks strategies on the PORTFOLIO slice of
                  this figure, because two conversion strategies differ in their
                  accounts and not in the house. Naming the difference here is
                  what lets a reader hold the two screens side by side instead of
                  concluding one of them is broken. */}
              {legacy.nonPortfolio > 0 && (
                <div className="text-[11px] text-slate-600 mt-0.5">
                  includes {formatCurrency(legacy.nonPortfolio)} of property and other assets;
                  the Roth optimizer ranks on the portfolio alone
                </div>
              )}
            </div>
          )}
        </div>
        {isPreRetirement && dashSavingsRate !== null && (
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-4 py-3">
            <div className="text-slate-500 text-xs mb-0.5">Savings Rate</div>
            <div className="flex flex-col">
              <div>
                <span className="text-xl font-bold" style={{ color: THEME.status[savingsRateStatus(dashSavingsRate)] }}>{dashSavingsRate.toFixed(1)}%</span>
                <span className="text-xs text-slate-500 ml-1">gross</span>
              </div>
              {dashAfterTaxSavingsRate !== null && (
                <div>
                  <span className="text-base font-bold" style={{ color: THEME.status[savingsRateStatus(dashAfterTaxSavingsRate)] }}>{dashAfterTaxSavingsRate.toFixed(1)}%</span>
                  <span className="text-xs text-slate-500 ml-1">net</span>
                </div>
              )}
            </div>
            <div className="text-xs text-slate-500">
              {formatCurrency(dashMyContributions)}/yr (your contributions)
              {dashTotalContributions > dashMyContributions ? ` · ${formatCurrency(dashTotalContributions)} with employer` : ''}
            </div>
          </div>
        )}
      </div>
      </div>
      );
}

function WithdrawalRatePanel({ ctx, badge, onHide }) {
  const { projections, personalInfo, retirementAge, accounts, assets, incomeStreams,
          oneTimeEvents, recurringExpenses, computeProjections, current,
          retirementProjection, isPreRetirement, dashSavingsRate,
          dashAfterTaxSavingsRate, dashMyContributions, dashTotalContributions } = ctx;
  // Each panel owns its own info-card state, so two copies of one panel on two
  // tabs cannot open and close each other's explanations.
  const [openInfoCard, setOpenInfoCard] = useState(null);
  const toggleInfoCard = (id) => setOpenInfoCard(v => (v === id ? null : id));
  // The Dashboard passes one that unticks the panel in its picker, which is
  // also where it comes back from.
  const toggleVisibility = () => { if (onHide) onHide(); };

        // Calculate withdrawal rates for retirement years only
        const retirementData = projections.filter(p => p.myAge >= personalInfo.myRetirementAge && p.totalPortfolio > 0);
        const withdrawalRateData = retirementData.map(p => {
          const totalWithdrawalRate = p.totalPortfolio > 0 ? (p.portfolioWithdrawal / p.totalPortfolio) * 100 : 0;
          const rmdRate = p.totalPortfolio > 0 ? (p.rmd / p.totalPortfolio) * 100 : 0;
          const neededRate = p.totalPortfolio > 0 ? ((p.portfolioWithdrawal - (p.excessRMD || 0)) / p.totalPortfolio) * 100 : 0;
          const excessRate = p.totalPortfolio > 0 ? ((p.excessRMD || 0) / p.totalPortfolio) * 100 : 0;
          return {
            ...p,
            withdrawalRate: totalWithdrawalRate,
            rmdRate,
            neededRate: Math.max(0, neededRate),
            excessRate
          };
        });
        
        // Find peak and average withdrawal rates
        const peakData = withdrawalRateData.reduce((max, p) => p.withdrawalRate > (max?.withdrawalRate || 0) ? p : max, null);
        const avgWithdrawalRate = withdrawalRateData.length > 0 
          ? withdrawalRateData.reduce((sum, p) => sum + p.withdrawalRate, 0) / withdrawalRateData.length 
          : 0;
        
        // RMD-specific metrics
        const rmdYears = withdrawalRateData.filter(p => p.rmd > 0);
        const peakRmdRate = rmdYears.reduce((max, p) => p.rmdRate > (max?.rmdRate || 0) ? p : max, null);
        const peakExcessRate = rmdYears.reduce((max, p) => p.excessRate > (max?.excessRate || 0) ? p : max, null);
        const avgExcessRate = rmdYears.length > 0
          ? rmdYears.reduce((sum, p) => sum + p.excessRate, 0) / rmdYears.length
          : 0;
        
        // Count years above thresholds
        const yearsAbove4 = withdrawalRateData.filter(p => p.withdrawalRate > 4).length;
        const yearsAbove6 = withdrawalRateData.filter(p => p.withdrawalRate > 6).length;
        
        // Color coding helper
        const getRateColor = (rate) => {
          if (rate <= 4) return 'text-emerald-400';
          if (rate <= 6) return 'text-amber-400';
          return 'text-red-400';
        };
        
        const getRateBgColor = (rate) => {
          if (rate <= 4) return 'bg-emerald-500/20 border-emerald-500/50';
          if (rate <= 6) return 'bg-amber-500/20 border-amber-500/50';
          return 'bg-red-500/20 border-red-500/50';
        };
        
        return (
          <>
            {/* Portfolio Stress Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className={`border rounded-lg px-4 py-3 ${getRateBgColor(peakData?.withdrawalRate || 0)}`}>
                <div className="text-slate-400 text-xs mb-0.5">Peak Withdrawal Rate</div>
                <div className={`text-xl font-bold ${getRateColor(peakData?.withdrawalRate || 0)}`}>
                  {(peakData?.withdrawalRate || 0).toFixed(1)}%
                </div>
                <div className="text-xs text-slate-500">Age {peakData?.myAge || '—'} ({peakData?.year || '—'})</div>
              </div>
              <div className={`border rounded-lg px-4 py-3 ${getRateBgColor(avgWithdrawalRate)}`}>
                <div className="text-slate-400 text-xs mb-0.5">Avg Withdrawal Rate</div>
                <div className={`text-xl font-bold ${getRateColor(avgWithdrawalRate)}`}>
                  {avgWithdrawalRate.toFixed(1)}%
                </div>
                <div className="text-xs text-slate-500">During retirement</div>
              </div>
              <div className={`border rounded-lg px-4 py-3 ${yearsAbove4 > 5 ? 'bg-amber-500/20 border-amber-500/50' : 'bg-slate-800/60 border-slate-700/50'}`}>
                <div className="text-slate-400 text-xs mb-0.5">Years Above 4%</div>
                <div className={`text-xl font-bold ${yearsAbove4 > 5 ? 'text-amber-400' : 'text-slate-300'}`}>
                  {yearsAbove4} years
                </div>
                <div className="text-xs text-slate-500">Traditional "safe" threshold</div>
              </div>
              <div className={`border rounded-lg px-4 py-3 ${yearsAbove6 > 0 ? 'bg-red-500/20 border-red-500/50' : 'bg-slate-800/60 border-slate-700/50'}`}>
                <div className="text-slate-400 text-xs mb-0.5">Years Above 6%</div>
                <div className={`text-xl font-bold ${yearsAbove6 > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {yearsAbove6} years
                </div>
                <div className="text-xs text-slate-500">High stress zone</div>
              </div>
            </div>
            
            {/* RMD Excess Cards - only show if there are RMD years */}
            {rmdYears.length > 0 && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="border rounded-lg px-4 py-3 bg-orange-500/20 border-orange-500/50">
                  <div className="text-slate-400 text-xs mb-0.5">Peak RMD Rate</div>
                  <div className="text-xl font-bold text-orange-400">
                    {(peakRmdRate?.rmdRate || 0).toFixed(1)}%
                  </div>
                  <div className="text-xs text-slate-500">Age {peakRmdRate?.myAge || '—'}</div>
                </div>
                <div className="border rounded-lg px-4 py-3 bg-cyan-500/20 border-cyan-500/50">
                  <div className="text-slate-400 text-xs mb-0.5">Peak Excess RMD Rate</div>
                  <div className="text-xl font-bold text-cyan-400">
                    {(peakExcessRate?.excessRate || 0).toFixed(1)}%
                  </div>
                  <div className="text-xs text-slate-500">Age {peakExcessRate?.myAge || '—'} (forced withdrawal)</div>
                </div>
                <div className="border rounded-lg px-4 py-3 bg-cyan-500/10 border-cyan-500/30">
                  <div className="text-slate-400 text-xs mb-0.5">Avg Excess RMD Rate</div>
                  <div className="text-xl font-bold text-cyan-300">
                    {avgExcessRate.toFixed(1)}%
                  </div>
                  <div className="text-xs text-slate-500">During RMD years</div>
                </div>
                <div className="border rounded-lg px-4 py-3 bg-slate-800/60 border-slate-700/50">
                  <div className="text-slate-400 text-xs mb-0.5">RMD Years</div>
                  <div className="text-xl font-bold text-slate-300">
                    {rmdYears.length} years
                  </div>
                  <div className="text-xs text-slate-500">Age 75+</div>
                </div>
              </div>
            )}
            
            {/* Withdrawal Rate Over Time Chart */}
            <div className={cardStyle}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-slate-100">Portfolio Withdrawal Rate Over Time</h3>{badge}
                  <InfoCard
                    title="Portfolio Withdrawal Rate"
                    isOpen={openInfoCard === 'withdrawalRate'}
                    onToggle={() => toggleInfoCard('withdrawalRate')}
                    sections={[
                      {
                        heading: 'What This Shows',
                        body: 'This section monitors how hard you\'re drawing down your portfolio each year of retirement. The withdrawal rate — how much you take out as a percentage of your remaining portfolio — is one of the most important indicators of plan sustainability.'
                      },
                      {
                        heading: 'The Summary Cards',
                        items: [
                          { icon: '📈', label: 'Peak Withdrawal Rate', desc: 'The highest single-year withdrawal rate during retirement. This is your most stressed year. Color-coded: green (≤4%), amber (4–6%), red (>6%).' },
                          { icon: '📊', label: 'Avg Withdrawal Rate', desc: 'The average rate across all retirement years. A healthy average is 3–4%.' },
                          { icon: '⚠️', label: 'Years Above 4%', desc: 'How many years you exceed the traditional "safe" withdrawal rate. A few years is normal (especially early on), but many consecutive years increases the risk of running out.' },
                          { icon: '🔴', label: 'Years Above 6%', desc: 'Years in the danger zone. At 6%+ withdrawal rates, your portfolio is under severe stress and depletion risk rises sharply.' }
                        ]
                      },
                      {
                        heading: 'RMD Cards (When Applicable)',
                        body: 'Once you reach RMD age (72–75 depending on birth year), the IRS requires minimum withdrawals from pre-tax accounts. These cards appear when RMDs are projected:',
                        items: [
                          { icon: '🏛️', label: 'Peak RMD Rate', desc: 'The highest year\'s RMD as a percentage of your total portfolio.' },
                          { icon: '💸', label: 'Peak Excess RMD Rate', desc: 'When RMDs force you to withdraw MORE than you need for spending. This excess gets reinvested in brokerage (after paying taxes on it).' },
                          { icon: '📉', label: 'Avg Excess RMD Rate', desc: 'Average forced over-withdrawal during RMD years.' }
                        ]
                      },
                      {
                        heading: 'The Chart',
                        items: [
                          { color: '#f59e0b', label: 'Gold Area — Needed for Spending', desc: 'The withdrawal rate driven by your actual spending needs. This is the portion you\'re choosing to take out.' },
                          { color: '#06b6d4', label: 'Cyan Area — Excess from RMD', desc: 'Additional withdrawals forced by RMD rules beyond what you need. You pay tax on these but reinvest the after-tax amount.' },
                          { color: THEME.inkPrimary, label: 'Bright Line — Total Rate', desc: 'Your combined withdrawal rate (needed + excess). This is what matters for portfolio sustainability.' },
                          { color: '#22c55e', label: 'Green Dashed — 4% Safe Line', desc: 'The traditional safe withdrawal rate from the Trinity Study. Staying below this line means historically your portfolio would last 30+ years.' },
                          { color: '#ef4444', label: 'Red Dashed — 6% Risk Line', desc: 'Above this level, portfolio failure risk increases significantly.' }
                        ],
                        tip: 'A rising withdrawal rate over time is a warning sign — it means your portfolio is shrinking faster than your spending is. Ideally, the rate stays flat or decreases. If you see it climbing toward 6%, consider whether reducing spending or delaying retirement would help.'
                      }
                    ]}
                  />
                  {onHide && (
                  <button
                    onClick={() => toggleVisibility('withdrawalRate')}
                    className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded hover:bg-slate-700/50 transition-colors"
                    title="Hide this section"
                  >
                    Hide
                  </button>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-amber-500"></div>
                    <span className="text-slate-400">Needed for Spending</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-cyan-500"></div>
                    <span className="text-slate-400">Excess from RMD</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-8 h-0.5 bg-emerald-500"></div>
                    <span className="text-slate-400">4% Safe</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-8 h-0.5 bg-red-500"></div>
                    <span className="text-slate-400">6% Risk</span>
                  </div>
                </div>
              </div>
              <div style={chartBox(256)}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={withdrawalRateData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={THEME.grid} />
                    <XAxis dataKey="myAge" stroke={THEME.axis} tick={{ fill: THEME.axis }} />
                    <YAxis 
                      stroke={THEME.axis} 
                      tick={{ fill: THEME.axis }} 
                      tickFormatter={v => `${v.toFixed(0)}%`}
                      domain={[0, Math.max(8, Math.ceil((peakData?.withdrawalRate || 4) + 1))]}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: THEME.surfaceRaised, border: `1px solid ${THEME.grid}`, borderRadius: '8px' }} 
                      formatter={(v, name) => {
                        const labels = {
                          neededRate: 'Needed for Spending',
                          excessRate: 'Excess from RMD',
                          withdrawalRate: 'Total Withdrawal Rate',
                          rmdRate: 'RMD Rate'
                        };
                        return [`${v.toFixed(2)}%`, labels[name] || name];
                      }}
                      labelFormatter={l => `Age ${l}`} 
                    />
                    {/* 4% and 6% genuinely ARE a safe/unsafe threshold pair, so these are the one
                        place on this chart where a status colour carries meaning. */}
                    <ReferenceLine y={4} stroke={THEME.status.good} strokeDasharray="5 5" />
                    <ReferenceLine y={6} stroke={THEME.status.critical} strokeDasharray="5 5" />
                    <Area 
                      type="monotone" 
                      dataKey="neededRate" 
                      stackId="1"
                      stroke={SERIES.withdrawalVoluntary} 
                      fill={SERIES.withdrawalVoluntary}
                      fillOpacity={0.6}
                      name="neededRate"
                    />
                    <Area 
                      type="monotone" 
                      dataKey="excessRate" 
                      stackId="1"
                      stroke={SERIES.rmd} 
                      fill={SERIES.rmd}
                      fillOpacity={0.6}
                      name="excessRate"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="withdrawalRate" 
                      stroke={THEME.inkPrimary} 
                      strokeWidth={2}
                      dot={false}
                      name="withdrawalRate"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-slate-500 mt-3">
                <strong className="text-amber-400">Needed for Spending</strong> is what you actually need from your portfolio to meet your desired income. 
                <strong className="text-cyan-400 ml-2">Excess from RMD</strong> is the additional amount RMDs force you to withdraw beyond your spending needs (this gets reinvested in brokerage after taxes).
                The white line shows your total withdrawal rate.
              </p>
            </div>
          </>
        );
      
}

function TaxSummaryPanel({ ctx, badge, onHide }) {
  const { projections, personalInfo, retirementAge, accounts, assets, incomeStreams,
          oneTimeEvents, recurringExpenses, computeProjections, current,
          retirementProjection, isPreRetirement, dashSavingsRate,
          dashAfterTaxSavingsRate, dashMyContributions, dashTotalContributions } = ctx;
  // Each panel owns its own info-card state, so two copies of one panel on two
  // tabs cannot open and close each other's explanations.
  const [openInfoCard, setOpenInfoCard] = useState(null);
  const toggleInfoCard = (id) => setOpenInfoCard(v => (v === id ? null : id));
  // The Dashboard passes one that unticks the panel in its picker, which is
  // also where it comes back from.
  const toggleVisibility = () => { if (onHide) onHide(); };

        const retirementYears = projections.filter(p => p.myAge >= retirementAge);
        const lifetimeFederalTax = retirementYears.reduce((sum, p) => sum + p.federalTax, 0);
        const lifetimeStateTax = retirementYears.reduce((sum, p) => sum + p.stateTax, 0);
        const lifetimeFICA = retirementYears.reduce((sum, p) => sum + (p.ficaTax || 0), 0);
        const lifetimeTotalTax = lifetimeFederalTax + lifetimeStateTax + lifetimeFICA;
        const lifetimeQCD = retirementYears.reduce((sum, p) => sum + (p.qcd || 0), 0);
        const charitablePercent = personalInfo.charitableGivingPercent || 0;
        
        // QCD tax savings: for each year with QCD, estimate the marginal tax rate
        // by looking at the ratio of federal tax to taxable income (effective rate on that income slice).
        // More accurate than a hardcoded 22% — uses actual projected tax brackets.
        let estimatedQCDTaxSavings = 0;
        retirementYears.forEach(p => {
          if ((p.qcd || 0) > 0 && p.taxableIncome > 0) {
            // Marginal rate approximation: federal tax / taxable income gives avg rate,
            // but QCD comes off the top, so use a slightly higher estimate
            const avgFedRate = p.federalTax / Math.max(1, p.taxableIncome);
            const avgStateRate = p.stateTax / Math.max(1, p.taxableIncome);
            const marginalEstimate = Math.min(0.40, (avgFedRate + avgStateRate) * 1.15); // Bump 15% above avg to approximate marginal
            estimatedQCDTaxSavings += p.qcd * marginalEstimate;
          }
        });
        estimatedQCDTaxSavings = Math.round(estimatedQCDTaxSavings);
        
        return (
          <div className={cardStyle}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-slate-100">Lifetime Tax Summary (Retirement Years)</h3>{badge}
                <InfoCard
                  title="Lifetime Tax Summary"
                  isOpen={openInfoCard === 'taxSummary'}
                  onToggle={() => toggleInfoCard('taxSummary')}
                  sections={[
                    {
                      heading: 'What This Shows',
                      body: `This section totals up all the taxes you're projected to pay throughout retirement — from your retirement age through age ${personalInfo.legacyAge || 95}. These are cumulative lifetime totals, not annual amounts.`
                    },
                    {
                      heading: 'The Cards',
                      items: [
                        { icon: '🏛️', label: 'Federal Taxes', desc: 'Total federal income tax paid during retirement. This comes from pre-tax account withdrawals (401k, traditional IRA), taxable Social Security benefits, pension income, and capital gains from brokerage sales.' },
                        { icon: '🏠', label: 'State Taxes', desc: 'Total state income tax based on your selected state. Some states have no income tax (FL, TX, NV, etc.), dramatically reducing this number.' },
                        { icon: '📊', label: 'Total Lifetime Tax', desc: 'Combined federal + state taxes over all retirement years. This number can be surprisingly large — it\'s common to pay $200K–$500K+ in retirement taxes, especially with large pre-tax accounts.' },
                        { icon: '💚', label: 'QCD Tax Savings', desc: 'If you\'ve set a charitable giving percentage, this estimates tax savings from Qualified Charitable Distributions — direct IRA-to-charity transfers that satisfy RMDs without counting as taxable income. Calculated using your projected marginal tax rate for each year (federal + state, approximated from your actual taxable income), so it reflects the brackets you\'ll actually be in rather than a flat estimate.' }
                      ]
                    },
                    {
                      heading: 'Key Concepts',
                      items: [
                        { icon: '📋', label: 'Why Retirement Taxes Matter', desc: 'Many people assume they\'ll pay little tax in retirement. But RMDs from large pre-tax accounts, Social Security taxation, and capital gains can push retirees into higher brackets than expected.' },
                        { icon: '🔄', label: 'QCD Strategy', desc: 'Qualified Charitable Distributions let you donate directly from your IRA to charity (up to $111K/year per person in 2026, indexed for inflation; age 70½+). The donation satisfies your RMD but isn\'t taxable income — a powerful strategy if you\'re already charitably inclined.' },
                        { icon: '💡', label: 'Roth Advantage', desc: 'Roth withdrawals don\'t show up in these tax numbers at all — they\'re completely tax-free. A higher Roth balance relative to pre-tax can significantly reduce lifetime taxes.' }
                      ],
                      tip: 'To reduce lifetime taxes, consider Roth conversions before retirement (paying tax now at potentially lower rates), maximizing QCDs if you give to charity, and choosing a tax-friendly state for retirement.'
                    }
                  ]}
                />
              </div>
              {onHide && (
              <button
                onClick={() => toggleVisibility('taxSummary')}
                className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded hover:bg-slate-700/50 transition-colors"
                title="Hide this section"
              >
                Hide
              </button>
              )}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
              <div className="border rounded-lg px-4 py-3 bg-red-500/10 border-red-500/30">
                <div className="text-slate-400 text-xs mb-0.5">Federal Taxes</div>
                <div className="text-xl font-bold text-red-400">{formatCurrency(lifetimeFederalTax)}</div>
                <div className="text-xs text-slate-500">Ages {retirementAge}-{personalInfo.legacyAge || 95}</div>
              </div>
              <div className="border rounded-lg px-4 py-3 bg-orange-500/10 border-orange-500/30">
                <div className="text-slate-400 text-xs mb-0.5">State Taxes</div>
                <div className="text-xl font-bold text-orange-400">{formatCurrency(lifetimeStateTax)}</div>
                <div className="text-xs text-slate-500">{personalInfo.state}</div>
              </div>
              <div className="border rounded-lg px-4 py-3 bg-slate-500/10 border-slate-500/30">
                <div className="text-slate-400 text-xs mb-0.5">Total Lifetime Tax</div>
                <div className="text-xl font-bold text-slate-300">{formatCurrency(lifetimeTotalTax)}</div>
                <div className="text-xs text-slate-500">Combined fed + state{lifetimeFICA > 0 ? ' + FICA' : ''}</div>
              </div>
              {charitablePercent > 0 ? (
                <div className="border rounded-lg px-4 py-3 bg-emerald-500/10 border-emerald-500/30">
                  <div className="text-slate-400 text-xs mb-0.5">QCD Tax Savings</div>
                  <div className="text-xl font-bold text-emerald-400">~{formatCurrency(estimatedQCDTaxSavings)}</div>
                  <div className="text-xs text-slate-500">{formatCurrency(lifetimeQCD)} in QCDs</div>
                </div>
              ) : (
                <div className="border rounded-lg px-4 py-3 bg-slate-700/30 border-slate-600/30">
                  <div className="text-slate-400 text-xs mb-0.5">QCD Strategy</div>
                  <div className="text-lg font-bold text-slate-500">Not Active</div>
                  <div className="text-xs text-slate-500">Set charitable % in Personal Info</div>
                </div>
              )}
            </div>
            {charitablePercent > 0 && lifetimeQCD > 0 && (
              <p className="text-xs text-emerald-400/80">
                💡 Your {charitablePercent}% charitable giving generates {formatCurrency(lifetimeQCD)} in QCDs, 
                saving approximately {formatCurrency(estimatedQCDTaxSavings)} in taxes while still taking the standard deduction.
              </p>
            )}
          </div>
        );
      
}

function SafeSpendingPanel({ ctx, badge, onHide }) {
  const { projections, personalInfo, retirementAge, accounts, assets, incomeStreams,
          oneTimeEvents, recurringExpenses, computeProjections, current,
          retirementProjection, isPreRetirement, dashSavingsRate,
          dashAfterTaxSavingsRate, dashMyContributions, dashTotalContributions } = ctx;
  // Each panel owns its own info-card state, so two copies of one panel on two
  // tabs cannot open and close each other's explanations.
  const [openInfoCard, setOpenInfoCard] = useState(null);
  const toggleInfoCard = (id) => setOpenInfoCard(v => (v === id ? null : id));
  // The Dashboard passes one that unticks the panel in its picker, which is
  // also where it comes back from.
  const toggleVisibility = () => { if (onHide) onHide(); };

        const retirementPortfolio = retirementProjection?.totalPortfolio || 0;
        
        // Inflate desired income to retirement-year dollars to match the nominal portfolio value
        const yearsToRetirement = Math.max(0, retirementAge - personalInfo.myAge);
        // Under a withdrawal-led strategy the target is unused; the plan's own
        // first-year spending (already in retirement-year dollars) stands in.
        const currentDesired = strategyLeadsSpending(personalInfo)
          ? (retirementProjection?.desiredIncome || 0)
          : personalInfo.desiredRetirementIncome * Math.pow(1 + personalInfo.inflationRate, yearsToRetirement);
        
        // Calculate sustainable income at different withdrawal rates
        const safeIncome3 = Math.round(retirementPortfolio * 0.03);
        const safeIncome4 = Math.round(retirementPortfolio * 0.04);
        const safeIncome5 = Math.round(retirementPortfolio * 0.05);
        
        // Add guaranteed income to get total sustainable lifestyle
        const guaranteedAtRetirement = retirementProjection?.totalGuaranteedIncome || 0;
        const totalLifestyle3 = safeIncome3 + guaranteedAtRetirement;
        const totalLifestyle4 = safeIncome4 + guaranteedAtRetirement;
        const totalLifestyle5 = safeIncome5 + guaranteedAtRetirement;
        
        // Calculate implied withdrawal rate of current plan
        const impliedRate = retirementPortfolio > 0 
          ? ((currentDesired - guaranteedAtRetirement) / retirementPortfolio) * 100 
          : 0;
        
        // Spending cushion
        const spendingCushion = totalLifestyle4 - currentDesired;
        
        return (
          <div className={cardStyle}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-slate-100">Safe Spending Capacity</h3>{badge}
                <InfoCard
                  title="Safe Spending Capacity"
                  isOpen={openInfoCard === 'safeSpending'}
                  onToggle={() => toggleInfoCard('safeSpending')}
                  sections={[
                    {
                      heading: 'What This Shows',
                      body: 'This section answers: "How much can I safely spend each year in retirement?" It applies different withdrawal rate rules to your projected retirement portfolio and adds your guaranteed income to show total sustainable spending at each risk level.'
                    },
                    {
                      heading: 'The Withdrawal Rate Scenarios',
                      items: [
                        { icon: '🟢', label: 'Conservative (3%)', desc: 'Withdraw 3% of your portfolio annually. Very high probability of lasting 30+ years, even in poor markets. Best for early retirees or those wanting maximum safety margin.' },
                        { icon: '🟡', label: 'Traditional (4%)', desc: 'The classic "4% Rule" from the Trinity Study. Historically, a 4% initial withdrawal rate (adjusted for inflation) sustained a portfolio for 30 years in ~95% of scenarios.' },
                        { icon: '🟠', label: 'Aggressive (5%)', desc: 'Higher spending but greater risk of depletion. May work for shorter retirements (under 25 years) or if you have backup income sources.' },
                        { icon: '🟣', label: 'Your Plan', desc: 'Your actual implied withdrawal rate based on your desired spending minus guaranteed income, divided by your projected portfolio. Shows how your plan compares to the standard rules.' }
                      ]
                    },
                    {
                      heading: 'Key Concepts',
                      items: [
                        { icon: '📐', label: 'How It\'s Calculated', desc: 'Each scenario takes your projected retirement portfolio × the withdrawal rate to get annual portfolio income, then adds your guaranteed income (Social Security, pension, etc.) for total sustainable spending.' },
                        { icon: '📊', label: 'The Spending Cushion', desc: 'The difference between the 4% rule sustainable income and your desired spending. Positive (green) means you have room to spare. Negative (red) means your plan exceeds the traditional safe rate.' },
                        { icon: '💵', label: 'Nominal Dollars', desc: 'All amounts shown are in future dollars at your retirement age — they\'ve been adjusted for inflation so they\'re directly comparable to your projected portfolio value.' }
                      ],
                      tip: 'If your implied rate is above 4%, consider: increasing savings, delaying retirement by even 1–2 years (which both grows the portfolio and shortens the drawdown period), or adjusting spending expectations. Each year of delay has an outsized positive impact.'
                    }
                  ]}
                />
              </div>
              {onHide && (
              <button
                onClick={() => toggleVisibility('safeSpending')}
                className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded hover:bg-slate-700/50 transition-colors"
                title="Hide this section"
              >
                Hide
              </button>
              )}
            </div>
            <p className="text-sm text-slate-400 mb-4">
              Based on your projected portfolio of {formatCurrency(retirementPortfolio)} at retirement (age {retirementAge}) 
              plus {formatCurrency(guaranteedAtRetirement)}/year in guaranteed income.
            </p>
            
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <div className="border rounded-lg px-4 py-3 bg-emerald-500/10 border-emerald-500/30">
                <div className="text-slate-400 text-xs mb-0.5">Conservative (3%)</div>
                <div className="text-xl font-bold text-emerald-400">{formatCurrency(totalLifestyle3)}</div>
                <div className="text-xs text-slate-500">{formatCurrency(safeIncome3)} from portfolio</div>
              </div>
              <div className="border rounded-lg px-4 py-3 bg-amber-500/10 border-amber-500/30">
                <div className="text-slate-400 text-xs mb-0.5">Traditional (4%)</div>
                <div className="text-xl font-bold text-amber-400">{formatCurrency(totalLifestyle4)}</div>
                <div className="text-xs text-slate-500">{formatCurrency(safeIncome4)} from portfolio</div>
              </div>
              <div className="border rounded-lg px-4 py-3 bg-orange-500/10 border-orange-500/30">
                <div className="text-slate-400 text-xs mb-0.5">Aggressive (5%)</div>
                <div className="text-xl font-bold text-orange-400">{formatCurrency(totalLifestyle5)}</div>
                <div className="text-xs text-slate-500">{formatCurrency(safeIncome5)} from portfolio</div>
              </div>
              <div className="border rounded-lg px-4 py-3 bg-purple-500/10 border-purple-500/30">
                <div className="text-slate-400 text-xs mb-0.5">Your Plan ({impliedRate.toFixed(1)}%)</div>
                <div className="text-xl font-bold text-purple-400">{formatCurrency(currentDesired)}</div>
                <div className="text-xs text-slate-500">
                  {spendingCushion >= 0 
                    ? <span className="text-emerald-400">+{formatCurrency(spendingCushion)} cushion vs 4%</span>
                    : <span className="text-red-400">{formatCurrency(spendingCushion)} above 4%</span>
                  }
                </div>
              </div>
            </div>
            
            <p className="text-xs text-slate-500">
              The 4% rule suggests you can withdraw 4% of your portfolio annually with low risk of running out over 30 years.
              {spendingCushion > 0 && ` You have room to increase spending by ${formatCurrency(spendingCushion)}/year or gift to heirs.`}
            </p>
          </div>
        );
      
}

function CashFlowPanel({ ctx, badge, onHide }) {
  const { projections, personalInfo, retirementAge, accounts, assets, incomeStreams,
          oneTimeEvents, recurringExpenses, computeProjections, current,
          retirementProjection, isPreRetirement, dashSavingsRate,
          dashAfterTaxSavingsRate, dashMyContributions, dashTotalContributions } = ctx;
  // Each panel owns its own info-card state, so two copies of one panel on two
  // tabs cannot open and close each other's explanations.
  const [openInfoCard, setOpenInfoCard] = useState(null);
  const toggleInfoCard = (id) => setOpenInfoCard(v => (v === id ? null : id));
  // The Dashboard passes one that unticks the panel in its picker, which is
  // also where it comes back from.
  const toggleVisibility = () => { if (onHide) onHide(); };
  const [sankeyAge, setSankeyAge] = useState(personalInfo.myRetirementAge || 65);

        const sankeyData = projections.find(p => p.myAge === sankeyAge) || current;
        
        // Prepare Sankey data
        const income = [
          { label: 'Earned Income', value: sankeyData.earnedIncome || 0, color: '#22c55e' },
          { label: 'Social Security', value: sankeyData.socialSecurity || 0, color: '#3b82f6' },
          { label: 'Pension', value: sankeyData.pension || 0, color: '#8b5cf6' },
          { label: 'Other Income', value: sankeyData.otherIncome || 0, color: '#06b6d4' },
          { label: 'Portfolio Withdrawal', value: sankeyData.portfolioWithdrawal || 0, color: '#f59e0b' },
          { label: 'Conversion Tax Draw', value: sankeyData.conversionTaxWithdrawal || 0, color: '#d97706' }
        ].filter(item => item.value > 0);
        
        const totalIncome = income.reduce((sum, item) => sum + item.value, 0);
        const totalTaxes = sankeyData.totalTax || 0;
        const netIncome = sankeyData.netIncome || 0;
        const baseSpending = sankeyData.desiredIncome || 0;
        const healthcareSpending = sankeyData.healthcareExpense || 0;
        const recurringSpending = sankeyData.recurringExpenses || 0;
        const coreSpending = baseSpending; // Base desired retirement income
        const savings = Math.max(0, netIncome - baseSpending - healthcareSpending - recurringSpending);
        
        const expenses = [
          { label: 'Federal Tax', value: sankeyData.federalTax || 0, color: '#ef4444' },
          { label: 'State Tax', value: sankeyData.stateTax || 0, color: '#dc2626' },
          { label: 'FICA', value: sankeyData.ficaTax || 0, color: '#b91c1c' },
          { label: 'IRMAA', value: sankeyData.irmaaSurcharge || 0, color: '#be185d' },
          { label: 'Spending', value: coreSpending, color: '#10b981' },
          { label: 'Healthcare', value: healthcareSpending, color: '#ec4899' },
          { label: 'Recurring Exp.', value: recurringSpending, color: '#06b6d4' },
          { label: 'Savings', value: savings, color: '#6366f1' }
        ].filter(item => item.value > 0);
        
        const sankeyChartData = {
          income,
          expenses,
          title: `Cash Flow Analysis - Age ${sankeyAge}`
        };
        
        return (
          <div className={cardStyle}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-slate-100">Annual Cash Flow</h3>{badge}
                <InfoCard
                  title="Annual Cash Flow"
                  isOpen={openInfoCard === 'cashFlow'}
                  onToggle={() => toggleInfoCard('cashFlow')}
                  sections={[
                    {
                      heading: 'What This Shows',
                      body: 'This Sankey (flow) diagram shows where your money comes from and where it goes in a single year. The colored streams on the left are income sources flowing into your total, and the streams on the right show how that money gets divided between taxes, spending, and savings.'
                    },
                    {
                      heading: 'Left Side — Income Sources',
                      items: [
                        { color: '#22c55e', label: 'Earned Income', desc: 'Salary and wages from employment.' },
                        { color: '#3b82f6', label: 'Social Security', desc: 'Your Social Security benefits for this year.' },
                        { color: '#8b5cf6', label: 'Pension', desc: 'Defined-benefit pension payments.' },
                        { color: '#06b6d4', label: 'Other Income', desc: 'Rental income, annuities, side income.' },
                        { color: '#f59e0b', label: 'Portfolio Withdrawal', desc: 'Money drawn from retirement accounts to cover spending gaps.' }
                      ]
                    },
                    {
                      heading: 'Right Side — Where It Goes',
                      items: [
                        { color: '#ef4444', label: 'Federal Tax', desc: 'Federal income tax on your combined income.' },
                        { color: '#dc2626', label: 'State Tax', desc: 'State income tax based on your selected state.' },
                        { color: '#b91c1c', label: 'FICA', desc: 'Social Security + Medicare payroll taxes on earned income (working years).' },
                        { color: '#be185d', label: 'IRMAA', desc: 'Medicare Part B & D surcharge if your MAGI exceeds the thresholds (age 65+).' },
                        { color: '#10b981', label: 'Spending', desc: 'Your desired retirement spending (the money you actually live on).' },
                        { color: '#ec4899', label: 'Healthcare', desc: 'Modeled healthcare costs separate from base spending (if healthcare modeling is enabled).' },
                        { color: '#06b6d4', label: 'Recurring Exp.', desc: 'Active recurring expenses like a mortgage, car payment, or long-term care premium.' },
                        { color: '#6366f1', label: 'Savings', desc: 'Any excess income beyond taxes and spending — this gets reinvested.' }
                      ]
                    },
                    {
                      heading: 'The Summary Cards Below',
                      items: [
                        { icon: '💰', label: 'Total Income', desc: 'Sum of all income sources (gross, before tax).' },
                        { icon: '🏛️', label: 'Total Taxes', desc: 'Combined federal and state taxes, shown as a percentage of gross income.' },
                        { icon: '📥', label: 'Net Income', desc: 'What\'s left after taxes — the actual money available to you.' },
                        { icon: '📊', label: 'Savings Rate', desc: 'Percentage of net income that exceeds your spending needs. During retirement this may be zero or come from excess RMDs.' }
                      ],
                      tip: 'Change the age to see how your cash flow evolves over time. Try comparing "Now" (working years) vs "Retirement" vs "Age 75" (when RMDs start) to see how the income mix shifts dramatically.'
                    }
                  ]}
                />
                {onHide && (
                <button
                  onClick={() => toggleVisibility('cashFlow')}
                  className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded hover:bg-slate-700/50 transition-colors"
                  title="Hide this section"
                >
                  Hide
                </button>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-400">View Age:</span>
                <input
                  type="number"
                  value={sankeyAge}
                  onChange={e => setSankeyAge(Math.max(personalInfo.myAge, Math.min(personalInfo.legacyAge || 95, Number(e.target.value))))}
                  className="w-16 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-100 text-center"
                  min={personalInfo.myAge}
                  max={personalInfo.legacyAge || 95}
                />
                <div className="flex gap-1 ml-2">
                  <button 
                    onClick={() => setSankeyAge(personalInfo.myAge)}
                    className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-300"
                  >
                    Now
                  </button>
                  <button 
                    onClick={() => setSankeyAge(retirementAge)}
                    className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-300"
                  >
                    Retirement
                  </button>
                  <button 
                    onClick={() => setSankeyAge(75)}
                    className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-300"
                  >
                    Age 75
                  </button>
                </div>
              </div>
            </div>
            
            <div className="flex justify-center bg-slate-900/30 rounded-lg p-4">
              <SankeyDiagram data={sankeyChartData} width={900} height={400} />
            </div>
            
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-700/30">
                <div className="text-slate-500 text-xs mb-1">Total Income</div>
                <div className="text-lg font-semibold text-emerald-400">{formatCurrency(totalIncome)}</div>
              </div>
              <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-700/30">
                <div className="text-slate-500 text-xs mb-1">Total Taxes</div>
                <div className="text-lg font-semibold text-red-400">{formatCurrency(totalTaxes)}</div>
                <div className="text-xs text-slate-500">{totalIncome > 0 ? ((totalTaxes/totalIncome)*100).toFixed(1) : 0}% of income</div>
              </div>
              <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-700/30">
                <div className="text-slate-500 text-xs mb-1">Net Income</div>
                <div className="text-lg font-semibold text-sky-400">{formatCurrency(netIncome)}</div>
              </div>
              <div className="bg-slate-900/40 rounded-lg p-3 border border-slate-700/30">
                <div className="text-slate-500 text-xs mb-1">Savings Rate</div>
                <div className="text-lg font-semibold text-purple-400">
                  {netIncome > 0 ? ((savings/netIncome)*100).toFixed(1) : 0}%
                </div>
                <div className="text-xs text-slate-500">{formatCurrency(savings)}</div>
              </div>
            </div>
          </div>
        );
      
}

// The ctx every panel reads, derived once, from whatever the Dashboard's levers
// compose (the plan itself while none is moved) — so no panel works out a
// savings rate or a retirement-year row its own way.
const buildPanelCtx = ({ projections, personalInfo, accounts, assets, incomeStreams,
                         oneTimeEvents, recurringExpenses, computeProjections,
                         retirementAge }) => {
  const current = projections[0];
  const retAge = Number.isFinite(retirementAge) ? retirementAge : personalInfo.myRetirementAge;
  const earned = current?.earnedIncome || 0;
  const contribs = current?.perAccountContributions || {};
  let mine = 0, total = 0;
  (accounts || []).forEach(a => {
    const c = contribs[a.id] || 0;
    mine += myContribShare(a, c);
    total += c;
  });
  const tax = current ? (current.federalTax + current.stateTax + current.ficaTax) : 0;
  const afterTax = earned - tax;
  return {
    projections, personalInfo, accounts, assets, incomeStreams, oneTimeEvents,
    recurringExpenses, computeProjections,
    retirementAge: retAge,
    current,
    retirementProjection: projections.find(p => p.myAge === retAge),
    dashMyContributions: mine,
    dashTotalContributions: total,
    dashSavingsRate: earned > 0 ? (mine / earned) * 100 : null,
    dashAfterTaxSavingsRate: afterTax > 0 ? (mine / afterTax) * 100 : null,
    isPreRetirement: earned > 0,
  };
};

// ── YEAR BY YEAR ─────────────────────────────────────────────────────────────
// The plan as a timeline. One year is "selected": the reader drags along the
// ruler, clicks a year on it, on the net-worth or income chart, or in the table,
// steps with the arrow keys, or presses play and watches the plan run. The
// figures, the year card, the table window and a cursor through both charts all
// follow that one year. Nothing here computes anything: every number is a field
// of the projection row the rest of the page already draws.
//
// Milestones are READ OFF the rows rather than restated from the inputs, so a
// flag lands where the engine actually did the thing — Social Security where
// the first benefit is paid, not where a claiming age was typed.
const timelineMilestones = (rows, retirementAge) => {
  const out = [];
  const add = (i, label) => { if (i >= 0 && rows[i]) out.push({ i, age: rows[i].myAge, label }); };
  const find = (pred) => rows.findIndex(pred);
  add(find(r => r.myAge === retirementAge), 'Retire');
  add(find(r => (r.socialSecurity || 0) > 0), 'Social Security');
  const conv = rows.map((r, k) => ((r.rothConversion || 0) > 0 ? k : -1)).filter(k => k >= 0);
  if (conv.length) {
    add(conv[0], 'Conversions begin');
    if (conv[conv.length - 1] + 1 < rows.length) add(conv[conv.length - 1] + 1, 'Conversions end');
  }
  add(find(r => (r.rmd || 0) > 0), 'RMDs begin');
  add(find((r, k) => k > 0 && r.myAge >= retirementAge
    && (rows[k - 1].brokerageBalance || 0) > 1 && (r.brokerageBalance || 0) <= 1), 'Brokerage spent');
  add(find(r => r.survivorEvent === 'primary_died' || r.survivorEvent === 'spouse_died'), 'Survivor years');
  add(find(r => r.myAge >= retirementAge && (r.totalPortfolio || 0) <= 0), 'Money runs out');
  return out.sort((a, b) => a.i - b.i);
};

// What is happening in one year, as short chips beside the readout.
const timelineEvents = (rows, i, milestones) => {
  const r = rows[i];
  if (!r) return [];
  const out = milestones.filter(m => m.i === i).map(m => (m.label === 'Retire' ? 'Retirement year' : m.label));
  if ((r.rothConversion || 0) > 0) out.push(`Converting ${formatCurrency(r.rothConversion)} to Roth`);
  if ((r.rmd || 0) > 0) out.push(`RMD ${formatCurrency(r.rmd)}`);
  if ((r.unfundedShortfall || 0) > 0) out.push(`Short ${formatCurrency(r.unfundedShortfall)}`);
  // Guyton-Klinger decisions, when the plan runs guardrails.
  if (r.guardrailEvent === 'cut') out.push('Guardrail: withdrawal cut');
  if (r.guardrailEvent === 'raise') out.push('Guardrail: withdrawal raised');
  if (r.guardrailInflation === 'skipped') out.push('Inflation raise skipped');
  if (r.guardrailInflation === 'capped') out.push('Inflation raise capped');
  if (Math.abs(r.guardrailAdjustment || 0) >= 1) {
    out.push(`Spending ${r.guardrailAdjustment > 0 ? '+' : '−'}${formatCurrency(Math.abs(r.guardrailAdjustment))} vs plan`);
  }
  return out;
};

// Flags whose labels would collide take turns: right of the flag, left of it,
// then a second row; with no room at all the flag keeps its dot and loses its
// label (the chip beside the readout still names it when that year is picked).
const placeTimelineLabels = (xs, labels, width, tape) => {
  const taken = [0, 1].map(() => xs.map((x, k) => [x - 3, x + 3, k]));
  const free = (row, a, b, own) => taken[row].every(([p, q, k]) => k === own || b < p - 4 || a > q + 4);
  return xs.map((x, k) => {
    const w = labels[k].length * 6.1;
    const spot = [[0, false], [0, true], [1, false], [1, true]].find(([row, left]) => {
      const a = left ? x - 6 - w : x, b = left ? x : x + 6 + w;
      return (tape || (a >= 0 && b <= width)) && free(row, a, b, k);
    });
    if (!spot) return null;
    const [row, left] = spot;
    taken[row].push(left ? [x - 6 - w, x, k] : [x, x + 6 + w, k]);
    return { row, left };
  });
};

const prefersReducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
};

// A number that rolls to its new value rather than jumping, so scrubbing reads
// as movement. Instant under reduced motion.
const useTweened = (target, ms = 320) => {
  const [shown, setShown] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    if (prefersReducedMotion() || !Number.isFinite(target)) { fromRef.current = target; setShown(target); return; }
    const from = fromRef.current, t0 = performance.now();
    let raf = 0;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - t, 3);
      const v = from + (target - from) * e;
      fromRef.current = v; setShown(v);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return shown;
};

function YearTimelinePanel({ ctx, badge, onHide }) {
  const rows = ctx.projections || [];
  const n = rows.length;
  const retirementAge = ctx.retirementAge;
  const milestones = useMemo(() => timelineMilestones(rows, retirementAge), [rows, retirementAge]);
  // The selected year lives in the page's focus store, not here, because the
  // charts draw it too. Until the reader picks one it is the retirement year.
  const picked = useFocusAge(ctx.focus);
  const wanted = picked != null ? picked : retirementAge;
  let sel = rows.findIndex(r => r.myAge === wanted);
  if (sel < 0) sel = n ? (wanted < rows[0].myAge ? 0 : n - 1) : 0;
  const selRef = useRef(sel);
  selRef.current = sel;
  const pick = (k) => {
    if (!n || !ctx.focus) return;
    ctx.focus.set(rows[Math.max(0, Math.min(n - 1, k))].myAge);
  };
  // The play timer reads the latest pick, so a plan edited mid-play steps
  // through the new years rather than the ones it started with.
  const pickRef = useRef(pick);
  pickRef.current = pick;

  // Play: one year every 190 ms, stopping at the end. Pressing play at the end
  // starts again from the first year; any other interaction stops it.
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return undefined;
    const t = setInterval(() => {
      if (selRef.current >= n - 1) { setPlaying(false); return; }
      pickRef.current(selRef.current + 1);
    }, 190);
    return () => clearInterval(t);
  }, [playing, n]);
  const togglePlay = () => {
    if (playing) { setPlaying(false); return; }
    if (sel >= n - 1) pick(0);
    setPlaying(true);
  };

  const wrapRef = useRef(null);
  const drag = useRef(null);
  const [W, setW] = useState(800);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const measure = () => setW(Math.max(280, Math.round(el.getBoundingClientRect().width)));
    measure();
    if (!window.ResizeObserver) return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!n) return null;
  const r = rows[sel];

  // The ruler. Flight Deck draws it as a tape that scrolls under a fixed caret,
  // like an altimeter; every other theme as a fixed ruler with a moving handle.
  const tape = THEME.look === 'flight';
  const H = 74, pad = 14;
  const step = tape ? Math.max(28, W / 16) : (W - pad * 2) / Math.max(1, n - 1);
  const xAt = (k) => (tape ? k * step : pad + k * step);        // within the ruler group
  const shift = tape ? W / 2 - sel * step : 0;                  // the tape's offset
  const flagXs = milestones.map(m => xAt(m.i) + shift);
  const spots = placeTimelineLabels(flagXs, milestones.map(m => m.label), W, tape);
  const indexAt = (clientX) => {
    const rect = wrapRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    return Math.round(tape ? sel + (x - W / 2) / step : (x - pad) / step);
  };
  const onPointerDown = (e) => {
    setPlaying(false);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
    drag.current = { x: e.clientX, sel, moved: false };
    if (!tape) pick(indexAt(e.clientX));
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 3) d.moved = true;
    if (!d.moved) return;
    pick(tape ? d.sel - Math.round(dx / step) : indexAt(e.clientX));
  };
  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (d && tape && !d.moved) pick(indexAt(e.clientX));
  };
  const onKeyDown = (e) => {
    const k = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 5, PageDown: -5 }[e.key];
    if (k) { e.preventDefault(); setPlaying(false); pick(sel + k); return; }
    if (e.key === 'Home') { e.preventDefault(); setPlaying(false); pick(0); }
    if (e.key === 'End') { e.preventDefault(); setPlaying(false); pick(n - 1); }
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); togglePlay(); }
  };
  const move = prefersReducedMotion() ? 'none' : `transform ${playing ? 0.16 : 0.22}s ease`;

  const events = timelineEvents(rows, sel, milestones);
  const guaranteed = r.totalGuaranteedIncome || 0;
  const fromSavings = (r.portfolioWithdrawal || 0) + (r.conversionTaxWithdrawal || 0);
  const hasHsa = rows.some(x => (x.hsaBalance || 0) > 0);
  const balMax = Math.max(1, ...rows.map(x => Math.max(x.preTaxBalance || 0, x.rothBalance || 0,
    x.brokerageBalance || 0, x.hsaBalance || 0)));
  const balances = [['Pre-tax', r.preTaxBalance, SERIES.preTax], ['Roth', r.rothBalance, SERIES.roth],
    ['Brokerage', r.brokerageBalance, SERIES.brokerage], ...(hasHsa ? [['HSA', r.hsaBalance, SERIES.hsa]] : [])];
  const win0 = Math.max(0, Math.min(n - 11, sel - 5));
  const windowRows = rows.slice(win0, win0 + 11);

  return (
    <div className={cardStyle} data-tour="year-timeline">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold text-slate-100">Year by year</h3>{badge}
          <span className="text-xs text-slate-500">Drag, click a year here or on a chart, use ← →, or press play</span>
        </div>
        {onHide && (
          <button onClick={onHide}
            className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded hover:bg-slate-700/50 transition-colors shrink-0"
            title="Hide this panel — turn it back on from the picker at the top">
            Hide
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-1">
        <button onClick={togglePlay}
          className="w-9 h-9 rounded-full border border-slate-500 text-slate-100 hover:bg-slate-700/60 flex items-center justify-center shrink-0"
          aria-label={playing ? 'Pause' : 'Play the plan year by year'} title={playing ? 'Pause' : 'Play the plan year by year'}>
          <span aria-hidden="true">{playing ? '❚❚' : '▶'}</span>
        </button>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold text-slate-100 tabular-nums">Age {r.myAge}</span>
          <span className="text-sm text-slate-500 tabular-nums">{r.year}</span>
        </div>
        <div className="flex flex-wrap gap-1.5" aria-live="polite">
          {events.map(ev => (
            <span key={ev} className="text-xs px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-200">{ev}</span>
          ))}
        </div>
      </div>

      <div ref={wrapRef}
        role="slider" tabIndex={0} aria-label="Year of the plan"
        aria-valuemin={rows[0].myAge} aria-valuemax={rows[n - 1].myAge} aria-valuenow={r.myAge}
        aria-valuetext={`Age ${r.myAge}, ${r.year}${events.length ? ' — ' + events.join(', ') : ''}`}
        onKeyDown={onKeyDown} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        onPointerCancel={() => { drag.current = null; }}
        className="year-timeline select-none cursor-pointer rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        style={{ touchAction: 'none' }}>
        <svg width={W} height={H} style={{ display: 'block', overflow: 'hidden' }}>
          <g style={{ transform: `translateX(${shift}px)`, transition: tape ? move : 'none' }}>
            {rows.map((row, k) => {
              const major = row.myAge % 5 === 0;
              const x = xAt(k);
              return (
                <g key={row.myAge}>
                  <line x1={x} x2={x} y1={major ? 40 : 46} y2={56} stroke={THEME.axis} strokeOpacity={major ? 0.9 : 0.45} strokeWidth={major ? 1.3 : 1} />
                  {(major || (tape && step > 34)) && (
                    <text x={x} y={70} fontSize="11" textAnchor="middle" fill={THEME.inkMuted}>{row.myAge}</text>
                  )}
                </g>
              );
            })}
          </g>
          <g style={{ transform: `translateX(${shift}px)`, transition: tape ? move : 'none' }}>
          {milestones.map((m, k) => {
            // Placed on screen coordinates, drawn inside the group, so on the
            // tape the flags travel with the ticks rather than jumping ahead.
            const x = xAt(m.i), spot = spots[k], cy = spot && spot.row ? 28 : 16;
            return (
              <g key={m.label + m.i}>
                <line x1={x} x2={x} y1={cy} y2={56} stroke={THEME.reference} strokeOpacity={0.55} strokeDasharray="2 3" />
                <circle cx={x} cy={cy} r={3} fill={THEME.reference} />
                {spot && (
                  <text x={spot.left ? x - 6 : x + 6} y={cy + 3.5} fontSize="10.5" textAnchor={spot.left ? 'end' : 'start'} fill={THEME.inkSecondary}>{m.label}</text>
                )}
              </g>
            );
          })}
          </g>
          <g className="tl-handle" style={{ transform: `translateX(${tape ? W / 2 : xAt(sel)}px)`, transition: tape ? 'none' : move }}>
            {tape ? (
              <path d="M-6 30 L6 30 L0 38 Z" fill={THEME.focus} />
            ) : (
              <>
                <circle cx={0} cy={48} r={11} fill={THEME.focus} fillOpacity={0.16} />
                <circle cx={0} cy={48} r={6} fill={THEME.focus} />
              </>
            )}
            <line x1={0} x2={0} y1={tape ? 36 : 30} y2={58} stroke={THEME.focus} strokeWidth={2} />
          </g>
        </svg>
      </div>

      {/* The year's headline figures are not repeated here: the At age and
          Income at age cards in the summary row above follow this timeline.
          This panel carries the breakdown — balances by account, money in by
          source and out by use — and the years around it. */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 mt-3">
        <div className="xl:col-span-2 xl:self-start bg-slate-800/40 border border-slate-700/50 rounded-lg p-4">
          <div className="text-sm font-semibold text-slate-200 mb-3">Age {r.myAge} · {r.year}</div>
          <div className="space-y-2">
            {balances.map(([label, v, color]) => (
              <div key={label} className="grid grid-cols-[5.5rem_1fr_7.5rem] items-center gap-3 text-sm">
                <span className="text-slate-400">{label}</span>
                <span className="h-1.5 rounded-full bg-slate-700/60 overflow-hidden">
                  <span className="block h-full rounded-full" style={{ width: `${Math.max(0, (v || 0) / balMax * 100)}%`, background: color,
                    transition: prefersReducedMotion() ? 'none' : 'width .25s ease' }} />
                </span>
                <span className="text-slate-200 tabular-nums text-right">{formatCurrency(v || 0)}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4 pt-3 border-t border-slate-700/50 text-sm">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Money in</div>
              {[['Work', r.earnedIncome], ['Social Security', r.socialSecurity],
                ['Pensions & other', guaranteed - (r.socialSecurity || 0)], ['From savings', fromSavings]]
                .filter(([, v]) => (v || 0) > 0).map(([label, v]) => (
                  <div key={label} className="flex justify-between gap-2"><span className="text-slate-400">{label}</span><span className="text-slate-200 tabular-nums">{formatCurrency(v)}</span></div>
                ))}
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Money out</div>
              {[['Spending', r.desiredIncome], ['Taxes', r.totalTax], ['To Roth (a transfer)', r.rothConversion]]
                .filter(([, v]) => (v || 0) > 0).map(([label, v]) => (
                  <div key={label} className="flex justify-between gap-2"><span className="text-slate-400">{label}</span><span className="text-slate-200 tabular-nums">{formatCurrency(v)}</span></div>
                ))}
            </div>
          </div>
        </div>

        <div className="xl:col-span-3 overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-700/60">
                {['Age', 'Year', 'Income', 'From savings', 'Converted', 'Taxes', 'Spending', 'Portfolio'].map((h, k) => (
                  <th key={h} className={`py-1.5 px-2 font-medium ${k < 2 ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {windowRows.map((row, j) => {
                const k = win0 + j, on = k === sel;
                return (
                  <tr key={row.myAge} onClick={() => { setPlaying(false); pick(k); }}
                    aria-selected={on}
                    className={`cursor-pointer border-b border-slate-700/40 ${on ? 'bg-slate-700/60 text-slate-100' : 'text-slate-300 hover:bg-slate-700/30'}`}
                    style={on ? { boxShadow: `inset 3px 0 0 ${THEME.focus}` } : undefined}>
                    <td className="py-1.5 px-2">{row.myAge}</td>
                    <td className="py-1.5 px-2">{row.year}</td>
                    <td className="py-1.5 px-2 text-right">{formatCurrency((row.earnedIncome || 0) + (row.totalGuaranteedIncome || 0))}</td>
                    <td className="py-1.5 px-2 text-right">{formatCurrency((row.portfolioWithdrawal || 0) + (row.conversionTaxWithdrawal || 0))}</td>
                    <td className="py-1.5 px-2 text-right">{(row.rothConversion || 0) > 0 ? formatCurrency(row.rothConversion) : '—'}</td>
                    <td className="py-1.5 px-2 text-right">{formatCurrency(row.totalTax || 0)}</td>
                    <td className="py-1.5 px-2 text-right">{formatCurrency(row.desiredIncome || 0)}</td>
                    <td className="py-1.5 px-2 text-right">{formatCurrency(row.totalPortfolio || 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

