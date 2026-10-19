// Every panel the app can draw, in one place. `render` adapts each component's
// own props from the shared ctx, so the registry can put any panel on any page
// without the panels having to agree on a signature they never needed.
// Every panel the registry renders gets its header from here, which is how a
// Hide button stops being something each entry has to remember. The bug this
// fixes was exactly that: two entries stubbed toggleVisibility to a no-op, so
// their Hide buttons rendered and did nothing, and three more had no Hide at all.
const PanelCard = ({ title, badge, onHide, children }) => (
  <div className={cardStyle}>
    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
      <div className="flex flex-wrap items-center gap-2">
        {title ? <h4 className="text-lg font-semibold text-slate-100">{title}</h4> : <span />}
        {badge}
      </div>
      {onHide && (
        <button onClick={onHide}
          className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded hover:bg-slate-700/50 transition-colors shrink-0"
          title="Hide this panel — turn it back on from the picker at the top">
          Hide
        </button>
      )}
    </div>
    {children}
  </div>
);

const PANEL_REGISTRY = [
  { id: 'summaryCards',     label: 'Headline summary cards',
    render: (ctx, badge, onHide) => <SummaryCardsPanel ctx={ctx} badge={badge} onHide={onHide} /> },
  { id: 'yearByYear',       label: 'Year by year — play the plan',
    render: (ctx, badge, onHide) => <YearTimelinePanel ctx={ctx} badge={badge} onHide={onHide} /> },
  { id: 'netWorth',         label: 'Net worth projection',
    render: (ctx, badge, onHide) => <NetWorthProjectionChart data={ctx.projections}
      personalInfo={ctx.personalInfo} retirementAge={ctx.retirementAge} badge={badge} onHide={onHide}
      focus={ctx.focus} /> },
  { id: 'retirementIncome', label: 'Income vs spending',
    render: (ctx, badge, onHide) => <IncomeVsSpendingChart data={ctx.projections}
      personalInfo={ctx.personalInfo} retirementAge={ctx.retirementAge} badge={badge} onHide={onHide}
      focus={ctx.focus} /> },
  { id: 'withdrawalRate',   label: 'Withdrawal rate over time',
    render: (ctx, badge, onHide) => <WithdrawalRatePanel ctx={ctx} badge={badge} onHide={onHide} /> },
  { id: 'taxSummary',       label: 'Lifetime tax summary',
    render: (ctx, badge, onHide) => <TaxSummaryPanel ctx={ctx} badge={badge} onHide={onHide} /> },
  { id: 'healthcare',       label: 'Healthcare cost projection',
    render: (ctx, badge, onHide) => <HealthcareCostPanel ctx={ctx} badge={badge} onHide={onHide} /> },
  { id: 'safeSpending',     label: 'Safe spending capacity',
    render: (ctx, badge, onHide) => <SafeSpendingPanel ctx={ctx} badge={badge} onHide={onHide} /> },
  { id: 'coastFire',        label: 'Coast FIRE progress',
    render: (ctx, badge, onHide) => <CoastFireSection accounts={ctx.accounts} personalInfo={ctx.personalInfo}
      projections={ctx.projections} openInfoCard={ctx.openInfoCard} toggleInfoCard={ctx.toggleInfoCard}
      toggleVisibility={onHide} retirementProjection={ctx.retirementProjection} badge={badge} /> },
  { id: 'lifestyleLegacy',  label: 'Lifestyle vs legacy',
    render: (ctx, badge, onHide) => <LifestyleVsLegacy accounts={ctx.accounts} assets={ctx.assets}
      computeProjections={ctx.computeProjections} incomeStreams={ctx.incomeStreams}
      oneTimeEvents={ctx.oneTimeEvents} personalInfo={ctx.personalInfo}
      projections={ctx.projections} recurringExpenses={ctx.recurringExpenses}
      retirementAge={ctx.retirementAge} openInfoCard={ctx.openInfoCard} toggleInfoCard={ctx.toggleInfoCard}
      toggleVisibility={onHide} badge={badge} /> },
  { id: 'cashFlow',         label: 'Annual cash flow',
    render: (ctx, badge, onHide) => <CashFlowPanel ctx={ctx} badge={badge} onHide={onHide} /> },

  // "What if you saved more?" was a registry entry here for one release. It is
  // gone: the Sandbox's own "Savings rate while working" slider asks the same
  // question against the same engine, alongside every other lever, and a second
  // savings slider inside a panel on the same page is a control that competes
  // with the one above it rather than adding anything.

  // From the Tax Planning tab. Same components that tab renders, so a change to
  // one lands in both places.
  { id: 'tp_conversionYears', label: 'Roth conversion opportunity by year',
    render: (ctx, badge, onHide) => (
      <PanelCard title="Roth Conversion Opportunity by Year" badge={badge} onHide={onHide}>
        <ConversionOpportunityPanel ctx={ctx} />
      </PanelCard>) },
  { id: 'tp_marginalIrmaa',   label: 'Marginal tax impact & IRMAA',
    render: (ctx, badge, onHide) => (
      <PanelCard title="Marginal Tax Impact &amp; IRMAA" badge={badge} onHide={onHide}>
        <MarginalIrmaaPanel ctx={ctx} />
      </PanelCard>) },
  { id: 'tp_charitable',      label: 'What your charitable giving saves',
    render: (ctx, badge, onHide) => (
      <PanelCard title="What Your Charitable Giving Saves" badge={badge} onHide={onHide}>
        <CharitableGivingPanel ctx={ctx} />
      </PanelCard>) },
];

// The name a panel goes by in the Panels picker, which is also what a hidden
// panel's note calls it, so the note names the same thing the picker lists.
const panelLabel = (id) => ((PANEL_REGISTRY.find(e => e.id === id) || SANDBOX_EXTRA_PANELS.find(e => e.id === id) || {}).label) || id;

// What a panel hidden from its own header leaves behind for the rest of the
// visit: where it was, how to get it back, and where all panels come back from.
const HiddenPanelNote = ({ label, onShow, onDismiss }) => (
  <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 rounded-lg border border-dashed border-slate-600 text-sm text-slate-400">
    <span><span className="text-slate-200">{label}</span> is hidden.</span>
    <button onClick={onShow}
      className="px-2.5 py-0.5 rounded border border-slate-500 text-slate-200 hover:bg-slate-700/60 transition-colors">
      Show it again
    </button>
    <span className="text-xs text-slate-500">Any hidden panel can also come back from <strong className="text-slate-400">Panels</strong> at the top of this page.</span>
    <button onClick={onDismiss} aria-label="Dismiss this note" title="Dismiss this note — the panel stays hidden"
      className="ml-auto text-slate-500 hover:text-slate-300 px-1">×</button>
  </div>
);

// The per-year bracket / conversion-room table the Tax Planning panels read.
// Hoisted to module scope so a panel that needs it can be rendered anywhere
// — it is a pure function of the projection and the plan, and was only ever
// inside the tab because that is where it was first written.
const buildTaxPlanningRows = (projections, personalInfo, ageRange) => {
  // The age window is the CALLER's: the tab has a pair of inputs for it, and a
  // panel rendered elsewhere just wants the whole plan.
  const from = (ageRange && Number.isFinite(ageRange.start)) ? ageRange.start : -Infinity;
  const to = (ageRange && Number.isFinite(ageRange.end)) ? ageRange.end : Infinity;
  return projections
    .filter(p => p.myAge >= from && p.myAge <= to)
    .map(p => {
      // Tax clock: bracket edges and the deduction fallback index from
      // BASE_TAX_YEAR, not from the user's current age. See engine BASE_TAX_YEAR.
      const inflationFactor = indexTo(1, p.year - BASE_TAX_YEAR, personalInfo.inflationRate);
      const baseBrackets = FEDERAL_TAX_BRACKETS_2026[personalInfo.filingStatus] || FEDERAL_TAX_BRACKETS_2026.married_joint;
      // The engine's own deduction for this year — includes the age-65 additional
      // standard deduction and the OBBBA senior deduction, which a bare
      // STANDARD_DEDUCTION_2026 lookup would miss for anyone 65+.
      const adjustedDeduction = p.federalDeduction
        ?? ((STANDARD_DEDUCTION_2026[personalInfo.filingStatus] || STANDARD_DEDUCTION_2026.married_joint) * inflationFactor);
      
      // Use the projection engine's actual taxableIncome — this already includes the real
      // taxable SS amount (not the flat 85% approximation), all portfolio withdrawals,
      // RMDs, and the planned Roth conversion. This ensures the Bracket column and
      // Room figures are consistent with what the engine actually computed.
      const plannedConversion = p.rothConversion || 0;
      const conversionTaxDraw = p.conversionTaxWithdrawal || 0;
      // NOTE: p.taxableIncome is AGI — BEFORE the deduction and INCLUDING capital
      // gains and dividends. Bracket tops are post-deduction ORDINARY taxable
      // income, so comparing the two directly (as this did) placed users a bracket
      // or more too high and understated every "room to" figure. Build the right
      // basis here: strip preferential income, then subtract the deduction.
      const taxableIncome = p.taxableIncome; // AGI — used for the gross-income chart only
      // Income taxed at preferential rates: qualified dividends plus realized
      // long-term gains, both reported directly by the engine.
      //
      // This was previously DERIVED as taxableIncome − nonSSIncome − taxableSS,
      // because realizedCapitalGains did not exist on the row yet. That
      // expression actually equals (withdrawal ordinary income + preferential −
      // preTaxDeduction), so it subtracted every dollar of pre-tax withdrawal and
      // Roth conversion out of the ordinary base — a year converting $200k into
      // the 24% bracket was reported as sitting in the 12%.
      const preferentialIncome = (p.brokerageDividends || 0) + (p.realizedCapitalGains || 0);
      const ordinaryTaxable = Math.max(0, (p.taxableIncome || 0) - preferentialIncome - adjustedDeduction);

      // Gross income for chart display (SS shown at 85% is a display approximation only).
      // Includes the extra draw that pays the conversion's tax bill — it's ordinary
      // income like any other pre-tax withdrawal, so leaving it out made taxable
      // income appear to exceed gross income in conversion years.
      const grossIncome = p.earnedIncome + p.socialSecurity * 0.85 + p.pension + p.otherIncome + p.portfolioWithdrawal + plannedConversion + conversionTaxDraw;
      
      // Bracket thresholds are in terms of taxable income, so add back deduction for display
      // This shows where income needs to be (gross) to hit each bracket
      const bracket10 = baseBrackets[0].max * inflationFactor + adjustedDeduction;
      const bracket12 = baseBrackets[1].max * inflationFactor + adjustedDeduction;
      const bracket22 = baseBrackets[2].max * inflationFactor + adjustedDeduction;
      const bracket24 = baseBrackets[3].max * inflationFactor + adjustedDeduction;
      const bracket32 = baseBrackets[4].max * inflationFactor + adjustedDeduction;
      const bracket35 = baseBrackets[5].max * inflationFactor + adjustedDeduction;
      
      // Calculate room in each bracket (space before hitting next bracket)
      // taxableIncome already set above from engine output
      // "Room to 22%" = how much more can be added before crossing into 22% bracket
      // "Room to 24%" = how much more can be added before crossing into 24% bracket (from current position)
      const cap10  = baseBrackets[0].max * inflationFactor;
      const cap12  = baseBrackets[1].max * inflationFactor;
      const cap22  = baseBrackets[2].max * inflationFactor;
      const cap24  = baseBrackets[3].max * inflationFactor;
      const cap32  = baseBrackets[4].max * inflationFactor;
      const cap35  = baseBrackets[5].max * inflationFactor;

      let currentBracket = '10%';
      let roomInBracket = 0;
      // roomTo22: additional income before entering the 22% bracket (0 if already in 22%+)
      const roomTo22 = Math.max(0, cap12 - ordinaryTaxable);
      // roomTo24: additional income before entering the 24% bracket (0 if already in 24%+)
      const roomTo24 = Math.max(0, cap24 - ordinaryTaxable);

      if (ordinaryTaxable <= cap10) {
        currentBracket = '10%';
        roomInBracket = cap10 - ordinaryTaxable;
      } else if (ordinaryTaxable <= cap12) {
        currentBracket = '12%';
        roomInBracket = cap12 - ordinaryTaxable;
      } else if (ordinaryTaxable <= cap22) {
        currentBracket = '22%';
        roomInBracket = cap22 - ordinaryTaxable;
      } else if (ordinaryTaxable <= cap24) {
        currentBracket = '24%';
        roomInBracket = cap24 - ordinaryTaxable;
      } else if (ordinaryTaxable <= cap32) {
        currentBracket = '32%';
        roomInBracket = cap32 - ordinaryTaxable;
      } else if (ordinaryTaxable <= cap35) {
        currentBracket = '35%';
        roomInBracket = cap35 - ordinaryTaxable;
      } else {
        currentBracket = '37%';
        roomInBracket = 0;
      }
      
      // IRMAA data from unified engine (avoids independent recalculation)
      const distToNextIRMAA = p.irmaaInfo?.distToNextTier || null;
      const currentIRMAATier = p.irmaaInfo?.tier || 0;
      const currentIRMAAannual = p.irmaaInfo?.totalAnnual || 0;
      const currentMAGI = Math.round(p.magi || 0);

      return {
        myAge: p.myAge,
        year: p.year,
        earnedIncome: p.earnedIncome,
        socialSecurity: Math.round(p.socialSecurity * 0.85),
        pension: p.pension,
        otherIncome: p.otherIncome,
        portfolioWithdrawal: p.portfolioWithdrawal,
        // Split for the chart: the RMD is the mandatory slice of portfolioWithdrawal.
        // Both figures are amounts actually distributed, and the engine builds the
        // withdrawal as RMD + voluntary draw, so RMD ≤ withdrawal always holds —
        // including in a year where the portfolio ran short of the spending target.
        rmd: Math.round(p.rmd || 0),
        voluntaryWithdrawal: Math.round(Math.max(0, p.portfolioWithdrawal - (p.rmd || 0))),
        plannedConversion: Math.round(plannedConversion),
        conversionTaxWithdrawal: Math.round(conversionTaxDraw),
        grossIncome: Math.round(grossIncome),
        standardDeduction: Math.round(adjustedDeduction),
        taxableIncome: Math.round(taxableIncome),
        bracket10,
        bracket12,
        bracket22,
        bracket24,
        bracket32,
        bracket35,
        currentBracket,
        roomInBracket: Math.round(Math.max(0, roomInBracket)),
        roomTo22: Math.round(Math.max(0, roomTo22)),
        roomTo24: Math.round(Math.max(0, roomTo24)),
        // IRMAA fields (used by RothConversionSimulator)
        currentIRMAATier,
        currentIRMAAannual,
        distToNextIRMAA,
        currentMAGI,
      };
    });
  
};

// ── PORTABLE PANELS FROM THE OTHER TABS ──────────────────────────────────────
// Same contract as the Dashboard panels: one `ctx`, one definition, rendered on
// its own tab and in the Sandbox. Each derives what it needs from the plan
// rather than from its tab's closure, which is what makes it portable at all.
//
// Only panels that are a pure function of the plan are here. The Monte Carlo
// outcome charts and the Social Security claiming grid are deliberately absent:
// they render a worker's simulation results, and a copy of one in the Sandbox
// would either show nothing or show a figure computed for a different scenario
// than the controls describe. Both are worse than not offering them.
function MarginalIrmaaPanel({ ctx }) {
  const { projections, personalInfo, accounts } = ctx;
  const [openInfoCard, setOpenInfoCard] = useState(null);
  const toggleInfoCard = (id) => setOpenInfoCard(v => (v === id ? null : id));
  return (
    <>
      {(() => {
        // Priced by the engine's own marginalCostOfNextDollar, the same function
        // behind the Tax Planning tab's "Next Dollar" card. This card used to
        // rebuild all of it by hand and got two things wrong that showed up as
        // blank columns:
        //
        //   MAGI was hand-assembled from gross Social Security and the whole
        //   portfolio withdrawal — but IRMAA is measured on AGI, which contains
        //   only the TAXABLE part of the benefit and none of a Roth draw or a
        //   return of brokerage basis. The row already carries a correct `magi`.
        //
        //   And the probe collided with the engine's own IRMAA_FILL_SAFETY_MARGIN.
        //   A year converting up to an IRMAA ceiling stops $1,000 short of it by
        //   design, so a +$1,000 probe landed EXACTLY on the edge — where the
        //   tier has not flipped yet — and reported no IRMAA cost at all in
        //   precisely the years built to sit against that edge.
        const computeMarginalForAge = (targetAge) => {
          const p = projections.find(pr => pr.myAge === targetAge);
          if (!p) return null;
          const m = marginalCostOfNextDollar({ row: p, pi: personalInfo, probe: 1000 });
          if (!m) return null;
          const irmaaEdge = (m.nextThresholds || []).find(t => /IRMAA/.test(t.label));
          const ss = p.socialSecurity || 0;
          return {
            age: targetAge,
            rate: Math.round(m.rate * 1000) / 10,
            fed: Math.round(m.ratePoints.bracket * 1000) / 10,
            state: Math.round(m.ratePoints.state * 1000) / 10,
            ssTorpedo: Math.round(m.ratePoints.ssTorpedo * 1000) / 10,
            irmaa: Math.round(m.ratePoints.irmaa * 1000) / 10,
            irmaaAnnual: p.irmaaSurcharge || 0,
            // Everything the blank cells needed in order to say something true.
            hasSS: ss > 0,
            ssShareBefore: m.detail.ssTaxableShareBefore,
            ssMaxedOut: m.detail.ssTaxableShareBefore !== null && m.detail.ssTaxableShareBefore >= 0.8499,
            medicareAge: targetAge >= 65,
            irmaaEdgeDistance: irmaaEdge ? irmaaEdge.distance : null,
            crossedIrmaaEdge: !!m.detail.crossedIrmaaEdge,
            // What this year's income does to the surcharge two years out. The
            // whole reason the mid-60s matter, and it was nowhere on screen.
            setsIrmaaAtAge: targetAge + (IRMAA_TIER_LOOKBACK_YEARS || 2),
            irmaaReachable: targetAge + (IRMAA_TIER_LOOKBACK_YEARS || 2) >= 65,
            // What crossing actually costs, in dollars. Expressing a cliff as a
            // percentage of the probe is arbitrary — the same crossing reads
            // 400% against $1,000 and 40% against $10,000 — so the dollar figure
            // is the one that means anything.
            irmaaCrossCost: m.components.irmaa,
          };
        };
        
        const currentMarg = computeMarginalForAge(personalInfo.myAge);
        // Decision-relevant ages, not an every-five-years grid. The old list —
        // now, 70, 75, 80, 85, 90 — skipped the only years where the answer is
        // still open. For a 53-year-old it showed 53 and then nothing until 70,
        // missing the entire window this card exists to inform.
        //
        // The hinge is the two-year lookback: the MAGI you report at 63 sets the
        // Medicare surcharge you pay at 65. That makes 63 the first year a
        // withdrawal or conversion can cost you IRMAA at all, and 62 the last
        // year one is free. Those two ages decide more than every later row
        // combined, and neither was ever shown.
        const rmdAge = getRmdStartAge(personalInfo.myBirthYear || (new Date().getFullYear() - personalInfo.myAge));
        const lookback = IRMAA_TIER_LOOKBACK_YEARS || 2;
        const ages = [...new Set([
          personalInfo.myAge,                    // where you are now
          personalInfo.myRetirementAge,          // income changes shape
          65 - lookback - 1,                     // last year invisible to IRMAA (62)
          65 - lookback,                         // first year that sets a surcharge (63)
          65,                                    // Medicare starts; the first bill lands
          rmdAge,                                // income you no longer choose
          rmdAge + 5,
          85,
        ])]
          .filter(a => Number.isFinite(a) && a >= personalInfo.myAge)
          .sort((a, b) => a - b);
        const marginals = ages.map(computeMarginalForAge).filter(Boolean);
        
        return (
          <div>
            {/* No card and no title here: on the Tax Planning tab the Section
                supplies both, and on the Dashboard the registry does. A panel that
                drew its own would show the heading twice on one of them — which
                it did, until the rendered page said so. */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <>
                <InfoCard
                  title="Marginal Tax Impact & IRMAA"
                  isOpen={openInfoCard === 'marginalRates'}
                  onToggle={() => toggleInfoCard('marginalRates')}
                  sections={[
                    {
                      heading: 'What This Shows',
                      body: 'This card shows the TRUE cost of withdrawing an extra $1,000 from your pre-tax retirement accounts at different ages. The "true marginal rate" includes not just your tax bracket, but also the hidden costs: Social Security becoming more taxable (the "torpedo" effect) and potential IRMAA surcharges on Medicare premiums.'
                    },
                    {
                      heading: 'SS Tax Torpedo',
                      body: 'When your income rises, more of your Social Security becomes taxable (up to 85%). This creates a "torpedo zone" where each extra dollar of withdrawal effectively gets taxed at a much higher rate than your bracket suggests — sometimes 1.5x to 1.85x your marginal bracket.'
                    },
                    {
                      heading: 'IRMAA Impact',
                      body: 'Medicare Income-Related Monthly Adjustment Amount (IRMAA) adds surcharges to your Part B and Part D premiums when your MAGI exceeds certain thresholds. These are cliff-based — crossing a threshold by even $1 triggers the full surcharge for the year. The "Distance to Next Tier" shows how much room you have.'
                    },
                    {
                      heading: 'How to Use This',
                      body: 'Use this to plan Roth conversions — convert in years when your true marginal rate is lowest. Avoid pushing income into IRMAA tiers. The best conversion years are typically early retirement before Social Security and RMDs begin.',
                      tip: 'See the Taxes & Roth tab for a full year-by-year bracket analysis.'
                    }
                  ]}
                />
              <span className="text-xs text-slate-500">Cost per extra $1,000 withdrawn</span>
              </>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
              <div className="border rounded-lg px-4 py-3 bg-amber-500/10 border-amber-500/30">
                <div className="text-slate-400 text-xs mb-0.5">True Marginal Rate (Now)</div>
                <div className={`text-2xl font-bold ${(currentMarg?.rate || 0) > 35 ? 'text-red-400' : (currentMarg?.rate || 0) > 25 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {currentMarg?.crossedIrmaaEdge
                    ? formatCurrency(currentMarg.irmaaCrossCost + (currentMarg.rate - currentMarg.irmaa) * 10)
                    : `${currentMarg?.rate || 0}%`}
                </div>
                <div className="text-xs text-slate-500">
                  {currentMarg?.crossedIrmaaEdge
                    ? `Age ${personalInfo.myAge} — you sit on an IRMAA edge; the next $1K tips a tier`
                    : `Age ${personalInfo.myAge} — each extra $1K costs $${Math.round((currentMarg?.rate || 0) * 10)}`}
                </div>
              </div>
              <div className="border rounded-lg px-4 py-3 bg-purple-500/10 border-purple-500/30">
                <div className="text-slate-400 text-xs mb-0.5">SS Tax Torpedo</div>
                <div className="text-2xl font-bold text-purple-400">
                  {currentMarg?.ssMaxedOut ? '85%' : `${currentMarg?.ssTorpedo || 0}%`}
                </div>
                <div className="text-xs text-slate-500">
                  {currentMarg?.ssMaxedOut ? 'Already at the statutory maximum — no more to drag in'
                    : (currentMarg?.ssTorpedo || 0) > 0 ? 'Extra withdrawals make SS taxable'
                    : !currentMarg?.hasSS ? 'Not collecting Social Security yet'
                    : `${Math.round((currentMarg?.ssShareBefore || 0) * 100)}% taxable — the next $1K adds none`}
                </div>
              </div>
              <div className="border rounded-lg px-4 py-3 bg-pink-500/10 border-pink-500/30">
                <div className="text-slate-400 text-xs mb-0.5">IRMAA Surcharge</div>
                <div className="text-2xl font-bold text-pink-400">{currentMarg?.irmaaAnnual > 0 ? formatCurrency(currentMarg.irmaaAnnual) : '$0'}<span className="text-sm text-slate-400">/yr</span></div>
                <div className="text-xs text-slate-500">Tier {currentMarg?.irmaaTier || 0}{currentMarg?.irmaa > 0 ? ' — near next cliff!' : ''}</div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-1 px-2 text-slate-400">Age</th>
                    <th className="text-left py-1 px-2 text-slate-400">Sets IRMAA at</th>
                    <th className="text-right py-1 px-2 text-red-400">Federal</th>
                    <th className="text-right py-1 px-2 text-orange-400">State</th>
                    <th className="text-right py-1 px-2 text-purple-400">SS Torpedo</th>
                    <th className="text-right py-1 px-2 text-pink-400">IRMAA</th>
                    <th className="text-right py-1 px-2 text-amber-400 font-bold">True Rate</th>
                    <th className="text-right py-1 px-2 text-slate-400">$/yr IRMAA</th>
                  </tr>
                </thead>
                <tbody>
                  {marginals.map((m, i) => (
                    <tr key={i} className={`border-b border-slate-700/50 ${i === 0 ? 'bg-amber-900/10' : ''}`}>
                      <td className="py-1 px-2 text-slate-100 font-medium">{m.age}</td>
                      <td className="py-1 px-2">
                        {m.irmaaReachable ? (
                          <span className="text-pink-400/90">age {m.setsIrmaaAtAge}</span>
                        ) : (
                          <span className="text-emerald-400" title={`Income this year sets the surcharge at ${m.setsIrmaaAtAge}, which is before Medicare — it cannot cost you anything`}>
                            free
                          </span>
                        )}
                      </td>
                      <td className="py-1 px-2 text-right text-red-400">{m.fed}%</td>
                      <td className="py-1 px-2 text-right text-orange-400">{m.state}%</td>
                      {/* A zero here has three different meanings and a dash
                          told them apart from nothing. "Already 85%" is the
                          common one and the one that reads as a bug: the torpedo
                          costs nothing more precisely because it has already
                          done its worst. */}
                      <td className="py-1 px-2 text-right text-purple-400">
                        {m.ssTorpedo > 0 ? `${m.ssTorpedo}%`
                          : !m.hasSS ? <span className="text-slate-500" title="Not collecting Social Security yet">—</span>
                          : m.ssMaxedOut ? <span className="text-slate-500 text-[10px]" title="85% of your benefit is already taxable — the statutory maximum. The next dollar cannot drag any more of it in.">85% maxed</span>
                          : <span className="text-slate-500" title={`${Math.round((m.ssShareBefore || 0) * 100)}% of your benefit is taxable; the next $1,000 does not add to it`}>0%</span>}
                      </td>
                      <td className="py-1 px-2 text-right text-pink-400">
                        {m.irmaa > 0 ? `${m.irmaa}%`
                          : !m.medicareAge ? <span className="text-slate-500" title="IRMAA applies from age 65">—</span>
                          : m.irmaaEdgeDistance !== null && m.irmaaEdgeDistance <= 25000
                            ? <span className="text-amber-500/80 text-[10px]" title="No surcharge on the next $1,000, but the next tier is close — crossing it costs the full tier, not a rate">
                                {formatCurrency(m.irmaaEdgeDistance)} to edge
                              </span>
                            : <span className="text-slate-500" title="Comfortably inside an IRMAA tier — the next $1,000 crosses nothing">0%</span>}
                      </td>
                      {/* A crossing year is not a "rate" year. The surcharge is a
                          fixed step, so the percentage is an artefact of the
                          $1,000 probe — the dollar cost is the real quantity and
                          the badge stops the number being read as a tax rate. */}
                      <td className={`py-1 px-2 text-right font-bold ${m.rate > 35 ? 'text-red-400' : m.rate > 25 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {m.crossedIrmaaEdge ? (
                          <span title={`This year sits against an IRMAA edge. The next $1,000 tips you into the higher tier, which costs ${formatCurrency(m.irmaaCrossCost)} for the year — a one-time step, not a rate every dollar pays.`}>
                            <span className="text-[10px] bg-pink-500/20 text-pink-300 px-1 py-0.5 rounded mr-1">cliff</span>
                            {formatCurrency(m.irmaaCrossCost)}
                          </span>
                        ) : `${m.rate}%`}
                      </td>
                      <td className="py-1 px-2 text-right text-slate-400">{m.irmaaAnnual > 0 ? formatCurrency(m.irmaaAnnual) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Ages shown are the ones where the decision is still open, not a five-year grid.{' '}
              <strong>&ldquo;Sets IRMAA at&rdquo;</strong> is the hinge: Medicare reads the MAGI you
              reported <em>two years earlier</em>, so income at {65 - (IRMAA_TIER_LOOKBACK_YEARS || 2) - 1} and
              before is marked <span className="text-emerald-400">free</span> — it lands before Medicare
              and cannot cost a surcharge, however large. Age {65 - (IRMAA_TIER_LOOKBACK_YEARS || 2)} is the
              first year a withdrawal or conversion can, which makes it the single most consequential year
              on this table and the one a five-year grid always skipped.
              True Rate = combined impact of federal tax, state tax, SS becoming taxable, and IRMAA
              surcharges on each extra $1,000 of pre-tax withdrawal. <strong>&ldquo;85% maxed&rdquo;</strong> means
              the torpedo has already done its worst — 85% of the benefit is taxable, the statutory
              ceiling, so the next dollar cannot drag in any more. IRMAA is a <em>cliff</em>, not a rate:
              a year can show 0% and still sit a few thousand dollars from an edge that costs a full tier
              to cross, which is why the distance is shown instead of a dash. See the Taxes & Roth tab for
              full year-by-year detail. Rows marked <strong>cliff</strong> sit right against an IRMAA edge —
              usually because the plan is deliberately converting up to it. There the next $1,000 tips you
              into the next tier and the cost shown is the <em>dollar</em> step for that year, not a rate:
              the same crossing would read 400% against a $1,000 test and 40% against a $10,000 one, so the
              percentage would tell you nothing.
            </p>
          </div>
        );
      })()}
    </>
  );
}

function ConversionOpportunityPanel({ ctx }) {
  const { projections, personalInfo, retirementAge } = ctx;
  const taxPlanningData = useMemo(
    () => buildTaxPlanningRows(projections, personalInfo), [projections, personalInfo]);
  return (
    <>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-2 px-2 text-slate-400">Age</th>
                <th className="text-left py-2 px-2 text-slate-400">Year</th>
                <th className="text-right py-2 px-2 text-slate-400">Gross Income</th>
                <th className="text-right py-2 px-2" style={{ color: SERIES.rmd }}>RMD</th>
                <th className="text-right py-2 px-2 text-slate-400">Std Deduction</th>
                <th className="text-right py-2 px-2 text-slate-400">Taxable Income</th>
                <th className="text-right py-2 px-2" style={{ color: SERIES.rothConversion }}>Planned Conv.</th>
                <th className="text-center py-2 px-2 text-slate-400">Bracket</th>
                <th className="text-right py-2 px-2 text-slate-400">Room to 22%</th>
                <th className="text-right py-2 px-2 text-slate-400">Room to 24%</th>
              </tr>
            </thead>
            <tbody>
              {taxPlanningData.filter(d => d.myAge >= retirementAge - 2).slice(0, 20).map((row, idx) => (
                <tr key={idx} className={`border-b border-slate-700/50 ${
                  row.plannedConversion > 0 ? 'bg-purple-900/15' :
                  row.myAge >= retirementAge && row.myAge < retirementAge + 10 ? 'bg-emerald-900/20' :
                  idx % 2 === 0 ? 'bg-slate-800/30' : ''
                }`}>
                  <td className="py-2 px-2 text-slate-100 font-medium">{row.myAge}</td>
                  <td className="py-2 px-2 text-slate-300">{row.year}</td>
                  <td className="py-2 px-2 text-right text-slate-300">{formatCurrency(row.grossIncome)}</td>
                  <td className="py-2 px-2 text-right" style={{ color: SERIES.rmd }}>{row.rmd > 0 ? formatCurrency(row.rmd) : '—'}</td>
                  <td className="py-2 px-2 text-right text-slate-500">{formatCurrency(row.standardDeduction)}</td>
                  <td className="py-2 px-2 text-right text-amber-400">{formatCurrency(row.taxableIncome)}</td>
                  <td className="py-2 px-2 text-right font-medium" style={{ color: SERIES.rothConversion }}>
                    {row.plannedConversion > 0 ? formatCurrency(row.plannedConversion) : '—'}
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      row.currentBracket === '10%' ? 'bg-emerald-500/20 text-emerald-400' :
                      row.currentBracket === '12%' ? 'bg-green-500/20 text-green-400' :
                      row.currentBracket === '22%' ? 'bg-yellow-500/20 text-yellow-400' :
                      row.currentBracket === '24%' ? 'bg-orange-500/20 text-orange-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {row.currentBracket}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right text-emerald-400 font-medium">
                    {row.roomTo22 > 0 ? formatCurrency(row.roomTo22) : '—'}
                  </td>
                  <td className="py-2 px-2 text-right text-sky-400">
                    {row.roomTo24 > 0 ? formatCurrency(row.roomTo24) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          💡 <strong>Roth Conversion Strategy:</strong> The highlighted rows (first 10 years of retirement) often present the best Roth conversion opportunities.
          <strong className="text-purple-400"> Purple rows</strong> show years where a planned conversion is already executing — the Taxable Income and Room columns already include that conversion, so Room shows what's <em>still available</em> above your planned amount.
          {conversionIsActive(personalInfo) && (
            <span className="text-purple-400"> Your planned conversion is active (ages {personalInfo.rothConversionStartAge || getDefaultRothConversionWindow(personalInfo).startAge}–{personalInfo.rothConversionEndAge || getDefaultRothConversionWindow(personalInfo).endAge}{`, ${conversionModeLabel(personalInfo)}`}).</span>
          )}
        </p>
    </>
  );
}

function CharitableGivingPanel({ ctx }) {
  const { personalInfo, accounts, incomeStreams, assets, oneTimeEvents, recurringExpenses } = ctx;
  const qcdSavings = useMemo(() => qcdTaxSavings({
    pi: personalInfo, accts: accounts, streams: incomeStreams, assetList: assets,
    events: oneTimeEvents, recurring: recurringExpenses,
    currentYear: new Date().getFullYear(),
  }), [personalInfo, accounts, incomeStreams, assets, oneTimeEvents, recurringExpenses]);
  if (!(qcdSavings && qcdSavings.totalQcd > 0)) return null;
  return (
    <>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">QCD</span>
          </div>
          <p className="text-xs text-slate-400 mb-4 leading-relaxed">
            Measured by running your plan twice — identical but for the qualified charitable distribution
            exclusion. Ages {qcdSavings.firstQcdAge}–{qcdSavings.lastQcdAge}.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
              <div className="text-slate-500 text-xs mb-0.5">Given straight from the IRA</div>
              <div className="text-lg font-bold text-slate-100">{formatCurrency(qcdSavings.totalQcd)}</div>
              <div className="text-xs text-slate-500">never enters your income</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
              <div className="text-slate-500 text-xs mb-0.5">Lifetime tax avoided</div>
              <div className="text-lg font-bold text-emerald-400">{formatCurrency(qcdSavings.lifetimeTaxSaved)}</div>
              <div className="text-xs text-slate-500">{formatCurrency(qcdSavings.lifetimeTaxSavedReal)} in today's dollars</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
              <div className="text-slate-500 text-xs mb-0.5">Saved per dollar given</div>
              <div className="text-lg font-bold text-emerald-400">
                {qcdSavings.blendedRate !== null ? `${(qcdSavings.blendedRate * 100).toFixed(0)}¢` : '—'}
              </div>
              <div className="text-xs text-slate-500">all-in, not just the bracket</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
              <div className="text-slate-500 text-xs mb-0.5">Portfolio at age {personalInfo.legacyAge || 95}</div>
              <div className="text-lg font-bold text-emerald-400">+{formatCurrency(qcdSavings.endingPortfolioDelta)}</div>
              <div className="text-xs text-slate-500">tax not paid, still compounding</div>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-3 leading-relaxed">
            The per-dollar figure is usually well above your tax bracket, and that is the point. The
            exclusion keeps the money out of AGI entirely, so it also avoids the Social Security those
            dollars would have dragged into tax, any Medicare surcharge two years later, and the senior
            deduction a higher AGI would have phased out. Giving the same amount by cheque from a taxable
            account saves none of it: with the standard deduction the gift never reaches Schedule A, so it
            buys no deduction at all
            {qcdSavings.lifetimeIrmaaSaved > 0 && <>. Medicare surcharges avoided: {formatCurrency(qcdSavings.lifetimeIrmaaSaved)}</>}.
          </p>
    </>
  );
}

// The healthcare card was the one thing on the old Dashboard written inline
// rather than as a panel, which is why it could not be hidden and never
// reached the what-if levers. As a panel it reads the retirement age from ctx,
// so moving that lever moves the window it sums over — it summed from the
// SAVED plan's age before, which was right only while nothing could move it.
// Renders nothing when the plan does not model healthcare, so it can sit on
// the default list without leaving an empty card behind.
function HealthcareCostPanel({ ctx, badge, onHide }) {
  const { projections, personalInfo } = ctx;
  if (!healthcareCostsModeled(personalInfo)) return null;
  const retirementYears = projections.filter(p => p.myAge >= ctx.retirementAge);
  const lifetimeHealthcare = retirementYears.reduce((sum, p) => sum + (p.healthcareExpense || 0), 0);
  const lifetimePre65 = retirementYears.reduce((sum, p) => sum + (p.healthcarePre65 || 0), 0);
  const lifetimeMedicare = retirementYears.reduce((sum, p) => sum + (p.healthcareMedicare || 0), 0);
  const lifetimeLTC = retirementYears.reduce((sum, p) => sum + (p.healthcareLTC || 0), 0);
  const lifetimeIRMAA = retirementYears.reduce((sum, p) => sum + (p.irmaaSurcharge || 0), 0);
  const peakYear = retirementYears.reduce((max, p) => (p.healthcareExpense || 0) > (max.healthcareExpense || 0) ? p : max, retirementYears[0] || {});

  return (
    <PanelCard title="Healthcare Cost Projection" badge={badge} onHide={onHide}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">Lifetime Healthcare</div>
          <div className="text-xl font-bold text-pink-400">{formatCurrency(lifetimeHealthcare)}</div>
          <div className="text-xs text-slate-500">Retirement years only</div>
        </div>
        {lifetimePre65 > 0 && (
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs text-slate-400 mb-1">Pre-Medicare (before 65)</div>
            <div className="text-lg font-bold text-orange-400">{formatCurrency(lifetimePre65)}</div>
          </div>
        )}
        <div className="bg-slate-800/50 rounded-lg p-3">
          <div className="text-xs text-slate-400 mb-1">Medicare + OOP</div>
          <div className="text-lg font-bold text-blue-400">{formatCurrency(lifetimeMedicare)}</div>
          <div className="text-xs text-slate-500">+{formatCurrency(lifetimeIRMAA)} IRMAA</div>
        </div>
        {lifetimeLTC > 0 && (
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs text-slate-400 mb-1">Long-Term Care</div>
            <div className="text-lg font-bold text-red-400">{formatCurrency(lifetimeLTC)}</div>
          </div>
        )}
      </div>
      {peakYear && peakYear.healthcareExpense > 0 && (
        <p className="text-xs text-slate-400">
          Peak healthcare year: age {peakYear.myAge} at {formatCurrency(peakYear.healthcareExpense)}/yr. 
          Model: {HEALTHCARE_PRESETS[personalInfo.healthcareModel]?.label}. 
          Medical inflation: {((personalInfo.medicalInflation || 0.05) * 100).toFixed(1)}%.
        </p>
      )}
    </PanelCard>
  );
}

