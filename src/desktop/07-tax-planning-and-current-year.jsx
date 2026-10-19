// ============================================
// TaxPlanningTab — Lifted to module scope
// ============================================
// ============================================
// ROTH CONVERSION OPTIMIZER
// Goal-based strategy sweep (bracket-fill targets × conversion windows) run in
// the Web Worker; each candidate is a full computeProjections pass scored by
// engine.scoreRothStrategy. Mirrors MonteCarloTab's job-handle pattern.
// ============================================
function RothConversionOptimizer({ personalInfo, accounts, incomeStreams, assets, oneTimeEvents, recurringExpenses, setPersonalInfo }) {
  const [goal, setGoal] = useState('legacy');
  const [optResult, setOptResult] = useState(null);
  const [optError, setOptError] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [appliedLabel, setAppliedLabel] = useState(null);
  const jobRef = useRef(null);

  // Cancel any in-flight job on unmount (same pattern as MonteCarloTab).
  useEffect(() => () => {
    if (jobRef.current && window.PlannerWorker) { window.PlannerWorker.cancel(); jobRef.current = null; }
  }, []);

  const heirTaxRate = personalInfo.heirTaxRate ?? 0.25;

  const GOALS = {
    legacy: { label: 'Maximize after-tax legacy', sort: (a, b) => b.afterTaxLegacy - a.afterTaxLegacy },
    taxes: { label: 'Minimize lifetime taxes', sort: (a, b) => a.lifetimeTax - b.lifetimeTax },
    irmaa: { label: 'Avoid IRMAA surcharges', sort: (a, b) => (a.lifetimeIRMAA - b.lifetimeIRMAA) || (b.afterTaxLegacy - a.afterTaxLegacy) },
    // Legacy first, but only what survives a bad decade. Every candidate is run
    // twice — the plan's own assumptions, and the dot-com opening starting the
    // year of retirement — and scored on a 60/40 blend of the two legacy
    // figures, with any strategy that cannot fund itself under the stress pushed
    // below every one that can.
    balanced: { label: 'Balanced — legacy that survives a bad decade',
      sort: (a, b) => (b.balancedScore ?? -Infinity) - (a.balancedScore ?? -Infinity) },
  };

  const runOptimizer = () => {
    if (!window.PlannerWorker) { setOptError('Worker not available — reload the page.'); return; }
    setIsRunning(true); setProgress(0); setOptResult(null); setOptError(null); setAppliedLabel(null);
    const handle = window.PlannerWorker.run({
      type: 'rothOptimizer',
      payload: { personalInfo, accounts, incomeStreams, assets, oneTimeEvents, recurringExpenses, heirTaxRate },
      onProgress: (pct) => setProgress(pct),
    });
    jobRef.current = handle;
    handle.promise
      .then((data) => { if (jobRef.current !== handle) return; jobRef.current = null; setOptResult(data); setIsRunning(false); })
      .catch((err) => { if (jobRef.current !== handle) return; jobRef.current = null; setIsRunning(false); if (err.message !== 'Cancelled') setOptError(err.message); });
  };

  const applyStrategy = (row) => {
    setPersonalInfo(prev => ({
      ...prev,
      // withRothConversionTarget clears the other modes. Setting the bracket
      // alone left any existing IRMAA tier in place, and the tier wins in the
      // engine — so Apply appeared to do nothing at all.
      // A row can now be a bracket target OR an IRMAA tier. Passing only the
      // bracket would clear the tier and apply an empty bracket — Apply would
      // silently turn the recommended strategy off.
      ...withRothConversionTarget(prev, {
        // A staged row's schedule IS the strategy — no bracket + tier + window
        // can reconstruct "fill to 24% until 62, then hold tier 1". Passing it
        // through is what makes Apply on those rows mean anything.
        stages: Array.isArray(row.stages) && row.stages.length ? row.stages : undefined,
        bracket: row.bracket || '',
        irmaaTier: Number.isInteger(row.irmaaTier) ? row.irmaaTier : undefined,
        // A "convert everything" row is a fixed-amount strategy. Without the
        // amount, Apply on it would clear every mode and switch conversions off
        // — turning the recommended row into no strategy at all.
        amount: row.drainAmount > 0 ? row.drainAmount : undefined,
        startAge: row.startAge || 0,
        endAge: row.endAge || 0,
      }),
      // A guardrailed row is not just a target — the pause rule is half of what
      // makes it win. Applying the target alone would silently drop it.
      ...(row.guardrail
        ? { rothConversionGuardrailEnabled: true, rothConversionGuardrailReturnFloor: 0, rothConversionGuardrailFloor: 0 }
        : { rothConversionGuardrailEnabled: false }),
      // The drain schedule is a nominal dollar figure sized to empty the account,
      // not a today's-dollars target to be indexed each year.
      ...(row.drainAmount > 0 ? { rothConversionInflationAdjust: false } : {}),
    }));
    setAppliedLabel(row.label);
  };

  const ranked = optResult ? [...optResult.results].sort(GOALS[goal].sort) : [];
  const best = ranked[0] || null;
  const baseline = optResult ? optResult.baseline : null;
  const showACA = optResult && optResult.results.some(r => (r.lifetimeACASubsidy || 0) > 0);
  const deltaFmt = (v) => (v >= 0 ? '+' : '−') + formatCurrency(Math.abs(v)).replace('$', '$');

  return (
    <div className={cardStyle}>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <h4 className="text-lg font-semibold text-slate-100 mb-1">Roth Conversion Optimizer</h4>
          <p className="text-xs text-slate-400 max-w-xl">
            Sweeps bracket-fill targets, IRMAA-tier targets and conversion windows (a full projection each —
            taxes, IRMAA, ACA, RMDs all included), then ranks them against your goal. The balanced goal runs
            every candidate a second time through a bad opening decade. Apply the winner to make it your plan.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Goal</label>
            <select value={goal} onChange={e => setGoal(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100">
              {Object.entries(GOALS).map(([k, g]) => <option key={k} value={k}>{g.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1" title="Heirs' assumed ordinary tax rate on inherited pre-tax dollars (SECURE Act 10-year rule)">Heir Tax Rate %</label>
            <input type="number" min="0" max="60" step="1"
              value={Math.round(heirTaxRate * 100)}
              onChange={e => setPersonalInfo(prev => ({ ...prev, heirTaxRate: Math.min(0.6, Math.max(0, (Number(e.target.value) || 0) / 100)) }))}
              className="w-20 bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 text-center" />
          </div>
          <button onClick={isRunning ? undefined : runOptimizer} disabled={isRunning}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium ${isRunning ? 'bg-slate-700 text-slate-300' : 'bg-amber-600/20 text-amber-400 border border-amber-500/30 hover:bg-amber-600/30'}`}>
            {isRunning ? `Optimizing… ${progress}%` : 'Run Optimizer'}
          </button>
        </div>
      </div>

      {optError && <p className="text-sm text-red-400 mb-2">{optError}</p>}
      {appliedLabel && <p className="text-sm text-emerald-400 mb-2">✓ Applied: {appliedLabel} — every tab now reflects this strategy.</p>}

      {goal === 'balanced' && best && (
        <div className="mb-3 p-3 bg-emerald-500/5 border border-emerald-500/30 rounded-lg">
          <p className="text-xs text-slate-300 leading-relaxed">
            <strong className="text-emerald-300">What this goal optimises.</strong> Every strategy is run
            twice — once on your plan's own assumptions, once through a bad opening decade (three
            consecutive down years starting the year you retire, the dot-com path). The score is 60% the
            smooth-path legacy and 40% the bad-path legacy, and any strategy that cannot fund your spending
            under the stress is pushed below every one that can, however good it looks on paper.
          </p>
          <p className="text-xs text-slate-400 leading-relaxed mt-2">
            That is the honest way to price early conversion tax. A big bill in the first years is nearly
            free on a smooth return path and expensive on a falling one, because the withdrawal that funds
            it sells assets cheap and permanently removes the shares that would have carried the recovery.
            {best.stressedFails === false && (
              <> The winner still funds every year of the bad case
              {best.earlyTaxShare !== null && <>, paying {(best.earlyTaxShare * 100).toFixed(0)}% of the
              retirement-date portfolio in tax across the first decade</>}.</>
            )}
          </p>
          <p className="text-xs text-slate-500 leading-relaxed mt-2">
            Expect the <em>&ldquo;−% vs the smooth path&rdquo;</em> column to be large on every row,
            including no-conversions: legacy is what is <em>left over</em> after decades of withdrawals, so
            it magnifies an early loss far more than the portfolio itself does. That figure is for comparing
            rows against each other, not for reading in isolation. The two signals that decide this ranking
            are whether a strategy still funds your spending under the stress — several usually do not — and
            how large its bad-case legacy is next to the others.
          </p>
        </div>
      )}

      {/* Why the IRMAA ranking looks wrong when it is not, and what it costs. */}
      {goal === 'irmaa' && best && best.conversionYears > 0 && (() => {
        const bestLegacy = ranked.reduce((a, b) => (b.afterTaxLegacy > a.afterTaxLegacy ? b : a), ranked[0]);
        const legacyCost = bestLegacy.afterTaxLegacy - best.afterTaxLegacy;
        const irmaaSaved = (bestLegacy.lifetimeIRMAA || 0) - (best.lifetimeIRMAA || 0);
        return (
          <div className="mb-3 p-3 bg-sky-500/5 border border-sky-500/30 rounded-lg">
            <p className="text-xs text-slate-300 leading-relaxed">
              <strong className="text-sky-300">How this ranking works.</strong>{' '}
              IRMAA is set from your MAGI <em>two years earlier</em>, and it only starts at 65 — so anything
              converted by age {best.irmaaFreeThroughAge ?? 62} is invisible to it. That is why a target
              which converts hard and finishes early can post a <em>lower</em> lifetime surcharge than a
              cautious one that converts slowly into the chargeable years: the aggressive plan spends the
              free window, the cautious plan spends the charged years.
              {best.conversionsIrmaaFree > 0 && (
                <> The winning row moves <strong>{formatCurrency(best.conversionsIrmaaFree)}</strong> inside
                that free window and leaves {formatCurrency(best.conversionsIrmaaExposed)} exposed
                {best.lastConversionAge !== null && <>, finishing at age {best.lastConversionAge}</>}.</>
              )}
              {' '}Compare the &ldquo;years charged&rdquo; note under each row&rsquo;s IRMAA figure — that,
              and how much each converts before {best.irmaaFreeThroughAge ?? 62}, is the whole ranking.
            </p>
            {legacyCost > 0 && (
              <p className="text-xs text-amber-400/90 leading-relaxed mt-2">
                <strong>But this goal only ranks IRMAA.</strong> This strategy gives up{' '}
                {formatCurrency(legacyCost)} of after-tax legacy against the best row on that measure, to
                avoid {formatCurrency(irmaaSaved)} of surcharge
                {irmaaSaved > 0 && legacyCost > irmaaSaved * 3 && <> — a poor trade on its face</>}.
                Sort by <em>Maximize after-tax legacy</em> to see the other side before applying anything.
              </p>
            )}
          </div>
        );
      })()}

      {optResult && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-700">
                <th className="py-2 pr-3">Strategy</th>
                <th className="py-2 pr-3">Total Converted</th>
                <th className="py-2 pr-3">After-Tax Legacy — portfolio (vs none)</th>
                <th className="py-2 pr-3">Lifetime Tax (vs none)</th>
                <th className="py-2 pr-3">Lifetime IRMAA</th>
                {goal === 'balanced' && <th className="py-2 pr-3">If the first decade is bad</th>}
                {goal === 'balanced' && <th className="py-2 pr-3">Tax in the fragile years</th>}
                {showACA && <th className="py-2 pr-3">ACA Subsidy Kept</th>}
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {ranked.slice(0, 10).map((r) => (
                <tr key={r.label} className={`border-b border-slate-800 ${best && r.label === best.label ? 'bg-amber-900/20' : ''}`}>
                  <td className="py-2 pr-3 text-slate-200">
                    {best && r.label === best.label ? '★ ' : ''}{r.label}
                    {r.equivalentCount > 1 && (
                      <span className="block text-[10px] text-slate-500">
                        {r.equivalentCount} targets give this same result — the ceiling stopped binding before the
                        higher ones mattered
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-slate-300">{formatCurrency(r.lifetimeConversions)}</td>
                  <td className="py-2 pr-3 text-slate-200">
                    {formatCurrency(r.afterTaxLegacy)}
                    {baseline && <span className={`ml-1 text-xs ${r.afterTaxLegacy >= baseline.afterTaxLegacy ? 'text-emerald-400' : 'text-red-400'}`}>({deltaFmt(r.afterTaxLegacy - baseline.afterTaxLegacy)})</span>}
                  </td>
                  <td className="py-2 pr-3 text-slate-200">
                    {formatCurrency(r.lifetimeTax)}
                    {baseline && <span className={`ml-1 text-xs ${r.lifetimeTax <= baseline.lifetimeTax ? 'text-emerald-400' : 'text-red-400'}`}>({deltaFmt(r.lifetimeTax - baseline.lifetimeTax)})</span>}
                  </td>
                  <td className="py-2 pr-3 text-slate-300">
                    {formatCurrency(r.lifetimeIRMAA)}
                    {/* The two numbers that explain the whole IRMAA ranking. A
                        conversion at age A sets the surcharge at A+2, and IRMAA
                        starts at 65 — so anything converted by 62 is invisible
                        to it. An aggressive target that finishes early can post
                        a LOWER lifetime surcharge than a cautious one that
                        converts slowly into the chargeable years, which reads as
                        a bug until these are on screen. */}
                    {r.conversionYears > 0 && (
                      <span className="block text-[10px] text-slate-500 leading-tight mt-0.5">
                        {r.irmaaYears > 0 ? `${r.irmaaYears} year${r.irmaaYears === 1 ? '' : 's'} charged` : 'never charged'}
                        {r.conversionsIrmaaFree > 0 && (
                          <> · {formatCurrency(r.conversionsIrmaaFree)} converted by {r.irmaaFreeThroughAge}, before IRMAA can see it</>
                        )}
                      </span>
                    )}
                  </td>
                  {goal === 'balanced' && (
                    <td className="py-2 pr-3">
                      {r.stressedFails ? (
                        <span className="text-red-400 font-semibold">
                          Runs short {formatCurrency(r.stressedShortfall)}
                        </span>
                      ) : (
                        <>
                          <span className="text-slate-200">{formatCurrency(r.stressedLegacy)}</span>
                          {r.sequenceDrawdown !== null && r.sequenceDrawdown !== undefined && (
                            <span className={`block text-[10px] ${r.sequenceDrawdown > 0.25 ? 'text-amber-400' : 'text-slate-500'}`}>
                              −{(r.sequenceDrawdown * 100).toFixed(0)}% vs the smooth path
                            </span>
                          )}
                        </>
                      )}
                    </td>
                  )}
                  {goal === 'balanced' && (
                    <td className="py-2 pr-3">
                      <span className="text-slate-300">{formatCurrency(r.earlyTax)}</span>
                      {r.earlyTaxShare !== null && r.earlyTaxShare !== undefined && (
                        <span className={`block text-[10px] ${r.earlyTaxShare > 0.2 ? 'text-amber-400' : 'text-slate-500'}`}>
                          {(r.earlyTaxShare * 100).toFixed(0)}% of the portfolio at retirement
                        </span>
                      )}
                    </td>
                  )}
                  {showACA && <td className="py-2 pr-3 text-slate-300">{formatCurrency(r.lifetimeACASubsidy)}</td>}
                  <td className="py-2 pr-3">
                    <button onClick={() => applyStrategy(r)}
                      className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-200">Apply</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-slate-500 mt-2">
            ★ = best for "{GOALS[goal].label}". After-tax legacy values pre-tax balances at {Math.round(heirTaxRate * 100)}¢ on
            the dollar (your heirs' rate under the SECURE Act 10-year rule); Roth and brokerage pass at face value.
            Change the goal to re-rank without re-running.
            {' '}These figures are <strong className="text-slate-400">portfolio only</strong> — every strategy here differs in
            its accounts, not in your house — so they read lower than the Dashboard's "Legacy" tile, which is the whole
            estate. The gap between the two is your non-portfolio assets, and it is the same on every row.
          </p>
        </div>
      )}
    </div>
  );
}

// ── CURRENT YEAR ─────────────────────────────────────────────────────────────
// Everything else in this app answers "what does 2041 look like". This tab
// answers "what should I do before December 31", which needs a different kind of
// input: what has ALREADY happened this year, at the granularity a real return
// uses. The engine side is computeTaxReturn / buildTaxSituation.
//
// Module scope, like every other tab — defining a component inside
// RetirementPlanner remounts the subtree on each parent render and loses focus
// mid-keystroke (see the comments at the modal definitions).

// A labelled money cell for the dense YTD and K-1 grids. Wraps CurrencyCell so
// every one of the ~30 numeric inputs on this tab behaves identically.
// A small whole-number field for pay-period counts. Deliberately not
// CurrencyCell: these are counts, and a "$" prefix on "16 checks" reads wrong.
// Blank means "use the estimate", which is why it stores null rather than 0 —
// 0 checks is a meaningful (if unusual) answer and must stay distinguishable
// from "I have not told you".
function CountField({ label, value, onChange, hint, placeholder }) {
  return (
    <div>
      <label className="block text-[11px] text-slate-400 mb-1 leading-tight" title={hint || label}>{label}</label>
      <input
        type="number" min="0" step="1"
        value={Number.isFinite(value) ? value : ''}
        placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === '' ? null : Math.max(0, Math.floor(Number(raw))));
        }}
        className="w-full bg-slate-900/70 border border-slate-600/50 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500/60"
      />
    </div>
  );
}

function MoneyField({ label, value, onChange, hint, wide }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <label className="block text-[11px] text-slate-400 mb-1 leading-tight" title={hint || label}>{label}</label>
      <CurrencyCell
        value={value || 0}
        onValueChange={onChange}
        className="w-full bg-slate-900/70 border border-slate-600/50 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500/60"
      />
    </div>
  );
}

// One paystub row. `ytd` is copied straight off the stub — the stub's own YTD
// columns are the input, so nothing has to be derived or reconstructed.
function PayrollRow({ row, onChange, onDelete, projected, hasSpouse }) {
  const [open, setOpen] = React.useState(!row.ytd || !row.ytd.grossPay);
  const setYtd = (k, v) => onChange({ ...row, ytd: { ...row.ytd, [k]: v } });
  const setRem = (k, v) => onChange({ ...row, remainder: { ...row.remainder, [k]: v } });

  return (
    <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3 mb-3">
      <div className="flex flex-wrap items-end gap-2 mb-2">
        {hasSpouse && (
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Whose</label>
            <GridSelect
              value={row.owner || 'me'}
              onChange={(e) => onChange({ ...row, owner: e.target.value })}
              options={[{ value: 'me', label: 'Me' }, { value: 'spouse', label: 'Spouse' }]}
              className="bg-slate-900/70 border border-slate-600/50 rounded px-2 py-1.5 text-sm text-slate-100"
            />
          </div>
        )}
        <div className="flex-1 min-w-[140px]">
          <label className="block text-[11px] text-slate-400 mb-1">Employer (optional)</label>
          <input
            type="text" value={row.employerLabel || ''} placeholder="e.g. Acme"
            onChange={(e) => onChange({ ...row, employerLabel: e.target.value })}
            className="w-full bg-slate-900/70 border border-slate-600/50 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500/60"
          />
        </div>
        <div>
          <label className="block text-[11px] text-slate-400 mb-1">Paystub date</label>
          <input
            type="date" value={row.asOfDate || ''}
            onChange={(e) => onChange({ ...row, asOfDate: e.target.value })}
            className="bg-slate-900/70 border border-slate-600/50 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500/60"
          />
        </div>
        <div>
          <label className="block text-[11px] text-slate-400 mb-1">Paid</label>
          <GridSelect
            value={row.payFrequency || 'biweekly'}
            onChange={(e) => onChange({ ...row, payFrequency: e.target.value })}
            options={[
              { value: 'weekly', label: 'Weekly' }, { value: 'biweekly', label: 'Every 2 weeks' },
              { value: 'semimonthly', label: 'Twice a month' }, { value: 'monthly', label: 'Monthly' },
            ]}
            className="bg-slate-900/70 border border-slate-600/50 rounded px-2 py-1.5 text-sm text-slate-100"
          />
        </div>
        <button onClick={() => setOpen(!open)}
          className="px-2 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded">
          {open ? '− Hide stub' : '+ Enter stub'}
        </button>
        <button onClick={onDelete} tabIndex={-1} title="Remove this employer"
          className="px-2 py-1.5 text-red-400 hover:text-red-300 text-sm">✕</button>
      </div>

      {projected && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-400 mb-2">
          <span
            title={projected.periodsElapsedOverridden
              ? 'You set this count.'
              : `Estimated from the paystub date. For a biweekly schedule this can be off by one — it depends which day the first check of the year landed. Correct it below if it is wrong.`}>
            {projected.periodsElapsed} of {projected.periodsPerYear} paychecks done,
            <span className="text-slate-200"> {projected.periodsRemaining} left</span>
            {!projected.periodsElapsedOverridden && <span className="text-amber-400/80"> (estimated)</span>}
          </span>
          <span>Projected gross <span className="text-slate-200">{formatCurrency(projected.projected.grossPay)}</span></span>
          <span title="W-2 Box 1 — reduced by traditional deferrals">
            Box 1 <span className="text-amber-300">{formatCurrency(projected.projected.fedTaxableWages)}</span></span>
          <span title="W-2 Box 3/5 — NOT reduced by traditional deferrals. This gap is the whole traditional-vs-Roth question.">
            Box 3/5 <span className="text-sky-300">{formatCurrency(projected.projected.socialSecurityWages)}</span></span>
          {projected.deferral.cappedByLimit && (
            <span className="text-amber-400">capped at the §402(g) limit</span>
          )}
        </div>
      )}

      {open && (
        <div className="border-t border-slate-700/50 pt-3">
          <p className="text-[11px] text-slate-500 mb-2">
            Copy these from the <strong className="text-slate-400">year-to-date</strong> column of your most recent
            paystub — not the current-period column. One stub pins everything earned, deferred and withheld so far.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            <MoneyField label="YTD gross pay" value={row.ytd.grossPay} onChange={(v) => setYtd('grossPay', v)} />
            <MoneyField label="YTD federal withheld" value={row.ytd.fedWithheld} onChange={(v) => setYtd('fedWithheld', v)} />
            <MoneyField label="YTD state withheld" value={row.ytd.stateWithheld} onChange={(v) => setYtd('stateWithheld', v)} />
            <MoneyField label="YTD employer match" value={row.ytd.employerMatch} onChange={(v) => setYtd('employerMatch', v)} />
            <MoneyField label="YTD 401(k) traditional" value={row.ytd.preTax401kTraditional} onChange={(v) => setYtd('preTax401kTraditional', v)}
              hint="Pre-tax deferral. Reduces Box 1 but NOT Box 3/5." />
            <MoneyField label="YTD 401(k) Roth" value={row.ytd.roth401k} onChange={(v) => setYtd('roth401k', v)}
              hint="Reduces neither wage base. Shares the same §402(g) limit as traditional." />
            <MoneyField label="YTD HSA (payroll)" value={row.ytd.hsa} onChange={(v) => setYtd('hsa', v)}
              hint="Cafeteria-plan HSA reduces BOTH Box 1 and Box 3/5 — unlike a 401(k) deferral." />
            <MoneyField label="YTD health premiums" value={row.ytd.section125Health} onChange={(v) => setYtd('section125Health', v)}
              hint="§125 pre-tax premiums. Reduce both wage bases." />
          </div>
          <p className="text-[11px] text-slate-500 mb-2">
            The rest of the year. Leave blank to carry on exactly as you are — the tool continues your
            current pay, deferral rate and withholding rate through December.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <CountField
              label="Paychecks received so far"
              value={row.remainder.payPeriodsElapsed}
              placeholder={projected ? String(projected.estimatedPeriodsElapsed) : ''}
              onChange={(v) => setRem('payPeriodsElapsed', v)}
              hint="Count them off your stub. The calendar can only guess this for a biweekly schedule, because it depends which day the first check of the year landed." />
            <CountField
              label="Paychecks in the whole year"
              value={row.remainder.payPeriodsPerYear}
              placeholder={projected ? String(projected.periodsPerYear) : ''}
              onChange={(v) => setRem('payPeriodsPerYear', v)}
              hint="26 for biweekly in most years — but 26 x 14 days is only 364, so roughly every eleventh year pays 27. Weekly likewise pays 53 some years." />
            <MoneyField label="Gross per paycheck" value={row.remainder.perPeriodGross} onChange={(v) => setRem('perPeriodGross', v)}
              hint="Defaults to YTD gross divided by the paycheck count." />
            <MoneyField label="Bonus still to come" value={row.remainder.knownBonus} onChange={(v) => setRem('knownBonus', v)} />
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Traditional % (rest of year)</label>
              <PercentCell
                value={(row.remainder.deferralPercent ?? 0) / 100}
                onValueChange={(v) => setRem('deferralPercent', v * 100)}
                className="w-full bg-slate-900/70 border border-slate-600/50 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500/60"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Roth % (rest of year)</label>
              <PercentCell
                value={(row.remainder.rothDeferralPercent ?? 0) / 100}
                onValueChange={(v) => setRem('rothDeferralPercent', v * 100)}
                className="w-full bg-slate-900/70 border border-slate-600/50 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500/60"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// One K-1, laid out by box number so it can be filled in straight from the form.
// The boxes do NOT all go to the same place — box 5 is interest, 6b is qualified
// dividends, 9a is long-term gain — and entering them separately is what lets
// the return route each to its correct 1040 line.
function K1Row({ k1, onChange, onDelete, detail }) {
  const [open, setOpen] = React.useState(!k1.label);
  const setBox = (k, v) => onChange({ ...k1, boxes: { ...k1.boxes, [k]: v } });

  return (
    <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3 mb-3">
      <div className="flex flex-wrap items-end gap-2 mb-2">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-[11px] text-slate-400 mb-1">Partnership (optional label)</label>
          <input
            type="text" value={k1.label || ''} placeholder="e.g. Partnership A"
            onChange={(e) => onChange({ ...k1, label: e.target.value })}
            className="w-full bg-slate-900/70 border border-slate-600/50 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500/60"
          />
        </div>
        <div>
          <label className="block text-[11px] text-slate-400 mb-1">Your role</label>
          <GridSelect
            value={k1.isPassive === false ? 'active' : 'passive'}
            onChange={(e) => onChange({ ...k1,
              isPassive: e.target.value === 'passive',
              materiallyParticipates: e.target.value === 'active' })}
            options={[
              { value: 'passive', label: 'Passive (no material participation)' },
              { value: 'active', label: 'I materially participate' },
            ]}
            className="bg-slate-900/70 border border-slate-600/50 rounded px-2 py-1.5 text-sm text-slate-100"
          />
        </div>
        <button onClick={() => setOpen(!open)}
          className="px-2 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded">
          {open ? '− Hide boxes' : '+ Enter boxes'}
        </button>
        <button onClick={onDelete} tabIndex={-1} title="Remove this K-1"
          className="px-2 py-1.5 text-red-400 hover:text-red-300 text-sm">✕</button>
      </div>

      {detail && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-400 mb-2">
          <span>Taxable share <span className="text-slate-200">{formatCurrency(detail.taxableShare)}</span></span>
          <span>Cash received <span className="text-slate-200">{formatCurrency(detail.cashDistributed)}</span></span>
          <span title="You are taxed on your distributive share whether or not cash came out.">
            Phantom <span className={detail.taxableShare - detail.cashDistributed > 0 ? 'text-amber-300' : 'text-emerald-300'}>
              {formatCurrency(detail.taxableShare - detail.cashDistributed)}</span></span>
          <span>Ending basis <span className="text-slate-200">{formatCurrency(detail.basis.basisEnd)}</span></span>
        </div>
      )}

      {open && (
        <div className="border-t border-slate-700/50 pt-3">
          <p className="text-[11px] text-slate-500 mb-2">
            Straight off the K-1, box by box. Boxes 1 and 2 go to Schedule E; boxes 5, 6 and 9a go to their
            own 1040 lines and keep their own tax treatment, which is why they are entered separately.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            <MoneyField label="1 — Ordinary business income" value={k1.boxes.b1_ordinaryBusiness} onChange={(v) => setBox('b1_ordinaryBusiness', v)} />
            <MoneyField label="2 — Net rental real estate" value={k1.boxes.b2_rental} onChange={(v) => setBox('b2_rental', v)} />
            <MoneyField label="5 — Interest income" value={k1.boxes.b5_interest} onChange={(v) => setBox('b5_interest', v)} />
            <MoneyField label="6a — Ordinary dividends" value={k1.boxes.b6a_ordinaryDiv} onChange={(v) => setBox('b6a_ordinaryDiv', v)} />
            <MoneyField label="6b — Qualified dividends" value={k1.boxes.b6b_qualifiedDiv} onChange={(v) => setBox('b6b_qualifiedDiv', v)} />
            <MoneyField label="8 — Short-term capital gain" value={k1.boxes.b8_shortTermGain} onChange={(v) => setBox('b8_shortTermGain', v)} />
            <MoneyField label="9a — Long-term capital gain" value={k1.boxes.b9a_longTermGain} onChange={(v) => setBox('b9a_longTermGain', v)} />
            <MoneyField label="13 — Deductions" value={k1.boxes.b13_deductions} onChange={(v) => setBox('b13_deductions', v)} />
            <MoneyField label="14a — Self-employment earnings" value={k1.boxes.b14a_seEarnings} onChange={(v) => setBox('b14a_seEarnings', v)}
              hint="Usually blank for a limited partner. If it has a figure, self-employment tax applies." />
            <MoneyField label="19 — Distributions (cash)" value={k1.boxes.b19_distributions} onChange={(v) => setBox('b19_distributions', v)}
              hint="Cash out. Not income — it reduces your basis." />
            <MoneyField label="20Z — Qualified business income" value={k1.boxes.b20z_qbi} onChange={(v) => setBox('b20z_qbi', v)}
              hint="Drives the 20% §199A deduction." />
            <MoneyField label="20Z — W-2 wages" value={k1.boxes.b20z_w2Wages} onChange={(v) => setBox('b20z_w2Wages', v)}
              hint="Caps the §199A deduction once your taxable income passes the threshold." />
            <MoneyField label="20Z — UBIA of qualified property" value={k1.boxes.b20z_ubia} onChange={(v) => setBox('b20z_ubia', v)} />
            <MoneyField label="Your outside basis, start of year" value={k1.basisStart} onChange={(v) => onChange({ ...k1, basisStart: v })}
              hint="Limits deductible losses (§704(d)); distributions beyond it are taxable gain (§731)." />
            <MoneyField label="Suspended passive loss carried in" value={k1.suspendedLossCarryforward} onChange={(v) => onChange({ ...k1, suspendedLossCarryforward: v })} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── TAX BREAKPOINTS TABLE ────────────────────────────────────────────────────
// One component, three homes: the Tax Planning tab (year-selectable), the
// Current Year tab (pinned to this year), and the printed next-year report.
// Reads engine.taxBreakpoints, so all three quote the same edges the engine
// actually uses — a table that quoted its own copy would drift the moment a
// threshold changed and would be worse than no table.
function TaxBreakpointsTable({ projections, personalInfo, fixedAge = null, forPrint = false, title }) {
  const ages = (projections || []).map(p => p.myAge);
  const [selectedAge, setSelectedAge] = React.useState(
    fixedAge !== null ? fixedAge : (ages[0] ?? personalInfo.myAge));
  const [showAll, setShowAll] = React.useState(false);

  // The projection's own range, not legacyAge — a plan can end earlier (both
  // spouses gone) or run longer, and a slider that can select a year with no row
  // would blank the table.
  const minAge = ages.length ? Math.min(...ages) : personalInfo.myAge;
  const maxAge = ages.length ? Math.max(...ages) : personalInfo.myAge;
  const requested = fixedAge !== null ? fixedAge : selectedAge;
  // Clamp rather than return null: if the plan shortens under a selected age,
  // showing the nearest year beats showing nothing.
  const age = Math.max(minAge, Math.min(maxAge, requested));
  const row = (projections || []).find(p => p.myAge === age)
    || (projections || []).find(p => p.myAge >= age)
    || (projections || [])[0];
  if (!row) return null;

  const medicareEligible = row.age65Count || 0;
  const all = taxBreakpoints({ row, pi: personalInfo, numMedicareEligible: medicareEligible });
  // Inactive rows are thresholds that exist but cannot bite this year — NIIT
  // with no investment income, capital-gains rates with no gains. Hidden by
  // default so the list shows what actually applies, but never deleted: "why
  // isn't NIIT listed?" is a worse question than one extra row.
  const rows = showAll ? all : all.filter(b => !b.inactive);
  const approaching = rows.filter(b => !b.crossed);
  const crossed = rows.filter(b => b.crossed);

  const money = (v) => formatCurrency(Math.round(v));
  const cost = (b) => {
    if (b.crossingCost > 0) return `${money(b.crossingCost)} at once`;
    if (b.crossingCostRate) return `${(b.crossingCostRate * 100).toFixed(1)}% per extra $`;
    return '—';
  };
  const kindChip = (b) => {
    const map = { cliff: ['CLIFF', 'bg-red-900/40 text-red-300'],
                  phase: ['PHASE', 'bg-amber-900/40 text-amber-300'],
                  rate:  ['RATE',  'bg-sky-900/40 text-sky-300'] };
    const [label, cls] = map[b.kind] || ['', ''];
    return <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${forPrint ? 'text-slate-600' : cls}`}>{label}</span>;
  };

  const body = (b, i) => (
    <tr key={b.label} className={forPrint ? 'border-b border-slate-300'
      : `border-b border-slate-800/70 ${i % 2 === 0 ? 'bg-slate-800/20' : ''}`}>
      <td className={`py-1.5 pr-2 ${forPrint ? 'text-slate-900' : 'text-slate-200'}`}>
        {b.label} {!forPrint && kindChip(b)}
        {b.note && <span className={`block text-[10px] ${forPrint ? 'text-slate-600' : 'text-slate-500'}`}>{b.note}</span>}
      </td>
      <td className={`py-1.5 px-2 text-[11px] ${forPrint ? 'text-slate-600' : 'text-slate-400'}`}>{b.basis}</td>
      <td className={`py-1.5 px-2 text-right tabular-nums ${forPrint ? 'text-slate-900' : 'text-slate-300'}`}>{money(b.threshold)}</td>
      <td className={`py-1.5 px-2 text-right tabular-nums ${forPrint ? 'text-slate-900' : 'text-slate-300'}`}>{money(b.current)}</td>
      <td className={`py-1.5 px-2 text-right tabular-nums font-medium ${
        forPrint ? 'text-slate-900' : (b.crossed ? 'text-slate-500' : (b.distance < 25000 ? 'text-amber-300' : 'text-emerald-400'))}`}>
        {b.crossed ? `over by ${money(-b.distance)}` : money(b.distance)}
      </td>
      <td className={`py-1.5 pl-2 text-right tabular-nums text-[11px] ${forPrint ? 'text-slate-700' : 'text-slate-400'}`}>{cost(b)}</td>
    </tr>
  );

  const head = (
    <tr className={forPrint ? 'border-b-2 border-slate-400 text-slate-700 text-left'
                            : 'border-b border-slate-700 text-slate-400 text-left'}>
      <th className="py-1.5 pr-2 font-medium">Threshold</th>
      <th className="py-1.5 px-2 font-medium">Measured on</th>
      <th className="py-1.5 px-2 font-medium text-right">Edge</th>
      <th className="py-1.5 px-2 font-medium text-right">Yours</th>
      <th className="py-1.5 px-2 font-medium text-right">Headroom</th>
      <th className="py-1.5 pl-2 font-medium text-right">Crossing costs</th>
    </tr>
  );

  return (
    <div className={forPrint ? 'mb-6' : cardStyle}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <div>
          <h4 className={`font-semibold ${forPrint ? 'text-base text-slate-900' : 'text-lg text-slate-100'}`}>
            {/* No "this year" in the default: the slider can be anywhere in the
                plan, and the selected year is already shown beside it. The
                Current Year tab passes its own title with the year in it. */}
            {title || `Income thresholds at age ${age}`}
          </h4>
          <p className={`text-xs mt-1 max-w-2xl ${forPrint ? 'text-slate-600' : 'text-slate-400'}`}>
            Every edge a year can cross, and how much room is left before each. They are measured on
            four different quantities — provisional income, MAGI, taxable income and wages — which is
            why no single number tells you whether you are near one.
          </p>
        </div>
        {fixedAge === null && !forPrint && (
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-sm">Age:</span>
            <input
              type="range"
              min={minAge}
              max={maxAge}
              value={age}
              onChange={e => setSelectedAge(Number(e.target.value))}
              className="w-32 accent-amber-500"
            />
            <input
              type="number"
              min={minAge}
              max={maxAge}
              value={age}
              onChange={e => setSelectedAge(Math.max(minAge, Math.min(maxAge, Number(e.target.value))))}
              className="w-16 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-100 text-center text-sm"
            />
            <span className="text-slate-500 text-xs">(Year {row.year})</span>
          </div>
        )}
      </div>

      {medicareEligible === 0 && (
        <p className={`text-[11px] mb-2 ${forPrint ? 'text-slate-600' : 'text-slate-500'}`}>
          Nobody is on Medicare at age {age}, so the IRMAA rows are not charged this year — but this
          year&rsquo;s MAGI still sets the premium two years from now, which is why they are listed.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className={`w-full ${forPrint ? 'text-[11px]' : 'text-sm'}`}>
          <thead>{head}</thead>
          <tbody>
            {approaching.length > 0 && (
              <tr><td colSpan={6} className={`pt-3 pb-1 text-[10px] uppercase tracking-wide font-semibold ${
                forPrint ? 'text-slate-500' : 'text-slate-500'}`}>Not yet crossed — nearest first</td></tr>
            )}
            {approaching.map(body)}
            {crossed.length > 0 && (
              <tr><td colSpan={6} className={`pt-3 pb-1 text-[10px] uppercase tracking-wide font-semibold ${
                forPrint ? 'text-slate-500' : 'text-slate-500'}`}>Already past</td></tr>
            )}
            {crossed.map(body)}
          </tbody>
        </table>
      </div>

      {!forPrint && (
        <button onClick={() => setShowAll(!showAll)}
          className="mt-2 text-[11px] text-slate-500 hover:text-slate-300 underline">
          {showAll ? 'Hide thresholds that cannot apply this year'
                   : `Show ${all.length - rows.length} threshold${all.length - rows.length === 1 ? '' : 's'} that cannot apply this year`}
        </button>
      )}
    </div>
  );
}


function CurrentYearTab({ detailLevel, sectionVisibility, setSectionVisibility, currentYearData, setCurrentYearData, personalInfo, projections, setPersonalInfo }) {
  const [openInfoCard, setOpenInfoCard] = React.useState(null);
  const [showPrior, setShowPrior] = React.useState(false);
  const [rateOverride, setRateOverride] = React.useState(null);

  const cy = currentYearData || DEFAULT_CURRENT_YEAR;
  const hasSpouse = personalInfo.filingStatus === 'married_joint';
  const set = (patch) => setCurrentYearData({ ...cy, ...patch });
  const setIn = (key, patch) => set({ [key]: { ...(cy[key] || {}), ...patch } });

  // The whole tab is one derivation from the slice. If this throws on a
  // half-filled input the tab is useless during the exact period it exists for,
  // so it is guarded and reports the failure rather than blanking the page.
  const result = React.useMemo(() => {
    try {
      const situation = buildTaxSituation(cy, personalInfo);
      return { situation, ret: computeTaxReturn(situation), error: null };
    } catch (e) {
      return { situation: null, ret: null, error: e.message };
    }
  }, [cy, personalInfo]);

  const future = projectedWithdrawalRate(projections, personalInfo);
  const futureRate = rateOverride === null ? future.rate : rateOverride;

  const decision = React.useMemo(() => {
    try { return compareTraditionalVsRoth(cy, personalInfo, futureRate); }
    catch (e) { return null; }
  }, [cy, personalInfo, futureRate]);

  if (result.error) {
    return (
      <div className={cardStyle}>
        <h3 className="text-lg font-semibold text-red-300 mb-2">Could not compute this year&rsquo;s return</h3>
        <p className="text-sm text-slate-400">{result.error}</p>
      </div>
    );
  }

  const r = result.ret;
  const L = (k) => (r.lines[k] ? r.lines[k].amount : 0);
  const payrollProjections = result.situation._payroll || [];

  // 1040 display groups. Lines 3a and 2a are memo lines — they are already
  // inside 3b and are not added again, which is why they are dimmed.
  const formGroups = [
    { title: 'Income', lines: ['1a', '2a', '2b', '3a', '3b', '4b', '5b', '6a', '6b', '7', '8', '9'] },
    { title: 'Adjusted gross income', lines: ['10', '11'] },
    { title: 'Deductions', lines: ['12', '13', '14', '15'] },
    { title: 'Tax', lines: ['16', '23', '24'] },
    { title: 'Payments', lines: ['25', '26', '33'] },
    { title: 'Result', lines: ['34', '37'] },
  ];
  const memoLines = new Set(['2a', '3a', '6a']);
  const keyLines = new Set(['11', '15', '24', '34', '37']);

  const totalRemainingPeriods = payrollProjections.reduce((s, p) => s + p.projected.periodsRemaining, 0);
  const perCheckBump = totalRemainingPeriods > 0 ? r.safeHarbor.shortfall / totalRemainingPeriods : 0;

  return (
    <div className="space-y-6">
      <BasisNote pi={personalInfo} reason={
        'A tax return is a nominal document for one specific year — every line on it is the dollar figure ' +
        'the IRS wants, not a purchasing-power equivalent.'} />
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className={cardStyle}>
        <div className="flex items-start justify-between gap-4 mb-2">
          <div>
            <h3 className="text-xl font-semibold text-slate-100">Current Year ({cy.taxYear})</h3>
            <p className="text-sm text-slate-400 mt-1">
              Everything else here plans decades out. This plans the months you have left —
              what you have already earned, deferred and withheld, and what that makes the
              December decisions worth.
            </p>
          </div>
          <InfoCard
            title="Current Year"
            isOpen={openInfoCard === 'currentyear'}
            onToggle={() => setOpenInfoCard(openInfoCard === 'currentyear' ? null : 'currentyear')}
            sections={[
              { heading: 'What this is for',
                body: 'Decisions with a deadline: whether to defer to traditional or Roth for the rest of the year, whether to raise withholding, and whether you are about to cross a threshold that costs more than your bracket suggests.' },
              { heading: 'Why a paystub',
                body: 'A paystub carries year-to-date totals in its own columns. One recent stub per employer pins everything so far, and only the remaining pay periods have to be projected — which is also the only part you can still change.' },
              { heading: 'Box 1 versus Box 3/5',
                body: 'Traditional 401(k) deferrals reduce W-2 Box 1 (federal taxable wages) but not Box 3/5 (Social Security and Medicare wages). Deferring saves income tax and never saves FICA, so the comparison is against your future income-tax rate alone.' },
              { heading: 'Your data stays here',
                body: 'This is stored in your browser only, like the rest of the plan. It is included in plan exports, which now carry wage and withholding detail — so treat an exported file accordingly. Nothing asks for a Social Security or employer ID number.' },
            ]}
          />
        </div>
      </div>

      {/* The switch at the BOTTOM of this tab decides whether any of this work
          reaches the 40-year plan, and it is off by default. Someone who has
          entered a paystub, a K-1 and a deduction has already done the hard
          part; leaving the one line that says none of it counts at the foot of
          a long page means the tab quietly does nothing for them. Shown here
          only when there is real data behind it, so an empty tab stays quiet. */}
      {(() => {
        const hasData = (cy.payroll || []).length > 0 || (cy.k1s || []).length > 0
          || Object.values(cy.otherIncome || {}).some(v => Number(v) > 0);
        if (!hasData || personalInfo.useDetailedCurrentYear) return null;
        return (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-lg
                          bg-amber-500/10 border border-amber-500/35">
            <div className="text-sm text-amber-200">
              <strong>These figures are not in your plan yet.</strong>
              <span className="block text-xs text-amber-200/75 mt-0.5">
                Year one of the long-range projection is still a synthetic year built from a salary figure.
                It cannot see your paystubs, your K-1 or your deductions until you switch this on.
              </span>
            </div>
            <button
              onClick={() => setPersonalInfo({ ...personalInfo, useDetailedCurrentYear: true })}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-500/20 text-amber-200
                         border border-amber-500/50 hover:bg-amber-500/30 transition-colors shrink-0"
            >Use them in the plan</button>
          </div>
        );
      })()}

      <SectionControls tab="currentyear" vis={sectionVisibility} setVis={setSectionVisibility}
                       level={detailLevel} />
      <HideableBlock tab="currentyear" id="payroll" level={detailLevel}
                     vis={sectionVisibility} setVis={setSectionVisibility}>
        {/* ── Paystubs ───────────────────────────────────────────────────── */}
        <div className={cardStyle}>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-lg font-semibold text-slate-100">Paychecks</h4>
            <button
              onClick={() => set({ payroll: [...(cy.payroll || []), newPayrollRow(hasSpouse && (cy.payroll || []).length ? 'spouse' : 'me')] })}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded">+ Add employer</button>
          </div>
          {(cy.payroll || []).length === 0 && (
            <p className="text-sm text-slate-500">
              Add an employer and copy in the year-to-date column of a recent paystub. That single column is
              enough to project the whole year.
            </p>
          )}
          {(cy.payroll || []).map((row, i) => (
            <PayrollRow
              key={row.id} row={row} hasSpouse={hasSpouse}
              projected={payrollProjections[i] ? payrollProjections[i].projected : null}
              onChange={(next) => set({ payroll: cy.payroll.map(x => x.id === row.id ? next : x) })}
              onDelete={() => set({ payroll: cy.payroll.filter(x => x.id !== row.id) })}
            />
          ))}
        </div>
      </HideableBlock>

      <HideableBlock tab="currentyear" id="k1s" level={detailLevel}
                     vis={sectionVisibility} setVis={setSectionVisibility}>
        {/* ── K-1s ───────────────────────────────────────────────────────── */}
        <div className={cardStyle}>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-lg font-semibold text-slate-100">Schedule K-1s</h4>
            <button onClick={() => set({ k1s: [...(cy.k1s || []), newK1Row()] })}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded">+ Add K-1</button>
          </div>
          {(cy.k1s || []).length === 0 && (
            <p className="text-sm text-slate-500">
              Add a K-1 for each partnership. Until this year&rsquo;s arrives, last year&rsquo;s figures are the
              best available estimate — the point is to be roughly right in time to act, not exactly right in April.
            </p>
          )}
          {(cy.k1s || []).map((k1, i) => (
            <K1Row
              key={k1.id} k1={k1} detail={r.k1s[i]}
              onChange={(next) => set({ k1s: cy.k1s.map(x => x.id === k1.id ? next : x) })}
              onDelete={() => set({ k1s: cy.k1s.filter(x => x.id !== k1.id) })}
            />
          ))}
        </div>
      </HideableBlock>

      <HideableBlock tab="currentyear" id="otherIncome" level={detailLevel}
                     vis={sectionVisibility} setVis={setSectionVisibility}>
        {/* ── Other income, deductions, payments, prior year ─────────────── */}
        <div className={cardStyle}>
          <h4 className="text-lg font-semibold text-slate-100 mb-3">Everything else</h4>
          <p className="text-[11px] text-slate-500 mb-2">Investment income outside a K-1.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
            <MoneyField label="Taxable interest" value={cy.otherIncome.taxableInterest} onChange={(v) => setIn('otherIncome', { taxableInterest: v })} />
            <MoneyField label="Tax-exempt interest" value={cy.otherIncome.taxExemptInterest} onChange={(v) => setIn('otherIncome', { taxExemptInterest: v })} />
            <MoneyField label="Ordinary dividends" value={cy.otherIncome.ordinaryDividends} onChange={(v) => setIn('otherIncome', { ordinaryDividends: v })} />
            <MoneyField label="Qualified dividends" value={cy.otherIncome.qualifiedDividends} onChange={(v) => setIn('otherIncome', { qualifiedDividends: v })} />
            <MoneyField label="Short-term gains" value={cy.otherIncome.shortTermGain} onChange={(v) => setIn('otherIncome', { shortTermGain: v })} />
            <MoneyField label="Long-term gains" value={cy.otherIncome.longTermGain} onChange={(v) => setIn('otherIncome', { longTermGain: v })} />
            <MoneyField label="Capital loss carried in" value={cy.otherIncome.longTermLossCarryforward} onChange={(v) => setIn('otherIncome', { longTermLossCarryforward: v })} />
            <MoneyField label="Other income" value={cy.otherIncome.otherIncome} onChange={(v) => setIn('otherIncome', { otherIncome: v })} />
          </div>

          <p className="text-[11px] text-slate-500 mb-2">
            Deductions. The tool takes whichever is larger and tells you which — with the 2026 SALT cap at
            {' '}{formatCurrency(saltCapFor(cy.taxYear, personalInfo.filingStatus, L('11')))} rather than $10,000,
            that answer may not be the one you are used to.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
            <MoneyField label="Property tax" value={cy.deductions.propertyTax} onChange={(v) => setIn('deductions', { propertyTax: v })} />
            <MoneyField label="Mortgage interest" value={cy.deductions.mortgageInterest} onChange={(v) => setIn('deductions', { mortgageInterest: v })} />
            <MoneyField label="Charitable (cash)" value={cy.deductions.charitableCash} onChange={(v) => setIn('deductions', { charitableCash: v })} />
            <MoneyField label="Medical expenses" value={cy.deductions.medicalExpenses} onChange={(v) => setIn('deductions', { medicalExpenses: v })} />
            <MoneyField label="Direct HSA (not payroll)" value={cy.adjustments.hsaDirectContribution} onChange={(v) => setIn('adjustments', { hsaDirectContribution: v })}
              hint="Only contributions you made outside payroll. A payroll HSA already came out of Box 1." />
            <MoneyField label="Deductible IRA" value={cy.adjustments.deductibleIRA} onChange={(v) => setIn('adjustments', { deductibleIRA: v })} />
          </div>

          <p className="text-[11px] text-slate-500 mb-2">Estimated tax payments already made.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
            {[0, 1, 2, 3].map(q => (
              <MoneyField key={q} label={`Federal Q${q + 1}`}
                value={(cy.estimatedPayments.federal || [])[q]}
                onChange={(v) => {
                  const next = [...(cy.estimatedPayments.federal || [0, 0, 0, 0])];
                  next[q] = v;
                  setIn('estimatedPayments', { federal: next });
                }} />
            ))}
          </div>

          <button onClick={() => setShowPrior(!showPrior)}
            className="text-sm text-amber-400 hover:text-amber-300">
            {showPrior ? '− ' : '+ '}Last year&rsquo;s return {r.safeHarbor.priorYearTest === null && (
              <span className="text-slate-500">— needed for the safe-harbor test</span>)}
          </button>
          {showPrior && (
            <div className="mt-3">
              <p className="text-[11px] text-slate-500 mb-2">
                Two lines off last year&rsquo;s Form 1040. They set the §6654 safe harbor, which is usually the
                cheaper of the two ways to avoid an underpayment penalty — and the only one you can compute
                before the year is over.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <MoneyField label="Line 11 — AGI" value={cy.priorYearReturn.agi} onChange={(v) => setIn('priorYearReturn', { agi: v })} />
                <MoneyField label="Line 24 — total tax" value={cy.priorYearReturn.totalTax} onChange={(v) => setIn('priorYearReturn', { totalTax: v })} />
              </div>
            </div>
          )}
        </div>
      </HideableBlock>

      <HideableBlock tab="currentyear" id="form1040" level={detailLevel}
                     vis={sectionVisibility} setVis={setSectionVisibility}>
        {/* ── The return itself ──────────────────────────────────────────── */}
        <div className={cardStyle}>
          <div className="flex items-start justify-between gap-4 mb-1">
            <h4 className="text-lg font-semibold text-slate-100">Projected Form 1040</h4>
            <span className="text-xs text-slate-500">line numbers match the real form</span>
          </div>
          <p className="text-sm text-slate-400 mb-4">
            Where this year lands if nothing changes. Every line carries its actual 1040 number so you can
            set it beside a filed return, or your preparer&rsquo;s draft, and reconcile it line by line.
            Built from the paychecks, K-1s and other figures on this tab — not from the plan&rsquo;s
            projection, whose version of this year is the Tax Year Snapshot on Taxes &amp; Roth.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {formGroups.map(group => (
                  <React.Fragment key={group.title}>
                    <tr>
                      <td colSpan={3} className="pt-4 pb-1 text-xs uppercase tracking-wide text-slate-500 font-semibold">
                        {group.title}
                      </td>
                    </tr>
                    {group.lines.map(k => {
                      const line = r.lines[k];
                      if (!line) return null;
                      const memo = memoLines.has(k);
                      const key = keyLines.has(k);
                      return (
                        <tr key={k} className={`border-b border-slate-800/70 ${key ? 'bg-slate-800/40' : ''}`}>
                          <td className="py-1.5 pr-3 text-slate-500 font-mono text-xs w-12 align-top">{k}</td>
                          <td className={`py-1.5 pr-4 ${memo ? 'text-slate-500' : key ? 'text-slate-100 font-medium' : 'text-slate-300'}`}>
                            {line.label}
                            {line.which && <span className="ml-2 text-xs text-amber-400">({line.which})</span>}
                            {memo && <span className="ml-2 text-[10px] text-slate-500">memo — already inside the line above</span>}
                          </td>
                          <td className={`py-1.5 text-right tabular-nums whitespace-nowrap ${
                            memo ? 'text-slate-500' : key ? 'text-slate-100 font-semibold' : 'text-slate-300'}`}>
                            {formatCurrency(line.amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Supporting schedules — the working behind the lines above. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
            <div className="bg-slate-800/40 rounded-lg p-3">
              <h5 className="text-sm font-semibold text-slate-200 mb-2">Schedule A vs. the standard deduction</h5>
              <div className="text-xs text-slate-400 space-y-1">
                <div className="flex justify-between"><span>State and local tax paid</span><span className="text-slate-200">{formatCurrency(r.schedules.A.saltPaid)}</span></div>
                <div className="flex justify-between"><span>SALT cap this year</span><span className={r.schedules.A.saltCapBinding ? 'text-amber-300' : 'text-slate-200'}>{formatCurrency(r.schedules.A.saltCap)}</span></div>
                <div className="flex justify-between"><span>Mortgage interest</span><span className="text-slate-200">{formatCurrency(r.schedules.A.mortgageInterest)}</span></div>
                <div className="flex justify-between"><span>Charitable, less the 0.5% AGI floor</span><span className="text-slate-200">{formatCurrency(r.schedules.A.charitableDeductible)}</span></div>
                <div className="flex justify-between border-t border-slate-700 pt-1 mt-1">
                  <span className="text-slate-300">Itemized total</span><span className="text-slate-100 font-medium">{formatCurrency(r.schedules.A.allowedAfterCap)}</span></div>
                <div className="flex justify-between"><span className="text-slate-300">Standard deduction</span><span className="text-slate-100 font-medium">{formatCurrency(r.schedules.A.standardAlternative)}</span></div>
                <div className={`mt-2 px-2 py-1.5 rounded ${r.schedules.A.wouldItemize ? 'bg-emerald-900/30 text-emerald-300' : 'bg-slate-700/40 text-slate-300'}`}>
                  {r.schedules.A.wouldItemize
                    ? `Itemizing wins by ${formatCurrency(r.schedules.A.allowedAfterCap - r.schedules.A.standardAlternative)}.`
                    : `The standard deduction wins by ${formatCurrency(r.schedules.A.standardAlternative - r.schedules.A.allowedAfterCap)}.`}
                </div>
              </div>
            </div>

            <div className="bg-slate-800/40 rounded-lg p-3">
              <h5 className="text-sm font-semibold text-slate-200 mb-2">K-1s, §199A and the 3.8% surtax</h5>
              <div className="text-xs text-slate-400 space-y-1">
                <div className="flex justify-between"><span>Passive income reaching AGI</span><span className="text-slate-200">{formatCurrency(r.passive.netPassiveToAGI)}</span></div>
                {r.passive.suspendedCarryforwardEnd > 0 && (
                  <div className="flex justify-between"><span>Passive loss suspended (§469)</span><span className="text-amber-300">{formatCurrency(r.passive.suspendedCarryforwardEnd)}</span></div>
                )}
                <div className="flex justify-between"><span>Net qualified business income</span><span className="text-slate-200">{formatCurrency(r.qbi.netQBI)}</span></div>
                <div className="flex justify-between"><span>§199A deduction</span><span className="text-slate-100 font-medium">{formatCurrency(r.qbi.deduction)}</span></div>
                {r.qbi.phase > 0 && (
                  <div className="text-[11px] text-amber-400/90">
                    You are {Math.round(r.qbi.phase * 100)}% through the §199A phase-in — each extra dollar of
                    taxable income is also shrinking this deduction.
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-700 pt-1 mt-1"><span>Net investment income</span><span className="text-slate-200">{formatCurrency(r.netInvestmentIncome)}</span></div>
                <div className="flex justify-between"><span>Net investment income tax</span><span className={r.schedules.two.niit > 0 ? 'text-amber-300 font-medium' : 'text-slate-200'}>{formatCurrency(r.schedules.two.niit)}</span></div>
                {r.schedules.SE.total > 0 && (
                  <div className="flex justify-between"><span>Self-employment tax (box 14a)</span><span className="text-slate-200">{formatCurrency(r.schedules.SE.total)}</span></div>
                )}
              </div>
            </div>
          </div>

          {r.diagnostics.length > 0 && (
            <div className="mt-4 space-y-1">
              {r.diagnostics.map((d, i) => (
                <div key={i} className={`text-xs px-3 py-2 rounded ${
                  d.severity === 'warning' ? 'bg-amber-900/25 text-amber-300' : 'bg-slate-800/60 text-slate-400'}`}>
                  {d.message}
                </div>
              ))}
            </div>
          )}
        </div>
      </HideableBlock>

      {/* Pinned to this year: on this tab the question is always "what can I
          still do before December 31", so a year selector would be noise. */}
      <TaxBreakpointsTable
        projections={projections}
        personalInfo={personalInfo}
        fixedAge={personalInfo.myAge}
        title={`Income thresholds for ${cy.taxYear}`}
      />

      <HideableBlock tab="currentyear" id="decisions" level={detailLevel}
                     vis={sectionVisibility} setVis={setSectionVisibility}>
        {/* ── Decisions ──────────────────────────────────────────────────── */}
        <div className={cardStyle}>
          <h4 className="text-lg font-semibold text-slate-100 mb-1">What to do about it</h4>
          <p className="text-sm text-slate-400 mb-4">
            Four things you can still change before December 31.
          </p>

          {/* 1. Traditional vs Roth */}
          <div className="bg-slate-800/40 rounded-lg p-4 mb-3">
            <h5 className="text-sm font-semibold text-slate-200 mb-2">1 &middot; Traditional or Roth for the rest of the year</h5>
            {decision ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                  <div>
                    <p className="text-[11px] text-slate-400">Rate you avoid now</p>
                    <p className="text-2xl font-semibold text-amber-400">{(decision.marginalRateNow * 100).toFixed(1)}%</p>
                    <p className="text-[11px] text-slate-500">measured on the whole return, not read off a bracket</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400">Rate you expect to pay later</p>
                    <div className="flex items-center gap-2">
                      <PercentCell
                        value={futureRate}
                        onValueChange={(v) => setRateOverride(v)}
                        className="w-20 bg-slate-900/70 border border-slate-600/50 rounded px-2 py-1 text-lg text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500/60"
                      />
                      {rateOverride !== null && (
                        <button onClick={() => setRateOverride(null)} className="text-[11px] text-slate-500 hover:text-slate-300 underline">reset</button>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {future.sample > 0
                        ? `median bracket across ${future.sample} retirement years in your plan (${(future.low * 100).toFixed(0)}–${(future.high * 100).toFixed(0)}%)`
                        : 'no retirement years projected yet'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400">Verdict</p>
                    <p className="text-2xl font-semibold"
                       style={{ color: decision.favors === 'close' ? THEME.inkSecondary : treatmentInk(decision.favors) }}>
                      {decision.favors === 'traditional' ? 'Traditional' : decision.favors === 'roth' ? 'Roth' : 'Line ball'}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {Math.abs(decision.advantagePerDollar * 100).toFixed(1)} cents per dollar deferred
                    </p>
                  </div>
                </div>
                {/* Only line 16, Schedule 2 and state are ADDITIVE — together they are
                    the whole saving. The QBI and deduction figures explain part of
                    why line 16 moved as much as it did and are already inside it, so
                    they are stated separately rather than listed alongside, which
                    would read as double-counting and would not sum to the rate. */}
                <div className="text-xs text-slate-400">
                  Where the {(decision.marginalRateNow * 100).toFixed(1)}% comes from, per $1,000 deferred:
                  <span className="text-slate-300"> {formatCurrency(Math.abs(decision.components.bracket))} income tax</span>
                  {Math.abs(decision.components.niit) > 0.5 && <span className="text-amber-300"> + {formatCurrency(Math.abs(decision.components.niit))} net investment income tax</span>}
                  {Math.abs(decision.components.state) > 0.5 && <span className="text-slate-300"> + {formatCurrency(Math.abs(decision.components.state))} state</span>}
                  {' '}= <span className="text-slate-200">{formatCurrency(decision.taxSavedNow)}</span>.
                </div>
                {(Math.abs(decision.components.qbi) > 0.5 || Math.abs(decision.components.deduction) > 0.5) && (
                  <div className="text-[11px] text-slate-500 mt-1">
                    That income-tax figure is larger than your bracket alone because deferring also
                    {Math.abs(decision.components.qbi) > 0.5 && <> restores {formatCurrency(Math.abs(decision.components.qbi))} of §199A deduction</>}
                    {Math.abs(decision.components.qbi) > 0.5 && Math.abs(decision.components.deduction) > 0.5 && ' and'}
                    {Math.abs(decision.components.deduction) > 0.5 && <> recovers {formatCurrency(Math.abs(decision.components.deduction))} of deduction</>}
                    {' '}— already counted above, not additional to it.
                  </div>
                )}
                <p className="text-[11px] text-slate-500 mt-2">
                  Deferring never saves Social Security or Medicare tax — those come out of Box 3/5, which a
                  deferral does not touch. So this is a straight comparison of income-tax rates, now against later.
                </p>
              </>
            ) : <p className="text-sm text-slate-500">Add a paycheck to compare.</p>}
          </div>

          {/* 2. Deferral headroom */}
          <div className="bg-slate-800/40 rounded-lg p-4 mb-3">
            <h5 className="text-sm font-semibold text-slate-200 mb-2">2 &middot; How much more can you defer</h5>
            {payrollProjections.length ? (
              <div className="space-y-2">
                {payrollProjections.map((p, i) => (
                  <div key={i} className="flex flex-wrap justify-between gap-2 text-xs">
                    <span className="text-slate-400">
                      {p.row.employerLabel || 'Employer'} ({p.row.owner === 'spouse' ? 'spouse' : 'you'})
                    </span>
                    <span className="text-slate-300">
                      on track for {formatCurrency(p.projected.deferral.projectedTotal)} of {formatCurrency(p.projected.deferral.cap)}
                      {' '}&mdash; <span className={p.projected.deferral.roomRemaining > 0 ? 'text-emerald-400' : 'text-slate-500'}>
                        {formatCurrency(p.projected.deferral.roomRemaining)} of room left</span>
                    </span>
                  </div>
                ))}
                <p className="text-[11px] text-slate-500 pt-2 border-t border-slate-700/50">
                  The §402(g) limit is <strong className="text-slate-400">per person, per year</strong> — traditional
                  and Roth share it, and a second employer&rsquo;s plan or a solo 401(k) shares it too. It is not a
                  limit per account.
                  {(cy.k1s || []).length > 0 && (
                    <> Your K-1 income adds <strong className="text-slate-400">no</strong> deferral room:
                    it is not earned income, so it opens no 401(k), SEP or solo-401(k) capacity.</>
                  )}
                </p>
              </div>
            ) : <p className="text-sm text-slate-500">Add a paycheck to see your remaining limit.</p>}
          </div>

          {/* 3. Withholding / estimated payments */}
          <div className="bg-slate-800/40 rounded-lg p-4 mb-3">
            <h5 className="text-sm font-semibold text-slate-200 mb-2">3 &middot; Withholding and estimated payments</h5>
            <div className="text-xs text-slate-400 space-y-1">
              <div className="flex justify-between"><span>Projected total tax</span><span className="text-slate-200">{formatCurrency(L('24'))}</span></div>
              <div className="flex justify-between"><span>Projected payments</span><span className="text-slate-200">{formatCurrency(L('33'))}</span></div>
              <div className="flex justify-between border-t border-slate-700 pt-1">
                <span className="text-slate-300">{L('37') > 0 ? 'Balance due in April' : 'Refund'}</span>
                <span className={L('37') > 0 ? 'text-amber-300 font-medium' : 'text-emerald-300 font-medium'}>
                  {formatCurrency(L('37') > 0 ? L('37') : L('34'))}</span></div>
              <div className="flex justify-between pt-2"><span>Safe-harbor requirement ({r.safeHarbor.basis})</span><span className="text-slate-200">{formatCurrency(r.safeHarbor.required)}</span></div>
              {r.safeHarbor.shortfall > 0 ? (
                <div className="mt-2 px-3 py-2 rounded bg-amber-900/25 text-amber-300">
                  You are {formatCurrency(r.safeHarbor.shortfall)} short of the safe harbor.
                  {totalRemainingPeriods > 0 && (
                    <> Raising withholding by about <strong>{formatCurrency(perCheckBump)}</strong> per paycheck
                    across your {totalRemainingPeriods} remaining checks would close it.</>
                  )}
                  <div className="text-[11px] mt-1 text-amber-400/80">
                    Withholding counts as paid evenly across the year no matter when it is withheld, so a
                    December increase cures an underpayment that a Q4 estimated payment would not.
                  </div>
                </div>
              ) : (
                <div className="mt-2 px-3 py-2 rounded bg-emerald-900/25 text-emerald-300">
                  {r.safeHarbor.deMinimis
                    ? 'No penalty exposure — the balance due is under $1,000.'
                    : 'You have already met the safe harbor, so there is no underpayment penalty even if you owe in April.'}
                </div>
              )}
              {r.safeHarbor.priorYearTest === null && (
                <p className="text-[11px] text-slate-500 pt-1">
                  Entering last year&rsquo;s AGI and total tax above would likely lower this requirement — the
                  prior-year test is usually the cheaper of the two.
                </p>
              )}
            </div>
          </div>

          {/* 4. Cash vs tax */}
          {(cy.k1s || []).length > 0 && (
            <div className="bg-slate-800/40 rounded-lg p-4">
              <h5 className="text-sm font-semibold text-slate-200 mb-2">4 &middot; Will the K-1 tax pay for itself</h5>
              <div className="text-xs text-slate-400 space-y-1">
                <div className="flex justify-between"><span>Taxable share of partnership income</span>
                  <span className="text-slate-200">{formatCurrency(r.k1s.reduce((s, k) => s + k.taxableShare, 0))}</span></div>
                <div className="flex justify-between"><span>Cash actually distributed to you</span>
                  <span className="text-slate-200">{formatCurrency(r.k1s.reduce((s, k) => s + k.cashDistributed, 0))}</span></div>
                <div className="flex justify-between border-t border-slate-700 pt-1">
                  <span className="text-slate-300">Income taxed but not received</span>
                  <span className={r.phantomIncome > 0 ? 'text-amber-300 font-medium' : 'text-emerald-300 font-medium'}>
                    {formatCurrency(r.phantomIncome)}</span></div>
                <p className="text-[11px] text-slate-500 pt-2">
                  A partner is taxed on the distributive share whether or not the cash came out. When this figure
                  is positive, part of the bill has to be funded from somewhere else.
                </p>
              </div>
            </div>
          )}
        </div>
      </HideableBlock>

      <HideableBlock tab="currentyear" id="feedPlan" level={detailLevel}
                     vis={sectionVisibility} setVis={setSectionVisibility}>
        {/* ── Feed it into the long-range plan ───────────────────────────── */}
        <div className={cardStyle}>
          <div className="flex items-start justify-between gap-4 mb-2">
            <div>
              <h4 className="text-lg font-semibold text-slate-100">Use these figures in the 40-year plan</h4>
              <p className="text-sm text-slate-400 mt-1">
                Year one of your long-range projection is normally a synthetic year built from a single
                salary figure. It cannot see a K-1, an itemized deduction, or what you have actually
                withheld. Switching this on replaces that first year with the return above.
              </p>
            </div>
            <label className="flex items-center gap-2 shrink-0 cursor-pointer">
              <input
                type="checkbox"
                checked={!!personalInfo.useDetailedCurrentYear}
                onChange={(e) => setPersonalInfo({ ...personalInfo, useDetailedCurrentYear: e.target.checked })}
                className="w-4 h-4 accent-amber-500"
              />
              <span className="text-sm text-slate-300">Use detailed figures</span>
            </label>
          </div>

          {(() => {
            const yr0 = (projections || [])[0];
            if (!yr0) return null;
            if (!personalInfo.useDetailedCurrentYear) {
              return (
                <p className="text-xs text-slate-500">
                  Currently off. The long-range plan is using its own estimate for {cy.taxYear}.
                </p>
              );
            }
            if (!yr0.detailedCurrentYear) {
              return (
                <div className="text-xs px-3 py-2 rounded bg-amber-900/25 text-amber-300">
                  {yr0.detailedCurrentYearMessage
                    || 'Detailed figures are switched on but were not applied to this year.'}
                  {' '}The plan is using its own estimate for {cy.taxYear} instead.
                </div>
              );
            }
            return (
              <div className="text-xs text-slate-400 space-y-1">
                <div className="flex justify-between">
                  <span>Federal income tax the plan would have assumed</span>
                  <span className="text-slate-300">{formatCurrency(yr0.engineFederalTax)}</span></div>
                <div className="flex justify-between">
                  <span>Federal income tax from the return above</span>
                  <span className="text-slate-100 font-medium">{formatCurrency(yr0.federalTax)}</span></div>
                <div className="flex justify-between border-t border-slate-700 pt-1">
                  <span className="text-slate-300">Difference</span>
                  <span className={yr0.federalTax > yr0.engineFederalTax ? 'text-amber-300 font-medium' : 'text-emerald-300 font-medium'}>
                    {formatCurrency(Math.abs(yr0.federalTax - yr0.engineFederalTax))}
                    {yr0.federalTax > yr0.engineFederalTax ? ' more than it assumed' : ' less than it assumed'}</span></div>
                <p className="text-[11px] text-slate-500 pt-2">
                  Only this first year changes; every later year is still a forecast and is untouched.
                  Social Security and Medicare tax also stay on the plan&rsquo;s own calculation, because the
                  withdrawal engine reads that figure while it works. Monte Carlo, the Social Security
                  grid and the Roth optimizer run their own projections and still use the estimate — for a
                  working year that makes no difference to a balance, since the tax is paid out of salary
                  rather than the portfolio.
                </p>
              </div>
            );
          })()}
        </div>
      </HideableBlock>
    </div>
  );
}


// ── TRADITIONAL OR ROTH, WHILE YOU ARE STILL WORKING ─────────────────────────
// Every other conversion tool here answers a question that only opens at
// retirement. This one is for the years before that, when the decision gets
// made silently by whatever the payroll form was set to and repeats every
// payday. Two halves: the year-by-year rate comparison, which is the rule of
// thumb made explicit, and the whole-plan run, which checks the rule of thumb
// against everything it ignores.
function DeferralDecisionPanel({ personalInfo, accounts, incomeStreams, assets, oneTimeEvents, recurringExpenses }) {
  const { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } = window.Recharts || {};
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('equalTakeHome');

  const result = useMemo(() => {
    if (!open) return null;
    try {
      return deferralDecision({
        pi: personalInfo, accts: accounts, streams: incomeStreams,
        assetList: assets, events: oneTimeEvents, recurring: recurringExpenses,
        currentYear: new Date().getFullYear(),
      }, { mode });
    } catch (e) { return { error: e.message }; }
  }, [open, mode, personalInfo, accounts, incomeStreams, assets, oneTimeEvents, recurringExpenses]);

  const early = useMemo(() => {
    if (!open || !rothConversionIsPlanned(personalInfo)) return null;
    try {
      return convertWhileWorking({
        pi: personalInfo, accts: accounts, streams: incomeStreams,
        assetList: assets, events: oneTimeEvents, recurring: recurringExpenses,
        currentYear: new Date().getFullYear(),
      });
    } catch (e) { return null; }
  }, [open, personalInfo, accounts, incomeStreams, assets, oneTimeEvents, recurringExpenses]);

  const retired = (personalInfo.myAge || 0) >= (personalInfo.myRetirementAge || 65);
  if (retired) return null;

  const pct = (v) => `${(v * 100).toFixed(1)}%`;
  const variantLabel = { current: 'Your current split', allRoth: 'All Roth', allTraditional: 'All traditional' };

  return (
    <div className={cardStyle}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-lg font-semibold text-slate-100">Traditional or Roth, while you are still working</h4>
          <p className="text-sm text-slate-400 mt-1">
            You have {Math.max(0, (personalInfo.myRetirementAge || 65) - (personalInfo.myAge || 0))} working years
            left to make this decision, and it repeats every payday. Defer when the rate you avoid now beats the
            rate you will pay later — both halves shown below, year by year.
          </p>
        </div>
        <button className={buttonSecondary} onClick={() => setOpen(v => !v)}>
          {open ? 'Hide' : 'Run the analysis'}
        </button>
      </div>

      {open && !result && <p className="text-sm text-slate-500 mt-4">Running the plan three ways…</p>}
      {result && result.error && <p className="text-sm text-red-400 mt-4">{result.error}</p>}

      {result && !result.error && result.years.length > 0 && (
        <div className="mt-5 space-y-6">
          {/* ── The chart: the rule of thumb, drawn ─────────────────────── */}
          {ResponsiveContainer && (
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">
                What a deferred dollar saves now, against what it will cost later
              </div>
              <ResponsiveContainer height={230} width="100%">
                <LineChart data={result.years.map(y => ({
                  age: y.age,
                  now: Math.round(y.rateNow * 1000) / 10,
                  later: Math.round(y.rateLater * 1000) / 10,
                }))} margin={{ top: 8, right: 24, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke={THEME.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="age" stroke={THEME.axis} tick={{ fontSize: 11 }}
                         label={{ value: 'Your age', position: 'insideBottom', offset: -2, fill: THEME.inkMuted, fontSize: 11 }} />
                  <YAxis stroke={THEME.axis} tick={{ fontSize: 11 }} unit="%" />
                  <Tooltip contentStyle={{ background: THEME.surface, border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                           formatter={(v, n) => [`${v}%`, n === 'now' ? 'Saved by deferring now' : 'Paid at withdrawal']} />
                  <Legend formatter={(v) => v === 'now' ? 'Saved by deferring now' : 'Paid at withdrawal'}
                          wrapperStyle={{ fontSize: 11 }} />
                  <Line dataKey="now" dot={false} stroke="#f59e0b" strokeWidth={2} type="stepAfter" />
                  <Line dataKey="later" dot={false} stroke="#38bdf8" strokeWidth={2} strokeDasharray="5 4" />
                </LineChart>
              </ResponsiveContainer>
              <p className="text-[11px] text-slate-500 mt-1">
                Amber above blue means traditional; below means Roth. Both lines are the same measurement —
                the ALL-IN cost of a dollar, not just its tax bracket — so they can be compared directly.
                The later figure is the median across your retirement years
                ({pct(result.rateLater.low)}–{pct(result.rateLater.high)} across the whole range), so treat a
                gap of a point or two as a tie.
                {result.rateLaterFromBaseline && (
                  <> It is measured on your plan <em>without</em> conversions on purpose: with them, your pre-tax
                  balance is gone by the mid-60s and the later rate collapses — not because those dollars were
                  cheap, but because the conversion already paid the tax. Comparing a deferral against that
                  number would flatter traditional with a bill you have already booked elsewhere.</>
                )}
              </p>
            </div>
          )}

          {/* ── Why the later rate is not the bracket ───────────────────
              A reader who has just looked at the bracket-fill tables will
              recognise "22%" and not this number. Naming the difference is the
              whole job: the panel used to show the bracket here, against an
              all-in rate on the other side, and reported the gap between two
              different instruments as a reason to defer. */}
          {result.rateLaterDetail && (
            <div className="bg-slate-900/60 border border-slate-700/50 rounded-lg p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-3">
                What the {pct(result.rateLater.rate)} later is made of
              </div>
              <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                {[['Federal bracket', result.rateLaterDetail.components.federal],
                  ['State', result.rateLaterDetail.components.state],
                  ['Social Security dragged into tax', result.rateLaterDetail.components.ssTorpedo],
                  ['Deduction phase-out', result.rateLaterDetail.components.deductionPhaseout]]
                  .filter(([, v]) => Math.abs(v) > 0.0005)
                  .map(([label, v]) => (
                    <div key={label}>
                      <div className="text-xs text-slate-500">{label}</div>
                      <div className="text-slate-200 font-semibold">{pct(v)}</div>
                    </div>
                  ))}
              </div>
              <p className="text-xs text-slate-400 mt-3">
                Your tax-bracket tables show <strong>{pct(result.rateLaterDetail.bracketOnly)}</strong> for these
                years. That is the federal ordinary bracket alone; this is what the dollar actually costs once
                state tax and the other effects are counted. Both are correct — they answer different questions,
                and only the all-in one can be compared against what a deferral saves you today.
              </p>
              {result.rateLaterDetail.cliffYears > 0 && (
                <p className="text-xs text-amber-400/90 mt-2">
                  Separately, in {result.rateLaterDetail.cliffYears} of those years
                  (age {result.rateLaterDetail.cliffAges.slice(0, 6).join(', ')}
                  {result.rateLaterDetail.cliffAges.length > 6 ? '…' : ''}) the next dollar also trips an IRMAA
                  edge. That is a step, not a rate, so it is reported here rather than averaged into the figure
                  above — folding a 500%+ year into a median produces a number describing no year that actually
                  happens.
                </p>
              )}
              <p className="text-xs text-slate-500 mt-2">
                This is also not the same as the "cost per $ converted" in your Roth conversion strategy panel. That is the
                AVERAGE cost of moving a large block through several brackets at once; this is the MARGINAL cost
                of one more dollar. The conversion figure is higher for the same reason a bracket-fill is: it
                includes everything below the top slice.
              </p>
            </div>
          )}

          {/* ── The table ───────────────────────────────────────────────── */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400">
                  <th className="text-left py-1.5 px-2">Age</th>
                  <th className="text-right py-1.5 px-2">Deferring saves</th>
                  <th className="text-right py-1.5 px-2">Withdrawal costs</th>
                  <th className="text-right py-1.5 px-2">Gap</th>
                  <th className="text-left py-1.5 px-2">Points to</th>
                  <th className="text-right py-1.5 px-2">Deferrals that year</th>
                </tr>
              </thead>
              <tbody>
                {result.years.map(y => (
                  <tr key={y.age} className="border-b border-slate-700/50">
                    <td className="py-1.5 px-2 text-slate-100 font-medium">{y.age}</td>
                    <td className="py-1.5 px-2 text-right text-amber-400">{pct(y.rateNow)}</td>
                    <td className="py-1.5 px-2 text-right text-sky-400">{pct(y.rateLater)}</td>
                    <td className={`py-1.5 px-2 text-right ${y.gap > 0 ? 'text-emerald-400' : y.gap < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                      {/* A gap of −0.0001 renders as "-0.0", which reads as a
                          direction the figure does not actually have. */}
                      {Math.abs(y.gap) < 0.0005 ? '0.0' : `${y.gap > 0 ? '+' : ''}${(y.gap * 100).toFixed(1)}`}
                    </td>
                    <td className="py-1.5 px-2">
                      <span style={{ color: y.favors === 'close' ? THEME.inkMuted : treatmentInk(y.favors) }}>
                        {y.favors === 'close' ? 'too close to call' : y.favors}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-right text-slate-400 text-xs">
                      {formatCurrency(y.deferrals.traditional)} pre-tax
                      {y.deferrals.roth > 0 && ` · ${formatCurrency(y.deferrals.roth)} Roth`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── The whole-plan check ────────────────────────────────────── */}
          <div className="bg-slate-900/60 border border-slate-700/50 rounded-lg p-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  And what the whole plan says
                </div>
                <p className="text-xs text-slate-400 mt-1 max-w-xl">
                  The rate rule ignores everything that is not a rate — that Roth balances carry no RMD, feed
                  no Social Security torpedo and pass to heirs untaxed; that a bigger pre-tax balance is a
                  bigger widow's-year problem. Some of that outweighs a few points of rate, so the plan is run
                  all three ways.
                </p>
              </div>
              <select value={mode} onChange={e => setMode(e.target.value)}
                      className="bg-slate-900/80 border border-slate-600/50 rounded px-2 py-1 text-slate-100 text-xs">
                <option value="equalTakeHome">Hold take-home pay equal</option>
                <option value="equalContribution">Hold the contribution equal</option>
              </select>
            </div>

            <table className="w-full text-sm mt-4">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400">
                  <th className="text-left py-1.5">Where future deferrals go</th>
                  <th className="text-right py-1.5">Lifetime tax</th>
                  <th className="text-right py-1.5">After-tax legacy</th>
                </tr>
              </thead>
              <tbody>
                {['current', 'allTraditional', 'allRoth'].map(k => result.variants[k] && (
                  <tr key={k} className={`border-b border-slate-700/50 ${k === result.best ? 'bg-emerald-900/10' : ''}`}>
                    <td className="py-1.5 text-slate-200">
                      {variantLabel[k]}
                      {k === result.best && <span className="text-[10px] text-emerald-400 ml-2">BEST HERE</span>}
                      {result.variants[k].fails && <span className="text-[10px] text-red-400 ml-2">RUNS OUT</span>}
                    </td>
                    <td className="py-1.5 text-right text-slate-300">{formatCurrency(result.variants[k].lifetimeTax)}</td>
                    <td className="py-1.5 text-right font-semibold text-slate-100">{formatCurrency(result.variants[k].afterTaxLegacy)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="text-[11px] text-slate-500 mt-3">{result.neutrality.note}</p>
            {/* What the choice costs the paycheck. A Roth dollar costs a whole
                dollar of spendable pay; a deferred dollar costs less, and the
                gap only counts as an advantage if it is actually invested. The
                equal-contribution run does invest it — in a taxable account,
                where it is taxed as it grows — so showing the three figures
                makes the assumption checkable instead of implicit. */}
            {result.neutrality.mode === 'equalContribution' && result.neutrality.annualDeferral > 0 && (
              <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm border-t border-slate-700/50 pt-3">
                <div>
                  <div className="text-xs text-slate-500">Roth costs you</div>
                  <div className="text-slate-200 font-semibold">
                    {formatCurrency(result.neutrality.outOfPocketRoth)}/yr
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Deferring costs you</div>
                  <div className="text-slate-200 font-semibold">
                    {formatCurrency(result.neutrality.outOfPocketTraditional)}/yr
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Difference, invested taxably</div>
                  <div className="text-emerald-400 font-semibold">
                    {formatCurrency(result.neutrality.sideAccountAnnual)}/yr
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 basis-full">
                  Same {formatCurrency(result.neutrality.annualDeferral)} contribution either way, so the same
                  paycheck is given up either way — but only if the
                  {' '}{formatCurrency(result.neutrality.sideAccountAnnual)} the deduction hands back is actually
                  invested. That is what this run assumes, and it invests it in a taxable account, which pays tax
                  on its dividends every year and capital-gains tax when it is sold. If you would spend that money
                  instead, the honest comparison is the equal-take-home one above, where the Roth contribution is
                  smaller rather than the difference being saved.
                </p>
              </div>
            )}
            {result.anyFails && (
              <p className="text-xs text-amber-400/90 mt-2">
                At least one version of this plan runs out of money, so these are being compared on shortfall
                rather than on legacy. Fix the shortfall first — which bucket you save into is a second-order
                question next to not having enough.
              </p>
            )}
          </div>

          {/* ── Converting before you stop working ──────────────────────── */}
          {early && (
            <div className="bg-slate-900/60 border border-slate-700/50 rounded-lg p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">
                Should you convert before you stop working?
              </div>
              <p className="text-sm text-slate-300">
                Opening your conversion window at {early.startAge} instead of {early.currentStartAge} would convert{' '}
                <strong>{formatCurrency(early.convertedWhileWorking)}</strong> while you are still earning, and{' '}
                {early.helps
                  ? <>leave <strong className="text-emerald-400">{formatCurrency(Math.abs(early.delta))} more</strong> after-tax legacy.</>
                  : <>leave <strong className="text-red-400">{formatCurrency(Math.abs(early.delta))} less</strong>.</>}
              </p>
              <p className="text-xs text-slate-500 mt-2">
                {early.helps
                  ? 'That is the less common answer, and it usually means your pre-tax balance is too large to drain in the bridge years alone — the cheap years run out before the balance does.'
                  : 'The usual answer, and the reason is stacking: a conversion sits on top of your salary, so it is taxed at the top of your working rate instead of filling the empty bracket space a retirement year offers.'}
                {' '}Lifetime tax {early.extraTax >= 0 ? 'rises' : 'falls'} by {formatCurrency(Math.abs(early.extraTax))}.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── WHO PAYS THE CONVERSION TAX ──────────────────────────────────────────────
// The two routes are compared by after-tax legacy in the Roth Roadmap report.
// What that comparison cannot show is the part people actually get wrong: the
// brokerage dollars handed to the IRS are gone at the START of a thirty-year
// projection, so what you gave up is not the tax bill — it is the tax bill plus
// everything it would have compounded into. No break-even formula counts that.
function ConversionFundingPanel({ personalInfo, accounts, incomeStreams, assets, oneTimeEvents, recurringExpenses }) {
  const [open, setOpen] = useState(false);
  const result = useMemo(() => {
    if (!open || !rothConversionIsPlanned(personalInfo)) return null;
    try {
      return conversionFundingCost({
        pi: personalInfo, accts: accounts, streams: incomeStreams,
        assetList: assets, events: oneTimeEvents, recurring: recurringExpenses,
        currentYear: new Date().getFullYear(),
      });
    } catch (e) { return { error: e.message }; }
  }, [open, personalInfo, accounts, incomeStreams, assets, oneTimeEvents, recurringExpenses]);

  if (!rothConversionIsPlanned(personalInfo)) return null;
  const current = personalInfo.rothConversionTaxSource === 'brokerage' ? 'brokerage' : 'withdrawal';

  return (
    <div className={cardStyle}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-lg font-semibold text-slate-100">Who pays the conversion tax</h4>
          <p className="text-sm text-slate-400 mt-1">
            Selling brokerage shares to pay the bill, against letting the withdrawal solver find the money —
            including what the brokerage dollars would have been worth if you had kept them.
          </p>
        </div>
        <button className={buttonSecondary} onClick={() => setOpen(v => !v)}>
          {open ? 'Hide' : 'Run the comparison'}
        </button>
      </div>

      {open && !result && <p className="text-sm text-slate-500 mt-4">Running two full projections…</p>}
      {result && result.error && (
        <p className="text-sm text-red-400 mt-4">Could not run the comparison: {result.error}</p>
      )}

      {result && !result.error && (
        <div className="mt-5 space-y-5">
          {result.degenerate && (
            <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-3 text-sm text-amber-200/90">
              {result.degenerateNote}
            </div>
          )}

          {/* The exact ledger. afterTaxLegacy is roth + brokerage + pre-tax net
              of the heirs' rate, so differencing the two runs bucket by bucket
              reproduces the headline with nothing left over. */}
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">
              Paying from the brokerage, measured against paying from the portfolio
            </div>
            <div className="space-y-1.5">
              {result.ledger.map(l => (
                <div key={l.key} className="flex items-center justify-between bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2">
                  <span className="text-sm text-slate-300">{l.label}</span>
                  <span className={`text-sm font-semibold ${l.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {l.amount >= 0 ? '+' : '−'}{formatCurrency(Math.abs(l.amount))}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-slate-600/50 px-3 pt-2 mt-1">
                <span className="text-sm font-semibold text-slate-200">
                  Net — {result.better === 'brokerage' ? 'paying from the brokerage wins' : 'paying from the portfolio wins'}
                </span>
                <span className={`text-base font-bold ${result.fundingDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatCurrency(Math.abs(result.fundingDelta))}
                </span>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              You are currently set to pay from <strong className="text-slate-300">
              {current === 'brokerage' ? 'the brokerage' : 'the normal withdrawal priority'}</strong>.
              {result.checks[0].ok && ' The three lines above reconcile to the net exactly — this is a decomposition, not an attribution.'}
            </p>
          </div>

          {/* The part the formulas skip. */}
          <div className="bg-slate-900/60 border border-slate-700/50 rounded-lg p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-3">
              The cost of not having those brokerage assets
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <div className="text-xs text-slate-500">Paid to the IRS from taxable</div>
                <div className="text-lg font-semibold text-slate-200">{formatCurrency(result.taxableAccountCost.principal)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Growth it never made</div>
                <div className="text-lg font-semibold text-red-400">{formatCurrency(result.taxableAccountCost.forgoneGrowth)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Would have been worth at {result.taxableAccountCost.horizonAge}</div>
                <div className="text-lg font-bold text-slate-100">{formatCurrency(result.taxableAccountCost.wouldHaveBeenWorth)}</div>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-3">
              Each year's tax payment compounded at your taxable accounts' own {Math.round(result.taxableAccountCost.cagr * 1000) / 10}%
              growth to age {result.taxableAccountCost.horizonAge}. Raising that cash also realized{' '}
              <strong className="text-slate-300">{formatCurrency(result.taxableAccountCost.gainsTaxToRaiseIt)}</strong> of extra
              capital-gains tax along the way — the line people forget, because "cash from the brokerage" sounds free to raise.
            </p>
            {result.taxableAccountCost.absorbed && (
              <p className="text-xs text-amber-400/90 mt-2">
                Note: your taxable account reaches zero under both routes, so its line in the ledger above is $0. That does not
                mean spending it was free — the cost surfaced years earlier as a larger draw on everything else, which is what
                the net figure captures.
              </p>
            )}
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400">
                <th className="text-left py-1.5">Route</th>
                <th className="text-right py-1.5">Converted</th>
                <th className="text-right py-1.5">Lifetime tax</th>
                <th className="text-right py-1.5">Lifetime IRMAA</th>
              </tr>
            </thead>
            <tbody>
              {[['Pay from taxable', result.fromTaxable, 'brokerage'], ['Pay from the portfolio', result.fromPortfolio, 'withdrawal']].map(([label, r, key]) => (
                <tr key={key} className={`border-b border-slate-700/50 ${key === result.better ? 'bg-emerald-900/10' : ''}`}>
                  <td className="py-1.5 text-slate-200">
                    {label}
                    {key === current && <span className="text-[10px] text-amber-400 ml-2">YOUR SETTING</span>}
                  </td>
                  <td className="py-1.5 text-right text-slate-300">{formatCurrency(r.lifetimeConversions)}</td>
                  <td className="py-1.5 text-right text-slate-300">{formatCurrency(r.lifetimeTax)}</td>
                  <td className="py-1.5 text-right text-slate-300">{formatCurrency(r.lifetimeIRMAA)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TaxPlanningTab({ accounts, assets, computeProjections, detailLevel, incomeStreams, oneTimeEvents, personalInfo, projections, recurringExpenses, sectionVisibility, setPersonalInfo, setSectionVisibility }) {
  // What the charitable giving actually saves, measured by running the plan with
  // and without the QCD exclusion. Two projections, computed once here and shared
  // with the snapshot below rather than estimated separately in each place.
  const qcdSavings = useMemo(() => qcdTaxSavings({
    pi: personalInfo, accts: accounts, streams: incomeStreams, assetList: assets,
    events: oneTimeEvents, recurring: recurringExpenses,
    currentYear: new Date().getFullYear(),
  }), [personalInfo, accounts, incomeStreams, assets, oneTimeEvents, recurringExpenses]);
  // The same bag the Dashboard panels take, so a panel does not care which tab
  // it is rendered on.
  const taxPanelCtx = useMemo(() => buildPanelCtx({
    projections, personalInfo, accounts, assets, incomeStreams,
    oneTimeEvents, recurringExpenses, computeProjections,
    retirementAge: personalInfo.myRetirementAge,
  }), [projections, personalInfo, accounts, assets, incomeStreams, oneTimeEvents,
       recurringExpenses, computeProjections]);

  const [ageRange, setAgeRange] = useState({ start: personalInfo.myAge, end: personalInfo.legacyAge || 95 });
  const [openInfoCard, setOpenInfoCard] = useState(null);
  const toggleInfoCard = useCallback((id) => {
    setOpenInfoCard(prev => prev === id ? null : id);
  }, []);
  
  // Retirement age: always use personalInfo as source of truth
  const retirementAge = personalInfo.myRetirementAge;
  const retirementProjection = projections.find(p => p.myAge === retirementAge);
  
  // Calculate inflation-adjusted bracket thresholds for each year
  const taxPlanningData = useMemo(
    () => buildTaxPlanningRows(projections, personalInfo, ageRange),
    [projections, personalInfo, ageRange]);
  const currentYearData = taxPlanningData.find(d => d.myAge === personalInfo.myAge);
  const retirementYearData = taxPlanningData.find(d => d.myAge === retirementAge);
  
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-slate-100 mb-2">Taxes &amp; Roth Conversions</h3>
        <p className="text-slate-400 text-sm">Set your conversion strategy and see what it does, let the optimizer search for a better one, then check the years with room in the lower brackets. Everything Roth lives on this tab.</p>
      </div>

      <SectionControls tab="taxplanning" vis={sectionVisibility} setVis={setSectionVisibility}
                       level={detailLevel} />
      <BasisNote pi={personalInfo} reason={
        'Every figure here is compared against a tax threshold — bracket edges, the standard deduction, ' +
        'IRMAA tiers — and those are nominal amounts the IRS indexes year by year. Restating the income ' +
        'and not the threshold would be wrong; restating both would relabel the 22% bracket as something ' +
        'it is not.'} />

      {/* The strategy leads the tab, and cannot be hidden: it is the control
          the rest of the tab describes the consequences of — the same rule
          that keeps the +Add buttons out of every hideable section. It used to
          sit at the very bottom, below eleven sections, with a second copy of
          its fields on Personal Info. */}
      <RothConversionSimulator
        projections={projections}
        personalInfo={personalInfo}
        accounts={accounts}
        incomeStreams={incomeStreams}
        assets={assets}
        oneTimeEvents={oneTimeEvents}
        recurringExpenses={recurringExpenses}
        retirementAge={retirementAge}
        computeProjections={computeProjections}
        setPersonalInfo={setPersonalInfo}
      />

      {/* The optimizer's Apply writes the plan, and the strategy above follows
          it — so the search sits directly under the thing it changes. */}
      {/* Roth Conversion Optimizer — goal-based strategy sweep (worker) */}
      <HideableBlock tab="taxplanning" id="optimizer" level={detailLevel}
                     vis={sectionVisibility} setVis={setSectionVisibility}>
        <RothConversionOptimizer
          personalInfo={personalInfo}
          accounts={accounts}
          incomeStreams={incomeStreams}
          assets={assets}
          oneTimeEvents={oneTimeEvents}
          recurringExpenses={recurringExpenses}
          setPersonalInfo={setPersonalInfo}
        />
      </HideableBlock>

      {/* Summary Cards */}
      <HideableBlock tab="taxplanning" id="bracketSummary" level={detailLevel}
                     vis={sectionVisibility} setVis={setSectionVisibility}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className={cardStyle}>
            <div className="text-slate-400 text-sm mb-1">Current Tax Bracket</div>
            <div className="text-2xl font-bold text-amber-400">{currentYearData?.currentBracket || 'N/A'}</div>
            <div className="text-slate-500 text-xs mt-1">Age {personalInfo.myAge}</div>
          </div>
          <div className={cardStyle}>
            <div className="text-slate-400 text-sm mb-1">Room to Fill 22% Bracket</div>
            <div className="text-2xl font-bold text-emerald-400">{formatCurrency(currentYearData?.roomTo22 || 0)}</div>
            <div className="text-slate-500 text-xs mt-1">Potential Roth conversion space this year</div>
          </div>
          <div className={cardStyle}>
            <div className="text-slate-400 text-sm mb-1">At Retirement (Age {retirementAge})</div>
            <div className="text-2xl font-bold text-sky-400">{retirementYearData?.currentBracket || 'N/A'} bracket</div>
            <div className="text-slate-500 text-xs mt-1">Room to 22%: {formatCurrency(retirementYearData?.roomTo22 || 0)}</div>
          </div>
        </div>
      </HideableBlock>
      
      {/* Chart */}
      <HideableBlock tab="taxplanning" id="bracketChart" level={detailLevel}
                     vis={sectionVisibility} setVis={setSectionVisibility}>
        <div className={cardStyle}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h4 className="text-lg font-semibold text-slate-100">Income vs. Tax Bracket Thresholds</h4>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-400">Age:</span>
              <input
                type="number"
                value={ageRange.start}
                onChange={e => setAgeRange(prev => ({ ...prev, start: Math.max(personalInfo.myAge, Number(e.target.value)) }))}
                className="w-16 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-100 text-center"
              />
              <span className="text-slate-500">to</span>
              <input
                type="number"
                value={ageRange.end}
                onChange={e => setAgeRange(prev => ({ ...prev, end: Math.min(personalInfo.legacyAge || 95, Number(e.target.value)) }))}
                className="w-16 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-100 text-center"
              />
              <div className="flex gap-1 ml-2">
                <button 
                  onClick={() => setAgeRange({ start: retirementAge, end: Math.min(retirementAge + 15, personalInfo.legacyAge || 95) })}
                  className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-300"
                >
                  Early Retirement
                </button>
                <button 
                  onClick={() => setAgeRange({ start: personalInfo.myAge, end: personalInfo.legacyAge || 95 })}
                  className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-300"
                >
                  All Years
                </button>
              </div>
            </div>
          </div>
          <div style={chartBox(384)}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={taxPlanningData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={THEME.grid} />
                <XAxis dataKey="myAge" stroke={THEME.axis} tick={{ fill: THEME.axis }} />
                <YAxis stroke={THEME.axis} tick={{ fill: THEME.axis }} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: THEME.surfaceRaised, border: `1px solid ${THEME.grid}`, borderRadius: '8px' }} 
                  formatter={(v, name) => [formatCurrency(v), name]}
                  labelFormatter={l => `Age ${l}`}
                />
                <Legend formatter={legendInk} />
              
                {/* Stacked income bars */}
                <Bar dataKey="earnedIncome" stackId="income" fill={SERIES.earnedIncome} name="Earned Income" />
                <Bar dataKey="socialSecurity" stackId="income" fill={SERIES.socialSecurity} name="Social Security (85%)" />
                <Bar dataKey="pension" stackId="income" fill={SERIES.pension} name="Pension" />
                <Bar dataKey="otherIncome" stackId="income" fill={SERIES.otherIncome} name="Other Income" />
                <Bar dataKey="voluntaryWithdrawal" stackId="income" fill={SERIES.withdrawalVoluntary} name="Portfolio Withdrawal (voluntary)" />
                <Bar dataKey="rmd" stackId="income" fill={SERIES.rmd} name="RMD (mandatory)" />
                <Bar dataKey="plannedConversion" stackId="income" fill={SERIES.rothConversion} name="Planned Roth Conv." />
                <Bar dataKey="conversionTaxWithdrawal" stackId="income" fill={SERIES.conversionTaxDraw} name="Conversion Tax Draw" />
              
                {/* Tax bracket threshold lines */}
                {(() => {
                  const iLast = (taxPlanningData || []).length - 1;
                  return [
                    { key: 'bracket12', pct: '12%', slot: 0, dash: '2 4' },
                    { key: 'bracket22', pct: '22%', slot: 1, dash: '7 4' },
                    { key: 'bracket24', pct: '24%', slot: 2, dash: '14 4' },
                    { key: 'bracket32', pct: '32%', slot: 3, dash: '22 4' },
                  ].map(b => (
                    <Line
                      key={b.key} type="monotone" dataKey={b.key}
                      stroke={THEME.bracket[b.slot]} strokeWidth={2} dot={false}
                      name={`Top of ${b.pct} Bracket`} strokeDasharray={b.dash}
                      label={lastPointLabel(b.pct, THEME.inkSecondary, iLast)}
                    />
                  ));
                })()}
              
                {/* Retirement reference line */}
                <ReferenceLine x={retirementAge} stroke={THEME.bracket[3]} strokeDasharray="3 3" label={{ value: 'Retirement', position: 'top', fill: THEME.bracket[3], fontSize: 12 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            * Bracket thresholds shown are gross income levels (before standard deduction). The gap between your income bars and the bracket lines represents potential Roth conversion space.
          </p>
        </div>
      </HideableBlock>
      
      {/* Detailed Table */}
      <Section
        tab="taxplanning" id="conversionYears" level={detailLevel}
        vis={sectionVisibility} setVis={setSectionVisibility}
        title="Roth Conversion Opportunity by Year"
      >
        <ConversionOpportunityPanel ctx={taxPanelCtx} />
      </Section>

      {/* Moved here from the Dashboard in v1.92.0. It answers "what should I
          do", not "am I okay" — its own help text already pointed readers to
          this tab for the matching bracket analysis, and this tab already
          computes the IRMAA figures per year. On the dashboard it was also
          sharing another section's visibility toggle; here it owns one. */}
      <Section
        tab="taxplanning" id="marginalIrmaa" level={detailLevel}
        vis={sectionVisibility} setVis={setSectionVisibility}
        title="Marginal Tax Impact & IRMAA"
      >
        <MarginalIrmaaPanel ctx={taxPanelCtx} />
      </Section>

      {/* ACA subsidy impact of Roth conversions (pre-65, ACA coverage mode).
          Near the 400% FPL cliff a conversion dollar costs marginal tax PLUS
          lost premium credit — this table makes that second cost visible. */}
      {personalInfo.pre65Coverage === 'aca' && (() => {
        const acaConvYears = projections.filter(p => (p.rothConversion || 0) > 0 && (p.acaGrossPremium || 0) > 0);
        if (acaConvYears.length === 0) return null;
        const rows = acaConvYears.map(p => {
          const acaMagi = (p.taxableIncome || 0) + Math.max(0, (p.socialSecurity || 0) - (p.taxableSS || 0));
          const householdSize = p.filingStatus === 'married_joint' ? 2 : 1;
          const without = calculateACAPremiumCredit({
            magi: Math.max(0, acaMagi - p.rothConversion),
            householdSize,
            benchmarkPremium: p.acaGrossPremium,
            // FPL indexes from BASE_TAX_YEAR, matching how the engine calls this.
            yearsFromNow: p.year - BASE_TAX_YEAR,
            inflationRate: personalInfo.inflationRate,
          });
          const subsidyLost = Math.max(0, Math.round(without.subsidy - (p.acaSubsidy || 0)));
          const crossesCliff = (p.acaSubsidy || 0) === 0 && without.subsidy > 0;
          return { age: p.myAge, conversion: p.rothConversion, fplPercent: p.acaFplPercent, subsidyKept: p.acaSubsidy || 0, subsidyLost, crossesCliff };
        });
        const totalLost = rows.reduce((s, r) => s + r.subsidyLost, 0);
        return (
          <Section
            tab="taxplanning" id="acaSubsidy" level={detailLevel}
            vis={sectionVisibility} setVis={setSectionVisibility}
            title="Roth Conversions vs. ACA Subsidy"
          >
            <p className="text-xs text-slate-400 mb-3">
              Conversions raise MAGI, which shrinks your marketplace premium credit — and above 400% of the poverty
              level the credit vanishes entirely (the 2026 cliff). Near the cliff, a conversion dollar costs its
              marginal tax rate <em>plus</em> lost subsidy.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-700">
                    <th className="py-2 pr-3">Age</th>
                    <th className="py-2 pr-3">Conversion</th>
                    <th className="py-2 pr-3">% of FPL</th>
                    <th className="py-2 pr-3">Subsidy Kept</th>
                    <th className="py-2 pr-3">Subsidy Lost to Conversion</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.age} className={`border-b border-slate-800 ${r.crossesCliff ? 'bg-red-900/20' : ''}`}>
                      <td className="py-2 pr-3 text-slate-300">{r.age}</td>
                      <td className="py-2 pr-3 text-slate-300">{formatCurrency(r.conversion)}</td>
                      <td className="py-2 pr-3 text-slate-300">{r.fplPercent !== null ? `${r.fplPercent}%` : '—'}</td>
                      <td className="py-2 pr-3 text-emerald-400">{formatCurrency(r.subsidyKept)}</td>
                      <td className={`py-2 pr-3 ${r.subsidyLost > 0 ? 'text-red-400' : 'text-slate-500'}`}>
                        {formatCurrency(r.subsidyLost)}{r.crossesCliff ? ' ⚠ crosses the 400% cliff' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalLost > 0 && (
              <p className="text-xs text-red-400/90 mt-2">
                Your planned conversions forfeit {formatCurrency(totalLost)} of premium credits across these years.
                Consider smaller conversions in pre-65 years (staying under the cliff) and larger ones from 65 on,
                when IRMAA — not the ACA — becomes the constraint.
              </p>
            )}
          </Section>
        );
      })()}

      {/* Income thresholds table */}
      <HideableBlock tab="taxplanning" id="breakpoints" level={detailLevel}
                     vis={sectionVisibility} setVis={setSectionVisibility}>
        <TaxBreakpointsTable projections={projections} personalInfo={personalInfo} />
      </HideableBlock>

      {qcdSavings && qcdSavings.totalQcd > 0 && (
        <Section
          tab="taxplanning" id="charitable" level={detailLevel}
          vis={sectionVisibility} setVis={setSectionVisibility}
          title="What Your Charitable Giving Saves"
        >
          <CharitableGivingPanel ctx={taxPanelCtx} />
        </Section>
      )}

      <HideableBlock tab="taxplanning" id="yearSnapshot" level={detailLevel}
                     vis={sectionVisibility} setVis={setSectionVisibility}>
        <TaxYearSnapshot
          projections={projections}
          personalInfo={personalInfo}
          qcdSavings={qcdSavings}
        />
      </HideableBlock>
      

      {/* The accumulation-years decision, ahead of the retirement-years ones. */}
      <HideableBlock tab="taxplanning" id="deferralDecision" level={detailLevel}
                     vis={sectionVisibility} setVis={setSectionVisibility}>
        <DeferralDecisionPanel
          accounts={accounts}
          assets={assets}
          incomeStreams={incomeStreams}
          oneTimeEvents={oneTimeEvents}
          personalInfo={personalInfo}
          recurringExpenses={recurringExpenses}
        />
      </HideableBlock>

      {/* Who pays the conversion tax — and what the taxable dollars cost. */}
      <HideableBlock tab="taxplanning" id="conversionFunding" level={detailLevel}
                     vis={sectionVisibility} setVis={setSectionVisibility}>
        <ConversionFundingPanel
          accounts={accounts}
          assets={assets}
          incomeStreams={incomeStreams}
          oneTimeEvents={oneTimeEvents}
          personalInfo={personalInfo}
          recurringExpenses={recurringExpenses}
        />
      </HideableBlock>

    </div>
  );
}

