// ── WILL IT LAST? ────────────────────────────────────────────────────────────
// Monte Carlo, the Stress Test and Sensitivity were three nav entries until
// v2.49.0. They are three ways of asking one question — does the plan survive
// things going differently from the average? — and a reader choosing between
// "Monte Carlo" and "Stress Test" in a sidebar was being asked to know the
// techniques before the question. One tab now, with the question on top and
// each method named by what it tests. The three pages themselves are
// unchanged: same components, same engine calls, same sections.
const LASTING_VIEWS = [
  // "Thousands of markets", not "random": the Monte Carlo page can replay
  // history as well as sample it, and a label saying random beside one saying
  // historical would have put the difference in the wrong place.
  { id: 'montecarlo',  label: 'Thousands of markets', method: 'Monte Carlo',
    q: 'How often does the plan survive 1,000 markets — sampled, or replayed from history?' },
  { id: 'stresstest',  label: 'Specific crashes',     method: 'Stress test',
    q: 'Does it survive named crashes — 2008, the dot-com bust, stagflation — right at retirement?' },
  { id: 'sensitivity', label: 'What matters most',  method: 'Sensitivity',
    q: 'Which single assumption moves the outcome most?' },
];

function WillItLastTab({ view, setView, children }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-slate-100 mb-2">Will it last?</h3>
        <p className="text-slate-400 text-sm">
          Your plan assumes average returns every year. These three test what happens when they are not.
        </p>
      </div>
      <div role="tablist" aria-label="Ways to test the plan" className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {LASTING_VIEWS.map(v => {
          const on = view === v.id;
          return (
            <button key={v.id} role="tab" aria-selected={on} onClick={() => setView(v.id)}
              className={`text-left rounded-xl border px-4 py-3 transition-colors ${on
                ? 'bg-amber-500/10 border-amber-500/50'
                : 'bg-slate-800/40 border-slate-700 hover:border-slate-500'}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className={`font-semibold ${on ? 'text-amber-300' : 'text-slate-200'}`}>{v.label}</span>
                <span className="text-[11px] text-slate-500 whitespace-nowrap">{v.method}</span>
              </div>
              <div className="text-xs text-slate-400 mt-1 leading-snug">{v.q}</div>
            </button>
          );
        })}
      </div>
      <div role="tabpanel">{children}</div>
    </div>
  );
}

// ============================================
// MonteCarloTab — Lifted to module scope
// ============================================
function MonteCarloTab({ accounts, assets, currentYearReturn, detailLevel, incomeStreams, oneTimeEvents, personalInfo, projections, recurringExpenses, sectionVisibility, setSectionVisibility }) {
  // Retirement age: always use personalInfo as source of truth
  const retirementProjection = projections.find(p => p.myAge === personalInfo.myRetirementAge);
  const defaultRetirementAge = personalInfo.myRetirementAge;
  
  const [simSettings, setSimSettings] = useState({
    numSimulations: 1000,
    startAge: defaultRetirementAge,
    // 'perAccount': each account is simulated around its OWN CAGR with the
    // volatility that CAGR implies, all moved by one market shock a year.
    // 'portfolio': one mean and one volatility for every account (the original).
    returnModel: 'perAccount',
    meanReturn: 0.07,
    stdDev: 0.15,   // portfolio model: every account's volatility; per-account model: the stock fund's
    inflationMean: 0.03,
    inflationStdDev: 0.01,
    method: 'random',     // 'random' or 'historical'
    assetMix: 0.7,        // For historical mode: 0.7 = 70% stocks / 30% bonds
    historicalStartYear: 'all',  // 'all' = run every valid start year (and resample), or a specific year
    // Dynamic spending guardrails (Guyton-Klinger style): when the prior year's
    // withdrawal rate drifts outside the anchor rate ± band, real spending is
    // cut/raised by adjustPct (persistently). Turns MC pass/fail into "what
    // spending flexibility keeps this plan alive."
    guardrails: { enabled: false, bandPct: 0.20, adjustPct: 0.10 },
    longevity: { enabled: false },
    ltc: { enabled: false },
  });
  const [simResults, setSimResults] = useState(null);
  // Nominal vs today's dollars. Each sim draws its own inflation path, so pooled
  // nominal percentiles mix currencies; the worker also returns each sim deflated
  // by its own path. Default to today's dollars — it is the figure users can judge.
  // Its own toggle rather than the global one, and deliberately: each simulation
  // draws its OWN inflation path, so these percentiles are deflated per sim
  // rather than by the plan's single assumption. It starts wherever the app is
  // set so the two agree by default, and can still be flipped here.
  const [showRealDollars, setShowRealDollars] = useState(personalInfo.displayBasis !== 'nominal');
  const [simError, setSimError] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  
  const endAge = personalInfo.legacyAge || 95;
  const yearsToSimulate = endAge - simSettings.startAge + 1;
  
  // Get projected portfolio balance at simulation start age
  const startProjection = projections.find(p => p.myAge === simSettings.startAge);
  const startingPortfolio = startProjection?.totalPortfolio || 0;

  // ── The two things that made the median look broken ──────────────────────
  //
  // 1. UNITS. simSettings.meanReturn is the arithmetic mean of the yearly draws.
  //    Account cagr is a geometric mean — what the money compounds at. For a
  //    lognormal-ish process geometric ≈ arithmetic − σ²/2, so 7% mean with 15%
  //    volatility compounds at ~5.9%. Both fields default to 7% and read as the
  //    same quantity, so the simulation ran a materially poorer plan than the
  //    plan, and the median came in low for a reason that had nothing to do with
  //    market risk. Measured on a synthetic 45-year plan: median $23.2M against
  //    a deterministic $28.1M, and the gap closes when the means are reconciled.
  //
  // 2. BASIS. The percentiles default to today's dollars — correct, because each
  //    sim draws its own inflation path and pooling nominal results mixes
  //    currencies. But every other figure in the app is nominal, so comparing
  //    them makes even the 95th percentile look worse than the straight-line
  //    run. deterministicEnd is the plan's own ending portfolio put on WHICHEVER
  //    basis is currently on screen, so the comparison is like for like.
  const impliedCagr = simSettings.meanReturn - (simSettings.stdDev * simSettings.stdDev) / 2;
  const perAccountModel = simSettings.returnModel === 'perAccount';
  // The same helper the worker draws from, so the table shows exactly what
  // each account is simulated as.
  const acctModel = perAccountModel ? accountReturnModel(accounts || [], { stockVol: simSettings.stdDev }) : null;
  // Balance-weighted, because a 4% brokerage next to a 7% 401(k) is not a 5.5%
  // plan — it is a 7% plan with a rounding error attached.
  const planCagr = (() => {
    let bal = 0, weighted = 0;
    (accounts || []).forEach(a => {
      const b = Math.max(0, a.balance || 0);
      bal += b; weighted += b * (a.cagr || 0);
    });
    return bal > 0 ? weighted / bal : null;
  })();
  const deterministicEnd = (() => {
    const last = projections.find(p => p.myAge === endAge) || projections[projections.length - 1];
    if (!last) return null;
    const nominal = last.totalPortfolio || 0;
    if (!(showRealDollars && simResults && simResults.real)) return nominal;
    // Deflate by the PLAN's own inflation assumption over the same span the
    // simulations cover, which is what the sims' own deflators average to.
    const years = Math.max(0, (last.myAge || 0) - (personalInfo.myAge || 0));
    return nominal / Math.pow(1 + (personalInfo.inflationRate || 0.03), years);
  })();
  
  const [simProgress, setSimProgress] = useState(0);
  
  const activeJobRef = useRef(null);

  // R6: cancel any in-flight worker job on unmount so we don't leak the worker
  // across remount cycles.
  useEffect(() => {
    return () => {
      if (activeJobRef.current && window.PlannerWorker) {
        window.PlannerWorker.cancel();
        activeJobRef.current = null;
      }
    };
  }, []);

  const runSimulation = () => {
    if (!window.PlannerWorker) {
      setSimError('Worker not available — reload the page.');
      return;
    }
    setIsRunning(true);
    setSimProgress(0);
    setSimResults(null);
    setSimError(null);
    const handle = window.PlannerWorker.run({
      type: 'monteCarlo',
      payload: { simSettings, personalInfo, accounts, incomeStreams, assets, oneTimeEvents, recurringExpenses, currentYearReturn },
      onProgress: (pct) => setSimProgress(pct),
    });
    activeJobRef.current = handle;
    handle.promise
      .then((result) => {
        if (activeJobRef.current !== handle) return;  // superseded by another run
        activeJobRef.current = null;
        setSimResults(result);
        setIsRunning(false);
      })
      .catch((err) => {
        if (activeJobRef.current !== handle) return;
        activeJobRef.current = null;
        setIsRunning(false);
        if (err.message !== 'Cancelled') setSimError(err.message);
      });
  };

  const cancelSimulation = () => {
    if (!window.PlannerWorker) return;
    window.PlannerWorker.cancel();
    activeJobRef.current = null;
    setIsRunning(false);
    setSimProgress(0);
  };

  
  const getSuccessColor = (rate) => {
    if (rate >= 0.9) return 'text-emerald-400';
    if (rate >= 0.75) return 'text-green-400';
    if (rate >= 0.5) return 'text-yellow-400';
    return 'text-red-400';
  };
  
  const getSuccessLabel = (rate) => {
    if (rate >= 0.9) return 'Excellent';
    if (rate >= 0.75) return 'Good';
    if (rate >= 0.5) return 'Fair';
    return 'At Risk';
  };
  
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-slate-100 mb-2">Monte Carlo Simulation</h3>
        <p className="text-slate-400 text-sm">Stress-test your retirement plan against thousands of randomized market scenarios based on historical volatility patterns.</p>
      </div>

      <BasisNote pi={personalInfo} reason={
        'This tab has its own switch, just below, because each simulation draws its OWN inflation path — ' +
        'deflating these percentiles by the plan\u2019s single assumption would be less accurate, not more. ' +
        'It starts where you set the app.'} />
      <SectionControls tab="montecarlo" vis={sectionVisibility} setVis={setSectionVisibility} level={detailLevel} />
      
      {/* Method Selector */}
      <Section tab="montecarlo" id="method" title={"Simulation Method"} vis={sectionVisibility} level={detailLevel} setVis={setSectionVisibility}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            onClick={() => setSimSettings({...simSettings, method: 'random'})}
            className={`p-4 rounded-lg border text-left transition-all ${
              simSettings.method === 'random' 
                ? 'border-amber-500 bg-amber-500/10' 
                : 'border-slate-700 bg-slate-900 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">🎲</span>
              <span className="text-base font-semibold text-slate-100">Random Sampling</span>
            </div>
            <p className="text-xs text-slate-400">
              Each year's return is drawn independently from a normal distribution with your chosen mean and volatility. Mathematically clean. Doesn't model the correlation between bad-return years and high-inflation years that history actually shows.
            </p>
          </button>
          <button
            onClick={() => setSimSettings({...simSettings, method: 'historical'})}
            className={`p-4 rounded-lg border text-left transition-all ${
              simSettings.method === 'historical' 
                ? 'border-amber-500 bg-amber-500/10' 
                : 'border-slate-700 bg-slate-900 hover:border-slate-600'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">📜</span>
              <span className="text-base font-semibold text-slate-100">Historical Sequences</span>
            </div>
            <p className="text-xs text-slate-400">
              Replays actual market history (Shiller dataset, 1928-2024). Each simulation starts in a different real year (1929, 1966, 2000…). Captures the real correlations between stocks, bonds, and inflation. The most credible answer to "would my plan survive a real bad sequence?"
            </p>
          </button>
        </div>
        
        {simSettings.method === 'historical' && (
          <p className="mt-3 text-xs text-slate-400 leading-relaxed bg-sky-500/5 border border-sky-500/20 rounded-lg p-3">
            Historical replay uses the actual stock, bond and inflation figures for each year, so
            your Expected Return, Volatility and Inflation settings above do <span className="text-slate-200">not</span> apply here
            (with the per-account model, each account still replays the stock/bond blend its CAGR implies).
            That usually makes it look kinder than random mode: a 70/30 blend starting in 1966 —
            through stagflation and two crashes — still averaged about 5% a year after inflation,
            because the sequence runs into the 1980s and 90s. Random mode uses whatever real return
            your settings imply, which at the defaults is nearer 3%. Read the two as different
            questions, not as a second opinion on the same one.
          </p>
        )}
        {simSettings.method === 'historical' && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-900/50 rounded-lg border border-slate-700">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Stock / Bond Mix</label>
              {perAccountModel ? (
                <p className="text-xs text-slate-400 bg-slate-800 border border-slate-700 rounded px-3 py-2">
                  Set per account: each replays the stock/bond blend its CAGR implies (see the table above).
                </p>
              ) : (
              <select
                value={simSettings.assetMix}
                onChange={e => setSimSettings({...simSettings, assetMix: Number(e.target.value)})}
                className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-slate-100"
              >
                <option value={1.0}>100% Stocks</option>
                <option value={0.9}>90 / 10</option>
                <option value={0.8}>80 / 20</option>
                <option value={0.7}>70 / 30 (default)</option>
                <option value={0.6}>60 / 40</option>
                <option value={0.5}>50 / 50</option>
                <option value={0.4}>40 / 60</option>
                <option value={0.3}>30 / 70 (conservative)</option>
              </select>
              )}
              {!perAccountModel && <p className="text-xs text-slate-500 mt-1">Asset allocation for the historical replay.</p>}
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Starting Year</label>
              <select
                value={simSettings.historicalStartYear}
                onChange={e => setSimSettings({...simSettings, historicalStartYear: e.target.value})}
                className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-slate-100"
              >
                <option value="all">All valid years (rotate through {getValidStartYears(yearsToSimulate).length})</option>
                {getValidStartYears(yearsToSimulate).map(y => (
                  <option key={y} value={y}>{y} (run all sims as if retired in {y})</option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">Pick "all" for a true historical-success-rate, or one year for a "what if I retired in X" analysis.</p>
            </div>
            <div className="flex items-end">
              <div className="text-xs text-slate-400 leading-relaxed">
                <strong className="text-slate-300">Coverage:</strong> {HISTORICAL_RETURNS[0].year}–{HISTORICAL_RETURNS[HISTORICAL_RETURNS.length - 1].year} ({HISTORICAL_RETURNS.length} years).
                <br />
                {getValidStartYears(yearsToSimulate).length} complete {yearsToSimulate}-year sequences available.
              </div>
            </div>
          </div>
        )}
      </Section>
      
      {/* Settings */}
      <Section tab="montecarlo" id="parameters" title={"Simulation Parameters"} vis={sectionVisibility} level={detailLevel} setVis={setSectionVisibility}>
        
        {/* Starting Point */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 pb-4 border-b border-slate-700">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Start Simulation at Age</label>
            <input 
              type="number" 
              value={simSettings.startAge} 
              onChange={e => setSimSettings({...simSettings, startAge: Math.max(personalInfo.myAge, Math.min(90, Number(e.target.value)))})}
              className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-slate-100"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Projected Portfolio at Start</label>
            <div className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-emerald-400 font-semibold">
              {formatCurrency(startingPortfolio)}
            </div>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Years to Simulate</label>
            <div className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-slate-300">
              {yearsToSimulate} years (to age {endAge})
            </div>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Quick Select</label>
            <div className="flex gap-2">
              <button 
                onClick={() => setSimSettings({...simSettings, startAge: defaultRetirementAge})}
                className="flex-1 px-2 py-2 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-300"
              >
                At Retirement ({defaultRetirementAge})
              </button>
              <button 
                onClick={() => setSimSettings({...simSettings, startAge: personalInfo.myAge})}
                className="flex-1 px-2 py-2 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-300"
              >
                From Today ({personalInfo.myAge})
              </button>
            </div>
          </div>
        </div>
        
        {/* Return model */}
        <div className="mb-4">
          <label className="block text-sm text-slate-400 mb-2">How each account is simulated</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              onClick={() => setSimSettings({ ...simSettings, returnModel: 'perAccount' })}
              className={`p-3 rounded-lg border text-left transition-all ${perAccountModel ? 'border-amber-500 bg-amber-500/10' : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'}`}
            >
              <div className="font-medium text-slate-100 text-sm">Each account at its own rate <span className="text-xs text-amber-400 ml-1">recommended</span></div>
              <p className="text-xs text-slate-400 mt-1">
                Every account is centred on the CAGR you gave it, with the volatility that rate implies
                on a stock/bond line, and one market shock a year moves them all together. A bond-heavy
                brokerage stays bond-heavy; the median agrees with the plan by construction.
              </p>
            </button>
            <button
              onClick={() => setSimSettings({ ...simSettings, returnModel: 'portfolio' })}
              className={`p-3 rounded-lg border text-left transition-all ${!perAccountModel ? 'border-amber-500 bg-amber-500/10' : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'}`}
            >
              <div className="font-medium text-slate-100 text-sm">One return for every account</div>
              <p className="text-xs text-slate-400 mt-1">
                A single mean and volatility applied to every account alike; your account CAGRs are
                ignored in the simulated years. Simpler, and the right choice when you want to test
                a return assumption that differs from the plan's.
              </p>
            </button>
          </div>
        </div>

        {/* Market Parameters */}
        <div className={`grid grid-cols-2 md:grid-cols-5 gap-4 mb-4 ${simSettings.method === 'historical' ? 'opacity-50 pointer-events-none' : ''}`}>
          {simSettings.method === 'historical' && (
            <div className="col-span-2 md:col-span-5 text-xs text-amber-300 -mb-2">
              ⓘ Random-mode parameters below are disabled. Historical mode uses real return sequences instead.
            </div>
          )}
          <div>
            <label className="block text-sm text-slate-400 mb-1"># Simulations</label>
            <select 
              value={simSettings.numSimulations} 
              onChange={e => setSimSettings({...simSettings, numSimulations: Number(e.target.value)})}
              className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-slate-100"
            >
              <option value={500}>500</option>
              <option value={1000}>1,000</option>
              <option value={2500}>2,500</option>
              <option value={5000}>5,000</option>
            </select>
          </div>
          {!perAccountModel && (
          <div>
            <label className="block text-sm text-slate-400 mb-1">Mean Return (%)</label>
            <input 
              type="number" 
              step="0.5"
              value={(simSettings.meanReturn * 100).toFixed(1)} 
              onChange={e => setSimSettings({...simSettings, meanReturn: Number(e.target.value) / 100})}
              className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-slate-100"
            />
            {/* The single most misleading number on this tab, until now. This
                field is an ARITHMETIC mean — the average of the yearly draws.
                Your accounts are set with a CAGR, which is a GEOMETRIC mean —
                what the money actually compounds at. Volatility drives a wedge
                between them of roughly sigma-squared over two, so 7% here with
                15% volatility compounds at about 5.9%, and the simulation was
                quietly modelling a lower-growth plan than the plan itself. */}
            <div className="text-[11px] text-slate-500 mt-1 leading-snug">
              compounds at ≈<span className="text-amber-400 font-semibold">{(impliedCagr * 100).toFixed(1)}%</span>/yr
              {planCagr !== null && (
                <> · your accounts say <span className="text-slate-300">{(planCagr * 100).toFixed(1)}%</span></>
              )}
            </div>
            {planCagr !== null && Math.abs(impliedCagr - planCagr) > 0.002 && (
              <button
                onClick={() => setSimSettings(prev => ({
                  ...prev, meanReturn: Math.round((planCagr + (prev.stdDev * prev.stdDev) / 2) * 10000) / 10000,
                }))}
                className="mt-1 text-[11px] text-amber-400 hover:text-amber-300 underline decoration-dotted"
                title="Set the arithmetic mean so the simulation compounds at the same rate your accounts do"
              >
                match my plan ({(planCagr * 100).toFixed(1)}%)
              </button>
            )}
          </div>
          )}
          <div>
            <label className="block text-sm text-slate-400 mb-1">{perAccountModel ? 'Stock Volatility (%)' : 'Volatility/Std Dev (%)'}</label>
            <input 
              type="number" 
              step="0.5"
              value={(simSettings.stdDev * 100).toFixed(1)} 
              onChange={e => setSimSettings({...simSettings, stdDev: Number(e.target.value) / 100})}
              className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-slate-100"
            />
            {perAccountModel && (
              <div className="text-[11px] text-slate-500 mt-1 leading-snug">
                the all-stock end of the line; bonds at {(RETURN_MODEL_DEFAULTS.bondVol * 100).toFixed(0)}%, uncorrelated
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Inflation Mean (%)</label>
            <input 
              type="number" 
              step="0.25"
              value={(simSettings.inflationMean * 100).toFixed(2)} 
              onChange={e => setSimSettings({...simSettings, inflationMean: Number(e.target.value) / 100})}
              className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-slate-100"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Inflation Std Dev (%)</label>
            <input 
              type="number" 
              step="0.25"
              value={(simSettings.inflationStdDev * 100).toFixed(2)}
              onChange={e => setSimSettings({...simSettings, inflationStdDev: Number(e.target.value) / 100})}
              className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-slate-100"
            />
          </div>
        </div>
        {acctModel && (accounts || []).length > 0 && (
          <div className="mb-4 p-3 bg-slate-900/50 rounded-lg border border-slate-700">
            <div className="text-xs text-slate-400 mb-2">
              What each account is simulated as. A CAGR of {(RETURN_MODEL_DEFAULTS.stockCagr * 100).toFixed(1)}% reads as all stock,
              {' '}{(RETURN_MODEL_DEFAULTS.bondCagr * 100).toFixed(1)}% as all bond, and rates between as the blend; volatility follows the blend.
              {simSettings.method === 'historical' && ' In historical mode each account replays the real stock and bond returns in that blend.'}
            </div>
            <div className="overflow-x-auto">
              <table className="text-xs w-full">
                <thead>
                  <tr className="text-slate-500">
                    <th className="text-left py-1 pr-3 font-medium">Account</th>
                    <th className="text-right py-1 px-2 font-medium">CAGR</th>
                    <th className="text-right py-1 px-2 font-medium">Reads as</th>
                    <th className="text-right py-1 px-2 font-medium">Volatility</th>
                    {simSettings.method !== 'historical' && <th className="text-right py-1 pl-2 font-medium">Drawn around</th>}
                  </tr>
                </thead>
                <tbody>
                  {(accounts || []).map(a => {
                    const m = acctModel.byId[a.id];
                    if (!m) return null;
                    return (
                      <tr key={a.id} className="border-t border-slate-800">
                        <td className="py-1 pr-3 text-slate-300">{a.name}</td>
                        <td className="py-1 px-2 text-right text-slate-300">{(m.cagr * 100).toFixed(1)}%</td>
                        <td className="py-1 px-2 text-right text-slate-400">{Math.round(m.weight * 100)}% stock / {Math.round((1 - m.weight) * 100)}% bond</td>
                        <td className="py-1 px-2 text-right text-slate-400">{(m.sigma * 100).toFixed(1)}%</td>
                        {simSettings.method !== 'historical' && <td className="py-1 pl-2 text-right text-slate-400">{(m.mean * 100).toFixed(2)}%</td>}
                      </tr>
                    );
                  })}
                  <tr className="border-t border-slate-700 text-slate-500">
                    <td className="py-1 pr-3">Balance-weighted</td>
                    <td className="py-1 px-2 text-right">{(acctModel.portfolio.cagr * 100).toFixed(1)}%</td>
                    <td className="py-1 px-2 text-right">{Math.round(acctModel.portfolio.weight * 100)}% stock</td>
                    <td className="py-1 px-2 text-right">{(acctModel.portfolio.sigma * 100).toFixed(1)}%</td>
                    {simSettings.method !== 'historical' && <td className="py-1 pl-2 text-right">{(acctModel.portfolio.mean * 100).toFixed(2)}%</td>}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
        {/* Dynamic spending guardrails (Guyton-Klinger). When the PLAN has them
            on, every simulation already runs the plan's rule — the switch here
            is for testing them on a plan that does not, so it steps aside. */}
        {PlannerEngine.WITHDRAWAL_LED.has(PlannerEngine.withdrawalStrategyOf(personalInfo)) ? (
        <div className="mb-4 p-3 bg-slate-800/40 border border-slate-700/50 rounded-lg text-sm text-slate-300">
          <span className="text-emerald-400">✓</span> Your withdrawal strategy is{' '}
          <strong>{(WITHDRAWAL_STRATEGY_CHOICES.find(c => c.id === PlannerEngine.withdrawalStrategyOf(personalInfo)) || {}).label}</strong>:{' '}
          {PlannerEngine.withdrawalStrategySummary(personalInfo)}. Every simulation below withdraws by it, and spending
          rises and falls with the markets it meets. “Spending under your strategy” below shows how far.
          <span className="block text-xs text-slate-500 mt-1">Change it on About you → Withdrawal strategy.</span>
        </div>
        ) : PlannerEngine.withdrawalStrategyOf(personalInfo) === 'guardrails' ? (
        <div className="mb-4 p-3 bg-slate-800/40 border border-slate-700/50 rounded-lg text-sm text-slate-300">
          <span className="text-emerald-400">✓</span> Guyton-Klinger spending guardrails are on in your plan, so every
          simulation below adjusts spending by them — cutting the withdrawal
          {' '}{Math.round((personalInfo.guardrailAdjustPct ?? 0.10) * 100)}% when its rate strays
          {' '}{Math.round((personalInfo.guardrailBandPct ?? 0.20) * 100)}% above
          {' '}{personalInfo.guardrailTarget === 'classic' ? 'your first-year rate' : 'your plan’s path'}, raising it after good years.
          <span className="block text-xs text-slate-500 mt-1">Change them on About you → Withdrawal strategy.</span>
        </div>
        ) : (
        <div className="flex flex-wrap items-center gap-4 mb-4 p-3 bg-slate-800/40 border border-slate-700/50 rounded-lg">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={simSettings.guardrails?.enabled || false}
              onChange={e => setSimSettings({ ...simSettings, guardrails: { ...(simSettings.guardrails || { bandPct: 0.20, adjustPct: 0.10 }), enabled: e.target.checked } })}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500/50"
            />
            <span className="text-sm text-slate-300">Dynamic spending guardrails</span>
          </label>
          {simSettings.guardrails?.enabled && (
            <>
              <div className="flex items-center gap-1.5 text-sm text-slate-400">
                <span>Band ±</span>
                <input
                  type="number" min="5" max="50" step="5"
                  value={Math.round((simSettings.guardrails?.bandPct ?? 0.20) * 100)}
                  onChange={e => setSimSettings({ ...simSettings, guardrails: { ...simSettings.guardrails, bandPct: Math.max(0.05, (Number(e.target.value) || 20) / 100) } })}
                  className="w-16 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-100 text-center"
                />
                <span>%</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-slate-400">
                <span>Adjust</span>
                <input
                  type="number" min="5" max="25" step="5"
                  value={Math.round((simSettings.guardrails?.adjustPct ?? 0.10) * 100)}
                  onChange={e => setSimSettings({ ...simSettings, guardrails: { ...simSettings.guardrails, adjustPct: Math.max(0.05, (Number(e.target.value) || 10) / 100) } })}
                  className="w-16 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-100 text-center"
                />
                <span>%</span>
              </div>
              <span className="text-xs text-slate-500 max-w-md">
                A test of Guyton-Klinger guardrails on this simulation only: when the withdrawal rate strays more than
                the band from your plan’s path, the withdrawal is cut or raised by the adjust %. Compare success rates
                with it on and off — and to make it part of your plan, choose it at About you → Withdrawal strategy.
              </span>
            </>
          )}
        </div>
        )}
        {/* Longevity sampling — vary lifespan, not just markets */}
        <div className="flex flex-wrap items-center gap-4 mb-4 p-3 bg-slate-800/40 border border-slate-700/50 rounded-lg">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={simSettings.longevity?.enabled || false}
              onChange={e => setSimSettings({ ...simSettings, longevity: { enabled: e.target.checked } })}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500/50"
            />
            <span className="text-sm text-slate-300">Vary lifespan too</span>
          </label>
          <span className="text-xs text-slate-500 max-w-2xl">
            Without this, every scenario dies on the same birthday — a thousand market paths against exactly one lifespan.
            Each run instead draws an age at death from CDC mortality data, centred on the life expectancies you entered.
            Running out of money after you have died stops counting as a failure, and living to 100 starts counting as a risk.
          </span>
        </div>
        {/* Long-term care sampling — vary the care episode, not just markets */}
        <div className="flex flex-wrap items-center gap-4 mb-4 p-3 bg-slate-800/40 border border-slate-700/50 rounded-lg">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={simSettings.ltc?.enabled || false}
              onChange={e => setSimSettings({ ...simSettings, ltc: { enabled: e.target.checked } })}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500/50"
            />
            <span className="text-sm text-slate-300">Vary long-term care too</span>
          </label>
          <span className="text-xs text-slate-500 max-w-2xl">
            The plan gives everyone the same window of care. Each run instead draws, per person, whether paid care is
            needed at all (about {Math.round(LTC_EPISODE_MODEL.pNeed * 100)}% after 65), for how long (a typical episode
            is two years; one in five runs past five), and in what setting — home care, assisted living or a nursing
            home. Care lands in the final months of that run's life, so it composes with the lifespan draw above.
            {personalInfo.ltcModel === 'none' || !personalInfo.ltcModel
              ? ' Your plan has long-term care switched off, so this is the only place it is priced.'
              : ' It replaces the plan\'s fixed window for the simulation only.'}
          </span>
        </div>
        <div className="flex items-center gap-4">
          {isRunning ? (
            <button
              onClick={cancelSimulation}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium transition-colors"
            >
              ⏹ Cancel ({simProgress}%)
            </button>
          ) : (
            <button
              onClick={runSimulation}
              className={buttonPrimary}
            >
              ▶️ Run Simulation
            </button>
          )}
          <p className="text-xs text-slate-500">
            Historical reference: S&P 500 has ~10% mean return with ~15% standard deviation. After inflation, real returns are ~7%.
          </p>
        </div>
      </Section>
      
      {/* Income Assumptions - What's Being Tested */}
      <Section tab="montecarlo" id="incomeContext" title={<>💰 Income & Withdrawal Context</>} vis={sectionVisibility} level={detailLevel} setVis={setSectionVisibility}>
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-3 border-b border-slate-700">
            {strategyLeadsSpending(personalInfo) ? (
            <div>
              <div className="text-xs text-slate-500 mb-1">Annual Spending</div>
              <div className="text-lg font-semibold text-slate-100">Set by your strategy</div>
              <div className="text-xs text-slate-400">{strategyLabelOf(personalInfo)}</div>
            </div>
            ) : (
            <div>
              <div className="text-xs text-slate-500 mb-1">Annual Spending Goal</div>
              <div className="text-lg font-semibold text-slate-100">
                {formatCurrency(personalInfo.desiredRetirementIncome)}
              </div>
              <div className="text-xs text-slate-400">Today&rsquo;s dollars &mdash; grows with inflation</div>
            </div>
            )}
            <div>
              <div className="text-xs text-slate-500 mb-1">Guaranteed Income Streams</div>
              <div className="text-lg font-semibold text-emerald-400">
                {formatCurrency(
                  incomeStreams
                    .filter(s => {
                      const ownerAge = streamOwnerAge(s, simSettings.startAge,
                        personalInfo.spouseAge + (simSettings.startAge - personalInfo.myAge));
                      return ownerAge >= s.startAge && ownerAge <= s.endAge;
                    })
                    .reduce((sum, s) => sum + s.amount, 0)
                )}
              </div>
              <div className="text-xs text-slate-400">
                {incomeStreams.filter(s => {
                  const ownerAge = streamOwnerAge(s, simSettings.startAge,
                    personalInfo.spouseAge + (simSettings.startAge - personalInfo.myAge));
                  return ownerAge >= s.startAge && ownerAge <= s.endAge;
                }).length} streams at age {simSettings.startAge}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Est. Portfolio Withdrawal</div>
              <div className="text-lg font-semibold text-amber-400">
                {/* Read the engine's own first-year draw rather than re-deriving
                    it. The old expression subtracted raw stream amounts from
                    today's-dollar spending and labelled the result as the gap at
                    a FUTURE age — three different dollar bases in one figure, and
                    it also ignored taxes, healthcare and RMDs, all of which the
                    solver already accounts for. */}
                {formatCurrency(startProjection?.portfolioWithdrawal || 0)}
              </div>
              <div className="text-xs text-slate-400">
                First-year draw at age {simSettings.startAge}, in that year&rsquo;s dollars
              </div>
            </div>
          </div>
          <div className="bg-blue-900/20 border border-blue-700/30 rounded p-3">
            <p className="text-sm text-blue-300">
              <strong>What the simulation tests:</strong> The Monte Carlo simulation calculates how much you need to withdraw from your portfolio each year to meet your spending goals <em>after</em> accounting for Social Security, pensions, and other guaranteed income. It only tests withdrawals needed to cover the remaining gap.
            </p>
          </div>
        </div>
      </Section>
      
      {/* Results */}
      {simResults && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className={cardStyle}>
              <div className="text-slate-400 text-sm mb-1">Success Rate</div>
              <div className={`text-3xl font-bold ${getSuccessColor(simResults.successRate)}`}>
                {(simResults.successRate * 100).toFixed(1)}%
              </div>
              <div className={`text-sm ${getSuccessColor(simResults.successRate)}`}>
                {getSuccessLabel(simResults.successRate)}
              </div>
            </div>
            <div className={cardStyle}>
              <div className="text-slate-400 text-sm mb-1">Portfolio at Start</div>
              {/* The worker reports the sum of today's account balances, which is
                  NOT the balance at simSettings.startAge — labelling it "at age 65"
                  showed today's money against a future age. Use the deterministic
                  projection's own balance at that age, in that year's dollars. */}
              <div className="text-2xl font-bold text-emerald-400">
                {formatCurrency(startingPortfolio || simResults.startingPortfolio)}
              </div>
              <div className="text-sm text-slate-500">
                at age {simResults.startAge}
                {startingPortfolio ? '' : ' (current balances)'}
              </div>
            </div>
            <div className={cardStyle}>
              <div className="text-slate-400 text-sm mb-1">Median Final Portfolio</div>
              <div className="text-2xl font-bold text-amber-400">
                {formatCurrency(showRealDollars && simResults.real ? simResults.real.percentile50 : simResults.percentile50)}
              </div>
              <div className="text-sm text-slate-500">
                at age {endAge}{showRealDollars && simResults.real ? " · today's dollars" : ' · future dollars'}
              </div>
              {/* The comparison every reader makes anyway, made for them on a
                  basis that holds. Reading this median against the dashboard's
                  ending portfolio compares today's dollars with future ones —
                  over thirty years at 3% that is a 2.4x gap and nothing to do
                  with market risk. */}
              {deterministicEnd !== null && (
                <div className="mt-2 pt-2 border-t border-slate-700/50 text-xs">
                  <div className="text-slate-500">your plan, same basis</div>
                  <div className="text-slate-300 font-semibold">{formatCurrency(deterministicEnd)}</div>
                  <div className="text-slate-500">
                    {/* Signed, and said in words. A bare "19%" next to "vs the
                        straight-line run" reads as "19% OF it" — a catastrophe —
                        when it means 19% ABOVE it. Losses carried a minus sign
                        and read correctly; gains did not. */}
                    {(() => {
                      if (!(deterministicEnd > 0)) return 'no straight-line figure to compare';
                      const med = showRealDollars && simResults.real ? simResults.real.percentile50 : simResults.percentile50;
                      const pct = (med / deterministicEnd - 1) * 100;
                      if (Math.abs(pct) < 0.5) return 'median matches the straight-line run';
                      return `median is ${Math.abs(pct).toFixed(0)}% ${pct > 0 ? 'above' : 'below'} the straight-line run`;
                    })()}
                  </div>
                </div>
              )}
            </div>
            <div className={cardStyle}>
              <div className="text-slate-400 text-sm mb-1">Avg Failure Age</div>
              <div className="text-2xl font-bold text-red-400">
                {simResults.avgFailureAge ? simResults.avgFailureAge.toFixed(1) : 'N/A'}
              </div>
              <div className="text-sm text-slate-500">{simResults.avgFailureAge ? 'when funds depleted' : 'no failures'}</div>
            </div>
          </div>
          
          {/* Percentile Distribution */}
          <div className={cardStyle}>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h4 className="text-lg font-semibold text-slate-100">Portfolio Outcome Distribution (at Age {endAge})</h4>
              {simResults.real && (
                <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-400">
                  <input
                    type="checkbox"
                    checked={showRealDollars}
                    onChange={e => setShowRealDollars(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500/50"
                  />
                  <span title="Every simulation draws its own inflation path, so raw future-dollar results from different simulations are not comparable. Deflating each run by its own inflation makes these figures directly comparable and expresses them in money you can judge today.">
                    Show in today's dollars
                  </span>
                </label>
              )}
            </div>
            <div className="grid grid-cols-5 gap-4 text-center">
              <div>
                <div className="text-red-400 text-sm mb-1">5th Percentile</div>
                <div className="text-lg font-semibold text-slate-100">{formatCurrency(showRealDollars && simResults.real ? simResults.real.percentile5 : simResults.percentile5)}</div>
                <div className="text-xs text-slate-500">Worst case</div>
              </div>
              <div>
                <div className="text-orange-400 text-sm mb-1">25th Percentile</div>
                <div className="text-lg font-semibold text-slate-100">{formatCurrency(showRealDollars && simResults.real ? simResults.real.percentile25 : simResults.percentile25)}</div>
                <div className="text-xs text-slate-500">Poor scenario</div>
              </div>
              <div>
                <div className="text-amber-400 text-sm mb-1">50th Percentile</div>
                <div className="text-lg font-semibold text-slate-100">{formatCurrency(showRealDollars && simResults.real ? simResults.real.percentile50 : simResults.percentile50)}</div>
                <div className="text-xs text-slate-500">Median outcome</div>
              </div>
              <div>
                <div className="text-green-400 text-sm mb-1">75th Percentile</div>
                <div className="text-lg font-semibold text-slate-100">{formatCurrency(showRealDollars && simResults.real ? simResults.real.percentile75 : simResults.percentile75)}</div>
                <div className="text-xs text-slate-500">Good scenario</div>
              </div>
              <div>
                <div className="text-emerald-400 text-sm mb-1">95th Percentile</div>
                <div className="text-lg font-semibold text-slate-100">{formatCurrency(showRealDollars && simResults.real ? simResults.real.percentile95 : simResults.percentile95)}</div>
                <div className="text-xs text-slate-500">Best case</div>
              </div>
            </div>
          </div>
          
          {/* Method Indicator */}
          <div className="flex items-center gap-3 px-4 py-3 bg-slate-800/40 rounded-lg border border-slate-700/50">
            <span className="text-2xl">{simResults.method === 'historical' ? '📜' : '🎲'}</span>
            <div className="flex-1">
              <div className="text-sm font-semibold text-slate-200">
                {simResults.method === 'historical' ? 'Historical Sequences' : 'Random Sampling'}
              </div>
              <div className="text-xs text-slate-400">
                {simResults.method === 'historical'
                  ? (simResults.historicalStartYearSetting === 'all'
                      ? `One deterministic replay of each of the ${simResults.totalSimulations.toLocaleString()} valid starting years from the Shiller dataset.`
                      : `Deterministic replay of returns starting in ${simResults.historicalStartYearSetting}.`)
                  : `${simResults.totalSimulations.toLocaleString()} simulations sampled from a normal distribution.`}
                {simResults.guardrailsEnabled && ' Dynamic spending guardrails were active.'}
              </div>
            </div>
          </div>

          {/* How long the household actually lived across the simulations */}
          {simResults.longevityEnabled && simResults.longevityStats && (() => {
            const L = simResults.longevityStats;
            const cell = (label, value, sub) => (
              <div className="bg-slate-800/60 rounded-lg p-3">
                <div className="text-xs text-slate-400">{label}</div>
                <div className="text-xl font-semibold text-slate-100">{value}</div>
                {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
              </div>
            );
            return (
              <Section tab="montecarlo" id="longevity" title={<>🕰️ How Long the Money Had to Last</>} vis={sectionVisibility} level={detailLevel} setVis={setSectionVisibility}>
                <p className="text-xs text-slate-400 mb-3">
                  Age of the last surviving member of the household, across every simulation. Success now means the
                  portfolio outlasted the people — not that it reached a fixed birthday.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {cell('Median', L.p50, 'half of scenarios go longer')}
                  {cell('1 in 4 reach', L.p75)}
                  {cell('1 in 10 reach', L.p90, 'the tail your plan must survive')}
                  {cell('Longest drawn', L.max)}
                </div>
                <p className="text-xs text-slate-400 mt-3">
                  In <span className="text-amber-400 font-medium">{Math.round(L.beyondPlanned * 100)}%</span> of scenarios
                  the household outlived the fixed planning horizon this plan uses everywhere else — those are years the
                  ordinary projection never models at all.
                </p>
              </Section>
            );
          })()}

          {simResults.ltcEnabled && simResults.ltcStats && (() => {
            const L = simResults.ltcStats;
            const pct = (v) => v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`;
            const cell = (label, value, sub) => (
              <div className="bg-slate-800/60 rounded-lg p-3">
                <div className="text-xs text-slate-400">{label}</div>
                <div className="text-xl font-semibold text-slate-100">{value}</div>
                {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
              </div>
            );
            const gap = (L.successWithCare !== null && L.successWithoutCare !== null)
              ? L.successWithoutCare - L.successWithCare : null;
            return (
              <Section tab="montecarlo" id="ltc" title={<>🏥 Long-Term Care Outcomes</>} vis={sectionVisibility} level={detailLevel} setVis={setSectionVisibility}>
                <p className="text-xs text-slate-400 mb-3">
                  What the simulation drew for care, and what it did to the plan. Costs are lifetime, in today's dollars,
                  across the household.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {cell('Runs with paid care', pct(L.share), `${pct(L.nursingShare)} included a nursing home`)}
                  {cell('Care drawn, median', `${L.monthsP50} mo`, `1 in 10 drew ${L.monthsP90}+ mo; longest ${L.monthsMax}`)}
                  {cell('Lifetime cost, median', formatCurrency(L.costP50Real), `1 in 10 cost ${formatCurrency(L.costP90Real)}+`)}
                  {cell('Success with care', pct(L.successWithCare), `vs ${pct(L.successWithoutCare)} without`)}
                </div>
                <p className="text-xs text-slate-400 mt-3">
                  {gap !== null && gap > 0.02
                    ? <>Care costs this plan <span className="text-amber-400 font-medium">{(gap * 100).toFixed(1)} points</span> of success rate. </>
                    : <>Care barely moves this plan's success rate. </>}
                  {L.overFiveYearsCount > 0 && (
                    <>In the {L.overFiveYearsCount} runs with more than five years of care, the plan held up{' '}
                    <span className="text-slate-200 font-medium">{pct(L.successOverFiveYears)}</span> of the time — that is the
                    tail long-term care insurance exists for.</>
                  )}
                </p>
              </Section>
            );
          })()}

          {/* Guardrail spending outcomes — what flexibility the plan demanded */}
          {/* Under any strategy but a fixed target, spending moves with markets.
              What each simulation spent — its first year, its lowest, its last —
              in today's dollars. For a fixed percentage this is the whole risk:
              the portfolio never runs dry, the budget does the shrinking. */}
          {simResults.spendingStats && simResults.spendingStats.strategy !== 'target' && (
            <Section tab="montecarlo" id="spending" title={<>💵 Spending Under Your Strategy</>} vis={sectionVisibility} level={detailLevel} setVis={setSectionVisibility}>
              <p className="text-xs text-slate-400 mb-3">
                What your withdrawal strategy — {(WITHDRAWAL_STRATEGY_CHOICES.find(c => c.id === simResults.spendingStats.strategy) || {}).label} —
                let you spend each year across the simulations, in today’s dollars — healthcare and recurring costs included.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[['First retirement year (median)', simResults.spendingStats.medianFirst, null],
                  ['Lowest year (median simulation)', simResults.spendingStats.medianMin, simResults.spendingStats.medianFirst],
                  ['Lowest year (worst 10%)', simResults.spendingStats.p10Min, simResults.spendingStats.medianFirst],
                  ['Final year (median)', simResults.spendingStats.medianEnd, simResults.spendingStats.medianFirst]].map(([label, v, ref]) => (
                  <div key={label} className="bg-slate-800/60 rounded-lg p-3">
                    <div className="text-xs text-slate-500 mb-1">{label}</div>
                    <div className={`text-xl font-semibold ${ref && v < ref * 0.7 ? 'text-red-400' : 'text-slate-100'}`}>{formatCurrency(Math.round(v))}</div>
                    {ref > 0 && <div className="text-xs text-slate-500">{Math.round(v / ref * 100)}% of the first year</div>}
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Reading it: the worst-10% low is the leanest year one run in ten had to live through. If you could not live on
                it, a steadier strategy — or a lower withdrawal rate — trades some spending now for less swing later.
              </p>
            </Section>
          )}

          {simResults.guardrailsEnabled && simResults.guardrailStats && (
            <Section tab="montecarlo" id="guardrails" title={<>🛤️ Spending Guardrail Outcomes</>} vis={sectionVisibility} level={detailLevel} setVis={setSectionVisibility}>
              <p className="text-xs text-slate-400 mb-3">
                With guardrails, "success" means the portfolio survived <em>given</em> these spending adjustments —
                the numbers below show how much flexing that took.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-800/60 rounded-lg p-3">
                  <div className="text-xs text-slate-500 mb-1">Scenarios Needing a Cut</div>
                  <div className={`text-xl font-semibold ${simResults.guardrailStats.simsWithCutPct > 0.5 ? 'text-yellow-400' : 'text-slate-100'}`}>
                    {Math.round(simResults.guardrailStats.simsWithCutPct * 100)}%
                  </div>
                </div>
                <div className="bg-slate-800/60 rounded-lg p-3">
                  <div className="text-xs text-slate-500 mb-1">Avg Cut Years per Scenario</div>
                  <div className="text-xl font-semibold text-slate-100">{simResults.guardrailStats.avgCutYears.toFixed(1)}</div>
                </div>
                <div className="bg-slate-800/60 rounded-lg p-3">
                  <div className="text-xs text-slate-500 mb-1">Median Ending Spending</div>
                  <div className="text-xl font-semibold text-slate-100">{Math.round(simResults.guardrailStats.medianEndMultiplier * 100)}%<span className="text-xs text-slate-500 ml-1">of plan</span></div>
                </div>
                <div className="bg-slate-800/60 rounded-lg p-3">
                  <div className="text-xs text-slate-500 mb-1">Worst-Case Trough (p10)</div>
                  <div className={`text-xl font-semibold ${simResults.guardrailStats.p10MinMultiplier < 0.7 ? 'text-red-400' : 'text-slate-100'}`}>
                    {Math.round(simResults.guardrailStats.p10MinMultiplier * 100)}%<span className="text-xs text-slate-500 ml-1">of plan</span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Reading it: if the worst-case trough is a spending level you could actually live with (say, 80% of plan),
                the guardrail success rate is a fairer picture of your plan than the rigid fixed-spending number.
              </p>
            </Section>
          )}
          
          {/* Historical Summary Table — only when historical mode + 'all' years */}
          {simResults.method === 'historical' && simResults.historicalSummary && simResults.historicalSummary.length > 0 && (
            <Section tab="montecarlo" id="perYear" title={"Per-Year Historical Outcomes"} vis={sectionVisibility} level={detailLevel} setVis={setSectionVisibility}>
              <p className="text-xs text-slate-400 mb-4">
                Each row is a real {yearsToSimulate}-year sequence starting in the year shown. Sorted worst-first
                so you can see the historical sequences that would have broken your plan.
              </p>
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-800/95 backdrop-blur-sm">
                    <tr className="text-left text-slate-400 border-b border-slate-700">
                      <th className="py-2 px-3">Start Year</th>
                      <th className="py-2 px-3 text-right">Outcome</th>
                      <th className="py-2 px-3 text-right">Final Portfolio</th>
                      <th className="py-2 px-3 text-right">Failure Age</th>
                      <th className="py-2 px-3">Era Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simResults.historicalSummary.map((row, i) => {
                      const survived = row.successRate >= 0.5;
                      const eraNote = (() => {
                        const y = row.startYear;
                        if (y >= 1929 && y <= 1932) return 'Great Depression';
                        if (y >= 1937 && y <= 1939) return 'Recession of 1937-38';
                        if (y >= 1965 && y <= 1968) return 'Pre-stagflation peak';
                        if (y >= 1969 && y <= 1974) return 'Stagflation start';
                        if (y >= 1975 && y <= 1981) return 'High inflation era';
                        if (y === 2000) return 'Dot-com peak';
                        if (y === 2007) return 'Pre-GFC';
                        if (y === 2008) return 'Global Financial Crisis';
                        if (y >= 1982 && y <= 1999) return 'Bull market era';
                        if (y >= 2009 && y <= 2019) return 'Post-GFC bull';
                        return '';
                      })();
                      return (
                        <tr 
                          key={row.startYear} 
                          className={`border-b border-slate-700/50 ${survived ? '' : 'bg-red-900/10'}`}
                        >
                          <td className="py-2 px-3 font-semibold text-slate-200">{row.startYear}</td>
                          <td className={`py-2 px-3 text-right font-medium ${survived ? 'text-emerald-400' : 'text-red-400'}`}>
                            {survived ? '✓ Survived' : '✗ Failed'}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-300 font-mono">
                            {formatCurrency(row.avgFinalPortfolio)}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-400">
                            {row.earliestFailureAge !== null ? row.earliestFailureAge : '—'}
                          </td>
                          <td className="py-2 px-3 text-xs text-slate-500">{eraNote}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 text-xs text-slate-500">
                Counts: {simResults.historicalSummary.filter(r => r.successRate >= 0.5).length} sequences survived,
                {' '}{simResults.historicalSummary.filter(r => r.successRate < 0.5).length} sequences failed.
                Overall success rate: <strong className={getSuccessColor(simResults.successRate)}>{(simResults.successRate * 100).toFixed(1)}%</strong>.
              </div>
            </Section>
          )}
          
          {/* Percentile Bands Chart */}
          <Section tab="montecarlo" id="bands" title={"Portfolio Projection Bands"} vis={sectionVisibility} level={detailLevel} setVis={setSectionVisibility}>
            <div style={chartBox(320)}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={showRealDollars && simResults.percentileBandsReal ? simResults.percentileBandsReal : simResults.percentileBands}>
                  <CartesianGrid strokeDasharray="3 3" stroke={THEME.grid} />
                  <XAxis dataKey="age" stroke={THEME.axis} tick={{ fill: THEME.axis }} />
                  <YAxis stroke={THEME.axis} tick={{ fill: THEME.axis }} tickFormatter={v => `$${(v/1e6).toFixed(1)}M`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: THEME.surfaceRaised, border: `1px solid ${THEME.grid}`, borderRadius: '8px' }} 
                    formatter={(v) => formatCurrency(v)}
                    labelFormatter={l => `Age ${l}`}
                  />
                  <Legend formatter={legendInk} />
                  {/* One hue, stepped by distance from the median. Five saturated
                      hues running green→red said the bands were unrelated things
                      AND that the 10th percentile is a failure — it is the low end
                      of a range, which is what a percentile means. */}
                  <Area type="monotone" dataKey="p90" stackId="1" fill={THEME.distribution[4]} stroke={THEME.distribution[4]} fillOpacity={0.2} name="90th Percentile" />
                  <Area type="monotone" dataKey="p75" stackId="2" fill={THEME.distribution[3]} stroke={THEME.distribution[3]} fillOpacity={0.25} name="75th Percentile" />
                  <Area type="monotone" dataKey="p50" stackId="3" fill={THEME.distribution[2]} stroke={THEME.distribution[2]} fillOpacity={0.45} name="Median (50th)" />
                  <Area type="monotone" dataKey="p25" stackId="4" fill={THEME.distribution[1]} stroke={THEME.distribution[1]} fillOpacity={0.25} name="25th Percentile" />
                  <Area type="monotone" dataKey="p10" stackId="5" fill={THEME.distribution[0]} stroke={THEME.distribution[0]} fillOpacity={0.2} name="10th Percentile" />
                  {simSettings.startAge > personalInfo.myAge && (
                    <ReferenceLine x={simSettings.startAge} stroke="#10b981" strokeDasharray="5 5" label={{ value: 'Sim Start', position: 'top', fill: '#10b981', fontSize: 12 }} />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              This chart shows the range of possible portfolio outcomes. The median line (yellow) represents the most likely outcome, while the bands show the spread of results from the simulation.
            </p>
          </Section>
          
          {/* Sample Paths (Spaghetti Chart) */}
          <Section tab="montecarlo" id="paths" title={<>Sample Simulation Paths ({simResults.portfolioPaths.length} of {simResults.totalSimulations} scenarios)</>} vis={sectionVisibility} level={detailLevel} setVis={setSectionVisibility}>
            <div style={chartBox(288)}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart>
                  <CartesianGrid strokeDasharray="3 3" stroke={THEME.grid} />
                  <XAxis 
                    dataKey="age" 
                    stroke={THEME.axis} 
                    tick={{ fill: THEME.axis }}
                    domain={[simResults.startAge, 95]}
                    type="number"
                    allowDataOverflow
                  />
                  <YAxis stroke={THEME.axis} tick={{ fill: THEME.axis }} tickFormatter={v => `$${(v/1e6).toFixed(1)}M`} />
                  {simResults.portfolioPaths.map((path, idx) => (
                    <Line 
                      key={idx}
                      data={path}
                      type="monotone" 
                      dataKey="portfolio" 
                      stroke={`hsl(${(idx * 18) % 360}, 70%, 50%)`}
                      strokeWidth={1}
                      dot={false}
                      opacity={0.5}
                      name={`Scenario ${idx + 1}`}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Each line represents a single simulation showing how your portfolio might evolve with random market returns. Notice the wide spread - this illustrates the uncertainty inherent in retirement planning.
            </p>
          </Section>
          
          {/* Interpretation */}
          <div className="p-4 bg-slate-800/50 border border-slate-700/50 rounded-lg">
            <h4 className="font-semibold text-slate-100 mb-2">📊 How to Interpret These Results</h4>
            <ul className="text-sm text-slate-400 space-y-1">
              <li><span className="text-emerald-400 font-medium">90%+ success rate:</span> Your plan is robust and can withstand most market conditions.</li>
              <li><span className="text-green-400 font-medium">75-90% success rate:</span> Good plan, but consider having a backup strategy or flexibility in spending.</li>
              <li><span className="text-yellow-400 font-medium">50-75% success rate:</span> Moderate risk - consider reducing spending, working longer, or saving more.</li>
              <li><span className="text-red-400 font-medium">Below 50%:</span> High risk of running out of money - significant adjustments recommended.</li>
            </ul>
            <p className="text-xs text-slate-500 mt-3">
              Note: Monte Carlo simulations assume returns are normally distributed, which underestimates the probability of extreme events. Real markets have "fat tails" and can experience more severe crashes than the model predicts.
            </p>
          </div>
        </>
      )}
      
      {simError && (
        <div className="p-4 bg-red-900/30 border border-red-500/50 rounded-lg mb-4">
          <h4 className="text-red-400 font-semibold mb-2">Monte Carlo Error</h4>
          <pre className="text-xs text-red-300 whitespace-pre-wrap">{simError}</pre>
        </div>
      )}
      
      {!simResults && !isRunning && !simError && (
        <div className="text-center py-12 text-slate-500">
          <p className="text-lg mb-2">Click "Run Simulation" to analyze your retirement plan</p>
          <p className="text-sm">The simulation will test {simSettings.numSimulations.toLocaleString()} random scenarios</p>
        </div>
      )}

      <StrategyComparePanel personalInfo={personalInfo} accounts={accounts} incomeStreams={incomeStreams}
        assets={assets} oneTimeEvents={oneTimeEvents} recurringExpenses={recurringExpenses}
        simSettings={simSettings} currentYearReturn={currentYearReturn} />
    </div>
  );
}

// ============================================
// StrategyComparePanel — every withdrawal strategy, on the same markets
// ============================================
// Runs the tab's simulation once per strategy (worker job 'strategyCompare'),
// on identical market paths, so the rows differ by strategy and not by luck.
// Capped at 500 simulations a strategy: seven full runs of a thousand would
// keep a reader waiting for a precision the comparison does not need.
const COMPARE_MAX_SIMS = 500;
function StrategyComparePanel({ personalInfo, accounts, incomeStreams, assets, oneTimeEvents, recurringExpenses,
                                simSettings, currentYearReturn }) {
  const [state, setState] = useState({ running: false, progress: 0, result: null, error: null, key: null });
  const jobRef = useRef(null);
  const sims = Math.min(COMPARE_MAX_SIMS, simSettings.numSimulations || COMPARE_MAX_SIMS);
  const runKey = JSON.stringify([personalInfo, accounts, incomeStreams, assets, oneTimeEvents, recurringExpenses,
    simSettings, currentYearReturn]);
  const W = typeof window !== 'undefined' ? (window.PlannerCompareWorker || window.PlannerWorker) : null;
  const run = () => {
    if (!W) { setState(s => ({ ...s, error: 'Worker not available — reload the page.' })); return; }
    setState({ running: true, progress: 0, result: null, error: null, key: runKey });
    const handle = W.run({
      type: 'strategyCompare',
      payload: { personalInfo, accounts, incomeStreams, assets, oneTimeEvents, recurringExpenses, currentYearReturn,
                 simSettings: { ...simSettings, numSimulations: sims } },
      onProgress: (pct) => setState(s => (jobRef.current === handle ? { ...s, progress: pct } : s)),
    });
    jobRef.current = handle;
    handle.promise
      .then(result => { if (jobRef.current === handle) { jobRef.current = null; setState(s => ({ ...s, running: false, result })); } })
      .catch(err => { if (jobRef.current === handle) { jobRef.current = null; setState(s => ({ ...s, running: false, error: err.message === 'Cancelled' ? null : err.message })); } });
  };
  const cancel = () => { if (W && W.cancel) W.cancel(); jobRef.current = null; setState(s => ({ ...s, running: false, progress: 0 })); };
  useEffect(() => () => { if (jobRef.current && W && W.cancel) W.cancel(); }, []);

  const planStrategy = PlannerEngine.withdrawalStrategyOf(personalInfo);
  const rows = (state.result && state.result.rows) || [];
  const stale = state.result && state.key !== runKey;
  const best = (f, dir = 1) => {
    const vals = rows.map(f).filter(Number.isFinite);
    return vals.length ? (dir > 0 ? Math.max(...vals) : Math.min(...vals)) : null;
  };
  const bestSuccess = best(r => r.successRate);
  const bestTotal = best(r => r.spending && r.spending.medianTotal);
  const bestLow = best(r => r.spending && r.spending.p10Min);
  const scale = Math.max(1, ...rows.map(r => (r.spending ? r.spending.medianFirst : 0)));
  const label = (id) => (WITHDRAWAL_STRATEGY_CHOICES.find(c => c.id === id) || {}).label || id;
  const k = (v) => (Number.isFinite(v) ? formatCurrency(Math.round(v / 1000) * 1000) : '—');

  return (
    <div className={cardStyle} data-tour="strategy-compare">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">Compare withdrawal strategies</h3>
          <p className="text-sm text-slate-400 mt-1 max-w-3xl">
            All seven strategies through the same {sims.toLocaleString()} simulated markets, with the settings above.
            Every row meets exactly the same markets, so the differences are the strategy’s, not luck’s. Spending is in
            today’s dollars and counts what was actually paid — a run that ran out shows its lean years.
          </p>
        </div>
        {state.running ? (
          <button onClick={cancel} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium transition-colors">
            ⏹ Cancel ({state.progress}%)
          </button>
        ) : (
          <button onClick={run} className={buttonPrimary}>
            {state.result ? (stale ? '↻ Compare again — plan changed' : '↻ Compare again') : '⚖️ Compare all seven'}
          </button>
        )}
      </div>

      {state.error && <p className="text-sm text-red-400 mt-2">Could not compare: {state.error}</p>}

      {rows.length > 0 && (
        <div className={`overflow-x-auto mt-3 ${stale ? 'opacity-60' : ''}`}>
          {stale && <p className="text-xs text-amber-400 mb-2">Your plan or the settings above changed since this ran — compare again to update it.</p>}
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-700/60">
                <th className="text-left py-2 px-2 font-medium">Strategy</th>
                <th className="text-right py-2 px-2 font-medium">Money lasts</th>
                <th className="text-right py-2 px-2 font-medium">First year</th>
                <th className="text-left py-2 px-2 font-medium min-w-[160px]">Spending range<span className="block font-normal text-[10px] text-slate-600">worst-10% low · median low · first year</span></th>
                <th className="text-right py-2 px-2 font-medium">Leanest year<span className="block font-normal text-[10px] text-slate-600">worst 10%</span></th>
                <th className="text-right py-2 px-2 font-medium">Lifetime spending<span className="block font-normal text-[10px] text-slate-600">median</span></th>
                <th className="text-right py-2 px-2 font-medium">Left at the end<span className="block font-normal text-[10px] text-slate-600">median</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const sp = r.spending || {};
                const mine = r.strategy === planStrategy;
                const pct = (v) => `${Math.max(0, Math.min(100, (v / scale) * 100))}%`;
                return (
                  <tr key={r.strategy} className={`border-b border-slate-700/40 ${mine ? 'bg-slate-700/40' : ''}`}>
                    <td className="py-2 px-2 text-slate-200 whitespace-nowrap">
                      {label(r.strategy)}
                      {mine && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full border border-emerald-500/50 text-emerald-300 align-middle">your plan</span>}
                    </td>
                    <td className={`py-2 px-2 text-right ${r.successRate === bestSuccess ? 'text-emerald-400 font-semibold' : r.successRate < 0.75 ? 'text-red-400' : 'text-slate-200'}`}>
                      {(r.successRate * 100).toFixed(0)}%
                    </td>
                    <td className="py-2 px-2 text-right text-slate-200">{k(sp.medianFirst)}</td>
                    <td className="py-2 px-2">
                      {/* A range bar: from the worst-10% leanest year to the first
                          year, with a tick at the median simulation's leanest. */}
                      <div className="relative h-3 rounded bg-slate-700/40"
                           title={`Worst-10% leanest ${k(sp.p10Min)} · median leanest ${k(sp.medianMin)} · first year ${k(sp.medianFirst)}`}>
                        <div className="absolute top-0 bottom-0 rounded" style={{ left: pct(sp.p10Min || 0), width: `calc(${pct(sp.medianFirst || 0)} - ${pct(sp.p10Min || 0)})`, background: THEME.focus, opacity: 0.45 }} />
                        <div className="absolute top-[-2px] bottom-[-2px] w-0.5" style={{ left: pct(sp.medianMin || 0), background: THEME.inkPrimary }} />
                      </div>
                    </td>
                    <td className={`py-2 px-2 text-right ${sp.p10Min === bestLow ? 'text-emerald-400 font-semibold' : 'text-slate-200'}`}>{k(sp.p10Min)}</td>
                    <td className={`py-2 px-2 text-right ${sp.medianTotal === bestTotal ? 'text-emerald-400 font-semibold' : 'text-slate-200'}`}>{k(sp.medianTotal)}</td>
                    <td className="py-2 px-2 text-right text-slate-200">{k(r.endMedianReal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="text-xs text-slate-500 mt-3 space-y-1">
            <p>
              <strong className="text-slate-400">Reading it.</strong> “Money lasts” is the share of runs the portfolio
              funded to the end. A strategy that cuts spending when markets fall almost always lasts — its cost shows in
              the leanest year instead. A $0 leanest year means those runs ran out of money in a year whose costs —
              care, above all — took all the income that was left. “Lifetime spending” adds up everything each run let
              you spend; “left at the end” is what heirs would receive. Best in each column is in green.
            </p>
            <p>
              To use one, choose it at About you → Withdrawal strategy, or try it on the Dashboard’s What if… box first.
              Your spending target and your Guyton-Klinger settings are used by their rows; the other strategies use their
              research defaults unless you have set them.
            </p>
          </div>
        </div>
      )}
      {!rows.length && !state.running && !state.error && (
        <p className="text-xs text-slate-500 mt-2">Takes about as long as seven small simulations — usually under a minute.</p>
      )}
    </div>
  );
}

// ============================================
// ScenarioComparisonPanel
// ============================================
// Lifted out of the Scenarios tab in v2.14.0 and turned into a Sandbox panel.
// Only the tab chrome and the "save the current plan" card were dropped: saving
// now happens in the Sandbox, from the plan its controls compose, which is the
// whole reason the two merged. The comparison itself is unchanged.
// Tooltip for the scenario comparison chart.
//
// The stock Recharts tooltip lists series in render order with a dollar figure
// each, which is the least useful arrangement: the reader is trying to answer
// "which is ahead, and by how much", and render order answers neither. So the
// rows are sorted by value at the hovered age, and each carries its gap to the
// current plan — the comparison the reader is actually making, done for them
// rather than in their head.
//
// The swatch carries identity, including the stroke pattern for scenarios past
// the eighth; the text stays in ink tokens. A series colour used as text colour
// is a contrast problem on a raised surface and drops the one WARN the palette
// carries (slot 6 sits at 2.96:1, fine for a 2px line, not for 12px type).
function ScenarioComparisonTooltip({ active, payload, label, styleFor }) {
  if (!active || !payload || !payload.length) return null;
  const base = payload.find(e => e.dataKey === 'Current Plan');
  const baseValue = base ? base.value : null;
  const year = payload[0] && payload[0].payload ? payload[0].payload.year : null;
  const rows = payload.slice().sort((a, b) => (b.value || 0) - (a.value || 0));

  return (
    <div style={{ backgroundColor: THEME.surfaceRaised, border: `1px solid ${THEME.grid}`,
                  borderRadius: 8, padding: '10px 12px', fontSize: 12,
                  color: THEME.inkPrimary, minWidth: 250 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>
        Age {label}{year ? <span style={{ color: THEME.inkMuted, fontWeight: 400 }}> · {year}</span> : null}
      </div>
      {rows.map(entry => {
        const isBase = entry.dataKey === 'Current Plan';
        const st = isBase ? null : styleFor(entry.dataKey);
        const delta = (!isBase && baseValue !== null) ? (entry.value || 0) - baseValue : null;
        return (
          <div key={entry.dataKey}
               style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
            {/* The swatch repeats the line's own pattern, so a dashed series in
                the chart is a dashed swatch here rather than a solid block that
                matches three other rows. */}
            <svg width="18" height="8" style={{ flex: '0 0 auto' }} aria-hidden="true">
              <line x1="0" y1="4" x2="18" y2="4"
                    stroke={isBase ? THEME.lines.target : st.stroke}
                    strokeWidth={isBase ? 3 : 2}
                    strokeDasharray={isBase ? undefined : st.strokeDasharray} />
            </svg>
            <span style={{ flex: 1, color: isBase ? THEME.inkPrimary : THEME.inkSecondary,
                           fontWeight: isBase ? 600 : 400 }}>
              {entry.dataKey}
            </span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(entry.value)}</span>
            {delta !== null && (
              <span style={{ width: 78, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                             color: delta >= 0 ? THEME.status.good : THEME.status.serious }}>
                {delta >= 0 ? '+' : '-'}{formatCurrency(Math.abs(delta))}
              </span>
            )}
          </div>
        );
      })}
      {baseValue !== null && payload.length > 1 && (
        <div style={{ color: THEME.inkMuted, fontSize: 11, marginTop: 6,
                      borderTop: `1px solid ${THEME.grid}`, paddingTop: 5 }}>
          gap shown against your current plan
        </div>
      )}
    </div>
  );
}

function ScenarioComparisonPanel({ activeScenarioId, assets, computeProjections, deleteScenario, loadScenario, oneTimeEvents, personalInfo, projections, recurringExpenses, scenarios, onHide }) {
  const [selectedScenarios, setSelectedScenarios] = useState([]);
  
  const generateScenarioProjections = (scenario) => {
    return computeProjections(
      scenario.personalInfo, 
      scenario.accounts, 
      scenario.incomeStreams, 
      scenario.assets || assets, // fallback to current assets for old saved scenarios missing assets
      scenario.oneTimeEvents || oneTimeEvents, // fallback to current events
      scenario.recurringExpenses || recurringExpenses // fallback to current expenses
    );
  };
  
  const currentSummary = (() => {
    const retYears = projections.filter(p => p.myAge >= personalInfo.myRetirementAge);
    const legAge = personalInfo.legacyAge || 95;
    return {
      name: 'Current Plan', retirementAge: personalInfo.myRetirementAge,
      projectedAt65: projections.find(p => p.myAge === 65)?.totalPortfolio || 0,
      projectedAt80: projections.find(p => p.myAge === 80)?.totalPortfolio || 0,
      projectedAt95: projections.find(p => p.myAge === legAge)?.totalPortfolio || 0,
      lifetimeTax: retYears.reduce((sum, p) => sum + p.totalTax, 0),
      lifetimeIRMAA: retYears.reduce((sum, p) => sum + (p.irmaaSurcharge || 0), 0),
      lifetimeSS: retYears.reduce((sum, p) => sum + p.socialSecurity, 0),
      netWealth: (projections.find(p => p.myAge === legAge)?.totalPortfolio || 0) + retYears.reduce((sum, p) => sum + p.socialSecurity, 0)
    };
  })();
  
  const scenarioSummaries = scenarios.map(s => {
    const proj = generateScenarioProjections(s);
    const retYears = proj.filter(p => p.myAge >= s.personalInfo.myRetirementAge);
    const legAge = s.personalInfo.legacyAge || personalInfo.legacyAge || 95;
    return {
      ...s,
      projectedAt65: proj.find(p => p.myAge === 65)?.totalPortfolio || 0,
      projectedAt80: proj.find(p => p.myAge === 80)?.totalPortfolio || 0,
      projectedAt95: proj.find(p => p.myAge === legAge)?.totalPortfolio || 0,
      lifetimeTax: retYears.reduce((sum, p) => sum + p.totalTax, 0),
      lifetimeIRMAA: retYears.reduce((sum, p) => sum + (p.irmaaSurcharge || 0), 0),
      lifetimeSS: retYears.reduce((sum, p) => sum + p.socialSecurity, 0),
      netWealth: (proj.find(p => p.myAge === legAge)?.totalPortfolio || 0) + retYears.reduce((sum, p) => sum + p.socialSecurity, 0)
    };
  });
  
  const toggleScenarioSelection = (id) => {
    setSelectedScenarios(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };
  
  // ── WHICH LINE IS WHICH ────────────────────────────────────────────────────
  // Three rules, and the old code broke all three.
  //
  //   1. THE BASELINE IS NOT A SERIES. "Current Plan" is the thing every
  //      scenario is measured against, so it gets the reference treatment — a
  //      thick near-white line — rather than a hue competing with the others.
  //      It used to be hardcoded #f59e0b, which is not a palette colour at all:
  //      at OKLCH L 0.77 it sits outside the 0.48–0.67 band every validated slot
  //      lives in, and it was never checked against them because it was not a
  //      theme token. On screen it read as a third orange next to slot 1
  //      (orange) and slot 3 (yellow) — the collision that started this.
  //
  //   2. COLOUR FOLLOWS THE SCENARIO, NOT ITS POSITION IN THE TICK-LIST. The
  //      slot came from the index within selectedScenarios, so un-ticking one
  //      repainted every scenario after it. Learning "the Roth-heavy one is
  //      green" was impossible. The slot now comes from the scenario's place in
  //      the saved list, which does not move when you tick a box.
  //
  //   3. HUES ARE ASSIGNED IN ORDER FROM SLOT 0 AND NEVER CYCLED. The old
  //      expression was (idx + 1) % 8: it skipped blue, and past eight
  //      scenarios it silently handed out a hue that was already on screen.
  //      The colour-vision separation the palette guarantees is a property of
  //      consecutive slots, so skipping and wrapping forfeits it.
  //
  // Past eight, hue alone is out of road. Rather than repeat one, the stroke
  // pattern becomes a second channel: eight hues x three patterns = 24 lines
  // that are still told apart by something other than colour. The legend and
  // the tick-list both draw the pattern, so the pairing is visible without
  // hovering anything.
  // Stable per scenario: its position among the SAVED scenarios, not among the
  // ticked ones.
  const styleForScenario = (id) => scenarioLineStyle(Math.max(0, scenarios.findIndex(s => s.id === id)));

  // One projection per scenario, not one per scenario per row. This used to sit
  // inside the .map over 51 years, so five ticked scenarios re-ran 255 full
  // projections on every render — the reason the chart felt sluggish.
  const selectedProjections = useMemo(() => {
    const out = {};
    selectedScenarios.forEach(id => {
      const scenario = scenarios.find(s => s.id === id);
      if (!scenario) return;
      const proj = generateScenarioProjections(scenario);
      const byAge = {};
      proj.forEach(r => { byAge[r.myAge] = r.totalPortfolio; });
      out[id] = byAge;
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedScenarios, scenarios]);

  const comparisonChartData = projections.slice(0, 51).map(p => {
    const dataPoint = { age: p.myAge, year: p.year, 'Current Plan': p.totalPortfolio };
    selectedScenarios.forEach(id => {
      const scenario = scenarios.find(s => s.id === id);
      if (scenario) dataPoint[scenario.name] = (selectedProjections[id] || {})[p.myAge] || 0;
    });
    return dataPoint;
  });

  const selectedScenarioObjs = selectedScenarios
    .map(id => scenarios.find(s => s.id === id)).filter(Boolean);
  // The chart keys series by NAME (that is what goes into the data rows), so the
  // tooltip has to get back from a name to the scenario that owns it.
  const nameToStyle = (name) => {
    const hit = scenarios.find(sc => sc.name === name);
    return hit ? styleForScenario(hit.id) : { stroke: THEME.inkMuted, strokeDasharray: undefined };
  };
  
  return (
    <div className="space-y-6">
      <div className={cardStyle}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h4 className="text-lg font-semibold text-amber-400">Saved Scenarios ({scenarios.length})</h4>
            {/* Scenarios and Plan history both hold copies of a plan and were
                easy to mistake for each other. Each now says what it is for. */}
            <p className="text-xs text-slate-500 mt-0.5">
              Alternatives you chose to keep, compared side by side against your plan. For undoing an edit,
              use Plan history in the sidebar.
            </p>
          </div>
          {onHide && (
            <button onClick={onHide}
              className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded hover:bg-slate-700/50 transition-colors">
              Hide
            </button>
          )}
        </div>
        {scenarios.length === 0 ? (
          <p className="text-slate-400 text-sm">
            No scenarios saved yet. Move the controls above until you have something worth keeping,
            then use <strong className="text-slate-300">Save as scenario</strong>.
          </p>
        ) : (
          <div className="space-y-3">
            {scenarios.map((scenario) => (
              <div key={scenario.id} className={`p-4 rounded-lg border ${selectedScenarios.includes(scenario.id) ? 'border-amber-500 bg-amber-500/10' : 'border-slate-700 bg-slate-800/50'}`}>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked={selectedScenarios.includes(scenario.id)}
                        onChange={() => toggleScenarioSelection(scenario.id)} className="w-4 h-4" />
                      {/* The line this scenario will draw, shown before you tick
                          it. Identity is never colour alone here either — the
                          swatch repeats the stroke pattern, and the name is
                          right beside it. */}
                      {(() => { const st = styleForScenario(scenario.id); return (
                        <svg width="20" height="8" aria-hidden="true" className="flex-none">
                          <line x1="0" y1="4" x2="20" y2="4" stroke={st.stroke} strokeWidth="2.5"
                                strokeDasharray={st.strokeDasharray} />
                        </svg>
                      ); })()}
                      <p className="font-medium text-slate-200">{scenario.name}</p>
                      {activeScenarioId === scenario.id && (
                        <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">Active</span>
                      )}
                    </div>
                    <p className="text-slate-400 text-xs mt-1">
                      Retirement age: {scenario.personalInfo.myRetirementAge} | Created: {new Date(scenario.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => loadScenario(scenario.id)} className={buttonSecondary + ' text-xs'}>Load</button>
                    <button onClick={() => deleteScenario(scenario.id)} className="text-red-400 hover:text-red-300 text-xs px-3 py-1">Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {scenarios.length > 0 && (
        <div className={cardStyle}>
          <h4 className="text-lg font-semibold text-amber-400 mb-4">Portfolio Comparison</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-2 px-3 text-slate-400">Scenario</th>
                  <th className="text-right py-2 px-3 text-slate-400">Retire Age</th>
                  <th className="text-right py-2 px-3 text-slate-400">Portfolio at 65</th>
                  <th className="text-right py-2 px-3 text-slate-400">Portfolio at 80</th>
                  <th className="text-right py-2 px-3 text-slate-400">Portfolio at {personalInfo.legacyAge || 95}</th>
                  <th className="text-right py-2 px-3 text-slate-400">Lifetime Taxes</th>
                  <th className="text-right py-2 px-3 text-slate-400">IRMAA</th>
                  <th className="text-right py-2 px-3 text-slate-400">Net Wealth</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-700/50 bg-amber-900/10">
                  <td className="py-2 px-3 text-amber-400 font-medium">Current Plan</td>
                  <td className="text-right py-2 px-3 text-slate-300">{personalInfo.myRetirementAge}</td>
                  <td className="text-right py-2 px-3 text-slate-200">{formatCurrency(currentSummary.projectedAt65)}</td>
                  <td className="text-right py-2 px-3 text-slate-200">{formatCurrency(currentSummary.projectedAt80)}</td>
                  <td className="text-right py-2 px-3 text-slate-200">{formatCurrency(currentSummary.projectedAt95)}</td>
                  <td className="text-right py-2 px-3 text-purple-400">{formatCurrency(currentSummary.lifetimeTax)}</td>
                  <td className="text-right py-2 px-3 text-red-400">{formatCurrency(currentSummary.lifetimeIRMAA)}</td>
                  <td className="text-right py-2 px-3 text-emerald-400 font-medium">{formatCurrency(currentSummary.netWealth)}</td>
                </tr>
                {scenarioSummaries.map(s => (
                  <tr key={s.id} className="border-b border-slate-700/50">
                    <td className="py-2 px-3 text-slate-200">{s.name}</td>
                    <td className="text-right py-2 px-3 text-slate-300">{s.personalInfo.myRetirementAge}</td>
                    <td className="text-right py-2 px-3 text-slate-200">{formatCurrency(s.projectedAt65)}</td>
                    <td className="text-right py-2 px-3 text-slate-200">{formatCurrency(s.projectedAt80)}</td>
                    <td className="text-right py-2 px-3 text-slate-200">{formatCurrency(s.projectedAt95)}</td>
                    <td className="text-right py-2 px-3 text-purple-400">{formatCurrency(s.lifetimeTax)}</td>
                    <td className="text-right py-2 px-3 text-red-400">{formatCurrency(s.lifetimeIRMAA)}</td>
                    <td className="text-right py-2 px-3 text-emerald-400 font-medium">{formatCurrency(s.netWealth)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {selectedScenarios.length > 0 && (
        <div className={cardStyle}>
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <h4 className="text-lg font-semibold text-amber-400">Portfolio Projection Comparison</h4>
            <span className="text-xs text-slate-500">{selectedScenarioObjs.length} scenario{selectedScenarioObjs.length === 1 ? '' : 's'} vs your plan</span>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Your age along the bottom, portfolio value up the side. Your current plan is the thick line —
            hover anywhere to see every scenario at that age, ranked, with its gap to your plan.
          </p>
          <ResponsiveContainer width="100%" height={420}>
            <LineChart data={comparisonChartData} margin={{ top: 8, right: 16, bottom: 28, left: 8 }}>
              {/* Solid hairline. A dashed grid reads as "projection" or
                  "threshold" and competes with the dashed scenario strokes,
                  which here carry actual meaning. */}
              <CartesianGrid stroke={THEME.grid} strokeWidth={1} vertical={false} />
              {/* No axis title. `insideBottom` puts it in the band the legend
                  already occupies — at every offset tried it landed on top of a
                  legend entry, and the legend wraps to a second row as soon as
                  there are more than about eight scenarios, so there is no
                  offset that is safe at all widths. The caption above the chart
                  names both axes instead. */}
              <XAxis dataKey="age" stroke={THEME.axis} />
              {/* Zero is neither M nor k. Formatting it as '$0k' made the axis
                  look like it had a rounding bug. */}
              <YAxis stroke={THEME.axis} width={70}
                     tickFormatter={(v) => !v ? '$0' : v >= 1000000 ? `$${(v / 1000000).toFixed(1)}M` : `$${Math.round(v / 1000)}k`} />
              <Tooltip content={<ScenarioComparisonTooltip styleFor={nameToStyle} />}
                       cursor={{ stroke: THEME.inkMuted, strokeWidth: 1, strokeDasharray: '4 4' }} />
              <Legend formatter={legendInk} iconType="plainline" wrapperStyle={{ paddingTop: 8 }} />
              <ReferenceLine x={personalInfo.myRetirementAge} stroke={THEME.reference} strokeDasharray="5 5"
                             label={{ value: 'Retire', fill: THEME.inkSecondary, fontSize: 11 }} />
              {/* Drawn FIRST so the scenarios sit on top of it: the baseline is
                  the thing being measured against, and a 3px line painted last
                  would hide whichever scenario happens to track it closely. */}
              {/* Animation off on purpose. Recharts animates a line by driving its
                  stroke-dasharray, which for a series that CARRIES a dash
                  pattern rewrites the attribute into a couple of hundred
                  generated segments — the second identity channel at the mercy
                  of the animator. The chart also redraws on every tick of a
                  checkbox, where a 1.5s grow-in is noise rather than delight. */}
              <Line type="monotone" dataKey="Current Plan" stroke={THEME.lines.target}
                    strokeWidth={3} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
              {selectedScenarioObjs.map(scenario => {
                const st = styleForScenario(scenario.id);
                return (
                  <Line key={scenario.id} type="monotone" dataKey={scenario.name}
                        stroke={st.stroke} strokeDasharray={st.strokeDasharray}
                        strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
          {scenarios.length > SCENARIO_STYLE_COUNT && (
            <p className="text-xs text-amber-400/80 mt-2">
              You have more saved scenarios than there are distinguishable line styles
              ({SCENARIO_STYLE_COUNT}). Beyond that the styles repeat — compare in batches.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

