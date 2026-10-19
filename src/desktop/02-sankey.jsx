// ============================================
// Sankey Diagram Component for Cash Flow Visualization
// ============================================
const SankeyDiagram = React.memo(({ data, width = 900, height = 500 }) => {
  const { income, expenses, title } = data;
  
  // Calculate positions and dimensions
  const padding = { top: 40, right: 150, bottom: 40, left: 150 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  // Income sources on the left - guard against division by zero
  const incomeTotal = income.reduce((sum, item) => sum + item.value, 0);
  
  // Expenses on the right - guard against division by zero
  const expenseTotal = expenses.reduce((sum, item) => sum + item.value, 0);
  
  // Early return if no data to display
  if (incomeTotal === 0 || expenseTotal === 0 || income.length === 0 || expenses.length === 0) {
    return (
      <svg width={width} height={height} style={{ background: 'transparent' }}>
        <text x={width / 2} y={height / 2} textAnchor="middle" fill={THEME.inkMuted} fontSize="14">
          No cash flow data to display
        </text>
      </svg>
    );
  }
  
  // Calculate vertical positions for income sources
  let incomeY = padding.top;
  const incomeNodes = income.map(item => {
    const nodeHeight = (item.value / incomeTotal) * chartHeight;
    const node = {
      ...item,
      x: padding.left,
      y: incomeY,
      height: nodeHeight,
      width: 20
    };
    incomeY += nodeHeight + 5; // 5px gap between nodes
    return node;
  });
  
  // Calculate vertical positions for expenses
  let expenseY = padding.top;
  const expenseNodes = expenses.map(item => {
    const nodeHeight = (item.value / expenseTotal) * chartHeight;
    const node = {
      ...item,
      x: width - padding.right,
      y: expenseY,
      height: nodeHeight,
      width: 20
    };
    expenseY += nodeHeight + 5;
    return node;
  });
  
  // Generate flow paths (Bezier curves)
  const generatePath = (sx, sy, sh, tx, ty, th) => {
    const midX = (sx + tx) / 2;
    
    return `
      M ${sx} ${sy}
      C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}
      L ${tx} ${ty + th}
      C ${midX} ${ty + th}, ${midX} ${sy + sh}, ${sx} ${sy + sh}
      Z
    `;
  };
  
  // FIXED: Properly allocate flows from income to expenses
  // Each dollar from income is proportionally distributed to all expenses
  const flows = [];
  let flowId = 0;
  
  // Track how much of each expense node has been filled
  const expenseAllocations = expenseNodes.map(() => ({ allocated: 0, startY: 0 }));
  
  incomeNodes.forEach((incomeNode, incomeIdx) => {
    let remainingFromSource = incomeNode.value;
    let sourceStartY = incomeNode.y;
    
    expenseNodes.forEach((expenseNode, expenseIdx) => {
      if (remainingFromSource <= 0) return;
      
      // Calculate how much of this income source goes to this expense
      // Each income contributes proportionally to each expense based on expense/total
      const expenseRatio = expenseNode.value / expenseTotal;
      const flowValue = incomeNode.value * expenseRatio;
      
      if (flowValue > 0) {
        // Source dimensions
        const sourceHeight = (flowValue / incomeNode.value) * incomeNode.height;
        
        // Target dimensions  
        const targetHeight = (flowValue / expenseNode.value) * expenseNode.height;
        const targetStartY = expenseNode.y + expenseAllocations[expenseIdx].startY;
        
        flows.push({
          id: flowId++,
          path: generatePath(
            incomeNode.x + incomeNode.width,
            sourceStartY,
            sourceHeight,
            expenseNode.x,
            targetStartY,
            targetHeight
          ),
          value: flowValue,
          color: incomeNode.color
        });
        
        // Update tracking
        sourceStartY += sourceHeight;
        expenseAllocations[expenseIdx].startY += targetHeight;
        remainingFromSource -= flowValue;
      }
    });
  });
  
  return (
    <svg width={width} height={height} style={{ background: 'transparent' }}>
      {/* Title */}
      <text x={width / 2} y={25} textAnchor="middle" fill={THEME.inkPrimary} fontSize="18" fontWeight="600">
        {title}
      </text>
      
      {/* Flow paths */}
      {flows.map(flow => (
        <path
          key={flow.id}
          d={flow.path}
          fill={flow.color}
          opacity={0.4}
          stroke="none"
        />
      ))}
      
      {/* Income nodes */}
      {incomeNodes.map((node, i) => (
        <g key={`income-${i}`}>
          <rect
            x={node.x}
            y={node.y}
            width={node.width}
            height={node.height}
            fill={node.color}
            rx={3}
          />
          <text
            x={node.x - 10}
            y={node.y + node.height / 2}
            textAnchor="end"
            fill={THEME.inkSecondary}
            fontSize="13"
            fontWeight="500"
            dominantBaseline="middle"
          >
            {node.label}
          </text>
          <text
            x={node.x - 10}
            y={node.y + node.height / 2 + 14}
            textAnchor="end"
            fill={THEME.inkMuted}
            fontSize="11"
            dominantBaseline="middle"
          >
            ${(node.value / 1000).toFixed(0)}k
          </text>
        </g>
      ))}
      
      {/* Expense nodes */}
      {expenseNodes.map((node, i) => (
        <g key={`expense-${i}`}>
          <rect
            x={node.x}
            y={node.y}
            width={node.width}
            height={node.height}
            fill={node.color}
            rx={3}
          />
          <text
            x={node.x + node.width + 10}
            y={node.y + node.height / 2}
            textAnchor="start"
            fill={THEME.inkSecondary}
            fontSize="13"
            fontWeight="500"
            dominantBaseline="middle"
          >
            {node.label}
          </text>
          <text
            x={node.x + node.width + 10}
            y={node.y + node.height / 2 + 14}
            textAnchor="start"
            fill={THEME.inkMuted}
            fontSize="11"
            dominantBaseline="middle"
          >
            ${(node.value / 1000).toFixed(0)}k
          </text>
        </g>
      ))}
      
      {/* Left label */}
      <text
        x={padding.left}
        y={padding.top - 20}
        textAnchor="middle"
        fill={THEME.inkMuted}
        fontSize="12"
        fontWeight="600"
      >
        INCOME SOURCES
      </text>
      
      {/* Right label */}
      <text
        x={width - padding.right + 10}
        y={padding.top - 20}
        textAnchor="middle"
        fill={THEME.inkMuted}
        fontSize="12"
        fontWeight="600"
      >
        USES OF INCOME
      </text>
    </svg>
  );
});

// Give display name for React DevTools
SankeyDiagram.displayName = 'SankeyDiagram';

const STORAGE_KEY = 'retirement_planner_data';
// Bump this whenever the persisted data shape changes in a way an older build
// could not safely consume. loadFromStorage refuses to read anything with a
// future schemaVersion so a downgrade doesn't silently shred the user's data (B8).
// v2: account.contributionMode ('fixed' | 'percent') + employeePercent + employerMatchPercent
//     are optional; absent → engine treats as 'fixed' so older saved scenarios still load.
//     Spending-phase fields (spendingPhasesEnabled, goGoEndAge, ...) are also optional;
//     absent → engine multiplier is 1 (flat spending), so no version bump needed.
// v3: adds the `currentYear` slice (paystub YTD ledger, K-1 ledger, estimated
//     payments, prior-year return). Bumped rather than defaulted because this is
//     a whole new top-level key: an older build round-tripping a v3 export would
//     drop it silently, and the user would not find out until a tax number moved.
const SCHEMA_VERSION = 6;

// Migrations run in order from the saved version up to SCHEMA_VERSION. Each is
// a pure (data) => data. Absent entries are skipped, so a version that only adds
// optional fields needs no migration — but must still be listed here as a
// comment, or the next person cannot tell "no migration needed" from "forgot".
const migrations = {
  // v2 → v3: nothing to backfill. `currentYear` is merged from defaults on load,
  // exactly like personalInfo, so an older plan simply arrives with an empty one.
  3: (data) => ({ ...data, currentYear: data.currentYear || DEFAULT_CURRENT_YEAR }),
  // v3 → v4: retire contributor:'both'. It could not be split, so the savings
  // rate counted it as neither the saver's nor the employer's money and the tax
  // engine deducted none of it. Legacy rows are split 8:3 into an employee row
  // and an employer row — the dollars and the growth path are unchanged, they
  // are simply attributed. The result is recorded so the app can tell the user
  // what it did to their plan rather than silently editing it.
  4: (data) => {
    const { accounts, split } = splitBothContributors(data.accounts || []);
    return split.length ? { ...data, accounts, contributorSplitNotice: split } : { ...data, accounts };
  },
  // v4 → v5: section visibility becomes per-tab, because it now covers Social
  // Security and Monte Carlo as well as the dashboard. The old flat map WAS the
  // dashboard's, so it moves under that key verbatim and nobody's hidden sections
  // come back on upgrade. Only explicit choices are carried: an entry that still
  // matches the old default is dropped so it follows the detail level instead of
  // being pinned forever by a preference the user never actually expressed.
  5: (data) => {
    const flat = data.dashboardVisibility;
    if (!flat || data.sectionVisibility) return { ...data, sectionVisibility: data.sectionVisibility || {} };
    const dash = {};
    Object.entries(flat).forEach(([k, v]) => {
      if (v !== DEFAULT_DASHBOARD_VISIBILITY[k]) dash[k] = v;
    });
    return { ...data, sectionVisibility: Object.keys(dash).length ? { dashboard: dash } : {} };
  },
  // v5 → v6: survivor modelling defaults ON for married plans.
  //
  // This is NOT a silent improvement, which is why it records a notice instead
  // of just flipping the flag. Turning it on does three things at once, and only
  // the first is obviously "more conservative":
  //
  //   1. the survivor files SINGLE — narrower brackets, one standard deduction
  //   2. spending drops to survivorSpendingFactor (0.75) and one Social Security
  //      cheque stops, which pulls taxable withdrawals DOWN
  //   3. the horizon becomes the later of the two life expectancies rather than
  //      legacyAge, so the projection can END EARLIER OR LATER
  //
  // Measured on a synthetic couple: with life expectancies of 85 and 86 against
  // a planning age of 95, the plan stops at 88 instead of 97 — nine years of
  // rows, and the headline "Legacy at 95", simply gone. Nobody should discover
  // that by noticing their dashboard changed.
  //
  // Single filers are unaffected: the engine gates every survivor behaviour on
  // married_joint, so the flag is inert and no notice is raised.
  6: (data) => {
    const pi = data.personalInfo || {};
    const married = pi.filingStatus === 'married_joint';
    if (!married || pi.survivorModelEnabled) {
      return { ...data, personalInfo: { ...pi, survivorModelEnabled: pi.survivorModelEnabled ?? married } };
    }
    return {
      ...data,
      personalInfo: { ...pi, survivorModelEnabled: true },
      survivorModelNotice: {
        legacyAge: pi.legacyAge || 95,
        myAge: pi.myAge, spouseAge: pi.spouseAge,
        myLifeExpectancy: pi.myLifeExpectancy, spouseLifeExpectancy: pi.spouseLifeExpectancy,
        spendingFactor: pi.survivorSpendingFactor ?? 0.75,
      },
    };
  },
};

// ── SECTION VISIBILITY ──────────────────────────────────────────────────────
// The dashboard has let users hide sections since early on, and it works, but it
// was built as a one-off: the list of sections is written twice (once as the
// settings panel, once as a chain of `visibilitySettings.x &&` guards), so adding
// a section means remembering both. That does not scale to the tabs that need it
// most — Social Security and Monte Carlo each render a dozen sections, and a user
// six years from retirement has no use for half of them.
//
// So the list moves into a manifest that drives BOTH the guards and the settings
// UI, and every section carries a level. Someone who just wants to know whether
// the plan works picks Essentials and gets four sections; someone tuning a
// claiming strategy picks Everything. The per-section toggles still win over the
// level — the level sets a starting point, it does not take the choice away.
//
//   essential — you cannot judge the tab without it
//   standard  — the ordinary working content of the tab
//   advanced  — diagnostics, methodology, sensitivity, per-scenario detail
//
// Transient sections (loading, error, empty states) are deliberately NOT in the
// manifest: a user must never be able to hide the thing that would have told them
// why the page is blank.
const EMPTY_SECTION_VISIBILITY = {};   // stable identity — see simple mode
const LEVEL_RANK = { essential: 0, standard: 1, advanced: 2 };
const LEVEL_SHOWS = { essentials: 0, standard: 1, everything: 2 };

// The Dashboard left the manifest in v2.47.0, when it merged with the Sandbox
// and took over the Sandbox's panel picker — one way to choose what the page
// shows instead of two. Its old levels are kept only to carry each reader's
// choices across (see mergedDashboardConfig).
const LEGACY_DASHBOARD_SECTIONS = [
  ['summaryCards', 'essential'], ['netWorth', 'essential'], ['retirementIncome', 'essential'],
  ['cashFlow', 'standard'], ['withdrawalRate', 'standard'], ['taxSummary', 'standard'],
  ['safeSpending', 'standard'], ['coastFire', 'advanced'], ['lifestyleLegacy', 'advanced'],
];

const SECTION_MANIFEST = {
  // The Tax Planning tab had no manifest entry at all, so nothing on it could be
  // hidden and its detail level did nothing. The IRMAA card arriving from the
  // dashboard would otherwise have been the one section on the tab with no way
  // to put it away.
  // Data-entry tabs get one too. A tab whose sections cannot be put away is a
  // tab that grows monotonically: the year-by-year tables on Accounts are the
  // reason someone scrolls past their own account list every time they want to
  // change a balance.
  accounts: [
    { id: 'quickEdit',          label: 'Quick edit — balances & contributions', level: 'essential' },
    { id: 'balancesTable',      label: 'Year-by-year account balances',  level: 'standard' },
    { id: 'contributionsTable', label: 'Year-by-year contributions',     level: 'advanced' },
  ],
  income: [
    { id: 'quickEdit',          label: 'Quick edit — income streams',    level: 'essential' },
    { id: 'projectionTable',    label: 'Detailed annual projections',    level: 'standard' },
  ],
  stresstest: [
    { id: 'startingConditions', label: 'Starting conditions at retirement', level: 'standard' },
    { id: 'scenarioChart',      label: 'Portfolio value under each scenario', level: 'essential' },
  ],
  sensitivity: [
    // Not the baseline card: it carries the Run Analysis button, and a section
    // toggle that hides the way to run the tool is a trap, not a preference.
    { id: 'ranking',            label: 'Impact ranking (tornado)',       level: 'essential' },
    { id: 'perVariable',        label: 'Detailed results per variable',  level: 'standard' },
  ],
  currentyear: [
    { id: 'payroll',            label: 'Paychecks',                      level: 'essential' },
    { id: 'k1s',                label: 'Schedule K-1s',                  level: 'standard' },
    { id: 'otherIncome',        label: 'Everything else',                level: 'standard' },
    { id: 'form1040',           label: 'Projected Form 1040',            level: 'essential' },
    { id: 'decisions',          label: 'What to do about it',            level: 'standard' },
    { id: 'feedPlan',           label: 'Use these figures in the plan',  level: 'advanced' },
  ],
  taxplanning: [
    { id: 'bracketSummary',  label: 'Bracket summary cards',              level: 'essential' },
    { id: 'bracketChart',    label: 'Income vs. Tax Bracket Thresholds',  level: 'essential' },
    { id: 'conversionYears', label: 'Roth Conversion Opportunity by Year', level: 'essential' },
    { id: 'marginalIrmaa',   label: 'Marginal Tax Impact & IRMAA',         level: 'standard' },
    { id: 'acaSubsidy',      label: 'Roth Conversions vs. ACA Subsidy',    level: 'advanced' },
    { id: 'charitable',      label: 'What Your Charitable Giving Saves',   level: 'advanced' },
    { id: 'breakpoints',     label: 'Income thresholds table',            level: 'advanced' },
    { id: 'yearSnapshot',    label: 'Tax Year Snapshot',                  level: 'standard' },
    { id: 'optimizer',       label: 'Roth Conversion Optimizer',          level: 'standard' },
    { id: 'deferralDecision',label: 'Traditional or Roth while working',  level: 'advanced' },
    { id: 'conversionFunding',label: 'Who pays the conversion tax',       level: 'advanced' },
    // 'simulator' left in v2.48.0: it became the strategy editor, which leads
    // the tab and is not hideable.
  ],
  montecarlo: [
    { id: 'method',        label: 'Simulation Method',            level: 'standard' },
    { id: 'parameters',    label: 'Simulation Parameters',        level: 'essential' },
    { id: 'incomeContext', label: 'Income & Withdrawal Context',   level: 'advanced' },
    // The outcome distribution is the answer the tab exists to give, so it has no
    // toggle; everything around it does.
    { id: 'longevity',     label: 'How Long the Money Had to Last', level: 'advanced' },
    { id: 'ltc',           label: 'Long-Term Care Outcomes',        level: 'advanced' },
    // Standard since guardrails became a plan setting (v2.59.0): a reader who
    // chose them needs to see how deep the cuts go, not only that the plan lived.
    // It draws only when guardrails ran, so it costs nobody else anything.
    { id: 'guardrails',    label: 'Spending Guardrail Outcomes',   level: 'standard' },
    { id: 'spending',      label: 'Spending Under Your Strategy',  level: 'standard' },
    { id: 'perYear',       label: 'Per-Year Historical Outcomes',  level: 'advanced' },
    { id: 'bands',         label: 'Portfolio Projection Bands',    level: 'essential' },
    { id: 'paths',         label: 'Sample Simulation Paths',       level: 'standard' },

  ],
  // Personal Info had no manifest, so its detail level did nothing and the tab
  // stayed 4,400px tall at every setting — the longest page in the app and the
  // first one a new plan lands on.
  //
  // Ages, filing status and the spending target are deliberately absent: they
  // are the tab's inputs, not its output, and a plan with no way to say how old
  // you are is not a simpler plan. What is here is everything BELOW those.
  //
  // Healthcare and long-term care are deliberately absent — see below. They are
  // the two settings that move a plan by seven figures without the reader
  // having touched them, and a reader who cannot find the switch that is
  // billing them $1.7M of care has been hidden from, not simplified for.
  personal: [
    // Every one of these is 'standard', none 'advanced'. Before v2.41 all of
    // them were visible to everyone, and 'standard' is the default level, so an
    // 'advanced' entry here silently took a live control away from existing
    // users in the FULL app — while its setting kept moving their projection.
    // Only simple mode (and a reader who picks Essentials) hides them.
    { id: 'charitable',         label: 'Charitable giving & QCD',          level: 'standard' },
    { id: 'withdrawalPriority', label: 'Withdrawal priority',              level: 'standard' },
    { id: 'spendingPhases',     label: 'Spending phases',                  level: 'standard' },
    { id: 'guardrails',         label: 'Spending guardrails',              level: 'standard' },
    { id: 'survivor',           label: 'Survivor modelling',               level: 'standard' },
    // Healthcare and long-term care are NOT listed, so they have no Hide button
    // and no Sections chip at any level, in either mode. Listing them as
    // 'essential' was not enough: it kept them on at Essentials but still gave
    // them a Hide button — making the switch that bills $1.7M of care the one
    // thing a reader could put away for good.
  ],
  socialsecurity: [
    // 'Your Current Plan' and the benefit inputs are deliberately absent: they are
    // the tab's controls, not its output, and hiding them would leave a page of
    // results with no way to change what produced them.
    { id: 'byClaimAge',   label: 'Monthly Benefits by Claiming Age', level: 'standard' },
    { id: 'controls',     label: 'Analysis Sensitivity Controls',  level: 'advanced' },
    { id: 'fullPlan',     label: 'Full Plan Impact Analysis',      level: 'essential' },
    { id: 'heatMap',      label: 'Portfolio Heat Map',             level: 'advanced' },
    { id: 'overTime',     label: 'Portfolio Value Over Time',      level: 'standard' },
    { id: 'considerations', label: 'What to Consider',             level: 'standard' },
  ],
};

// A section is visible when the user has said so explicitly; otherwise the detail
// level decides. Stored per tab so "hide the heat map" on Social Security says
// nothing about the dashboard.
const sectionIsVisible = (vis, level, tab, id) => {
  const explicit = vis && vis[tab] && vis[tab][id];
  if (explicit === true || explicit === false) return explicit;
  const entry = (SECTION_MANIFEST[tab] || []).find(e => e.id === id);
  if (!entry) return true;   // not in the manifest: never hideable
  return LEVEL_RANK[entry.level] <= LEVEL_SHOWS[level || 'standard'];
};

const DEFAULT_DASHBOARD_VISIBILITY = {
  summaryCards: true,
  netWorth: true,
  retirementIncome: true,
  cashFlow: true,
  withdrawalRate: true,
  taxSummary: true,
  safeSpending: true,
  coastFire: true,
  lifestyleLegacy: true,
};

// Healthcare modeling presets
const HEALTHCARE_PRESETS = {
  none: { label: 'Not Modeled', description: 'Healthcare costs not included in projections' },
  in_spending: { label: 'Already In My Spending', description: 'You budget healthcare yourself — e.g. retiree coverage through a spouse’s employer or pension system. Charges $0 separately, and stops the pre-65 gap warning.' },
  basic: { label: 'Basic', description: 'Medicare premiums + modest OOP after 65; flat estimate pre-65' },
  moderate: { label: 'Moderate', description: 'Medicare + supplemental + OOP; employer/ACA pre-65' },
  comprehensive: { label: 'Comprehensive', description: 'Full Medicare + Medigap + OOP + long-term care' },
  custom: { label: 'Custom', description: 'Set your own pre-65 and post-65 costs' }
};

// ── RECURRING EXPENSE CATEGORIES ────────────────────────────────────────────────
const EXPENSE_CATEGORIES = [
  { value: 'housing', label: 'Housing (rent/maintenance)', icon: '🏠' },
  { value: 'healthcare', label: 'Healthcare', icon: '🏥' },
  { value: 'transportation', label: 'Transportation', icon: '🚗' },
  { value: 'travel', label: 'Travel & Leisure', icon: '✈️' },
  { value: 'education', label: 'Education', icon: '🎓' },
  { value: 'insurance', label: 'Insurance Premiums', icon: '🛡️' },
  { value: 'caregiving', label: 'Caregiving / Support', icon: '👨‍👩‍👧' },
  { value: 'debt_payment', label: 'Debt Payment', icon: '💳' },
  { value: 'long_term_care', label: 'Long-Term Care', icon: '🏥' },
  { value: 'other', label: 'Other', icon: '📋' }
];

// The plan defaults live in the engine, so the desktop and the phone start a
// plan from the same numbers and normalise a saved one the same way. Aliased
// rather than re-declared: two copies of this object is exactly how the two
// surfaces would drift apart again.
const DEFAULT_PERSONAL_INFO = DEFAULT_PLAN_INFO;

// contributionGrowth is set to match inflationRate (3%) on the FIXED-DOLLAR rows so
// real contributions stay constant over the 30-year accumulation. 2% growth vs 3%
// inflation silently erodes real contributions ~1%/yr (~26% by year 30) and produces
// an unsustainable scenario.
//
// The percent-of-salary rows carry no growth rate: a share of a salary that already
// has its own COLA is inflation-tracking by construction, and stacking growth on top
// would compound twice.
// The two 401(k)s are percent-of-salary, which is the only entry mode that can
// hold the employee deferral and the employer match as separate, attributable
// numbers. They used to be a flat $20,000/$8,000 marked contributor:'both' — an
// amount nothing could split, so it counted toward neither side of the savings
// rate (which read 4.7%) and drew no pre-tax deduction at all.
//
// 8% / 3% are TYPICAL_DEFERRAL_RATE and TYPICAL_MATCH_RATE, the figures the
// Guided Setup wizard has always estimated from. The cold-start defaults and the
// wizard now agree; before this they held two different opinions about the same
// typical saver.
const DEFAULT_ACCOUNTS = [
  { id: 1, name: 'My 401(k)', type: '401k', balance: 60000, contributionMode: 'percent', employeePercent: TYPICAL_DEFERRAL_RATE, employerMatchPercent: TYPICAL_MATCH_RATE, cagr: 0.07, startAge: 35, stopAge: 65, owner: 'me', contributor: 'me' },
  { id: 2, name: 'Spouse 401(k)', type: '401k', balance: 30000, contributionMode: 'percent', employeePercent: TYPICAL_DEFERRAL_RATE, employerMatchPercent: TYPICAL_MATCH_RATE, cagr: 0.07, startAge: 33, stopAge: 65, owner: 'spouse', contributor: 'me' },
  { id: 3, name: 'My Roth IRA', type: 'roth_ira', balance: 15000, contribution: 6000, contributionGrowth: 0.03, cagr: 0.07, startAge: 35, stopAge: 65, owner: 'me', contributor: 'me' },
  { id: 4, name: 'Savings', type: 'brokerage', balance: 15000, contribution: 2400, contributionGrowth: 0.03, cagr: 0.04, startAge: 35, stopAge: 65, owner: 'joint', contributor: 'me' }
];

// Salary COLA and SS COLA set to 3% to match inflation. Lower values silently erode
// the real purchasing power of every income stream — SS benefits set at 2% COLA
// lose ~25% of their value by age 95 vs. real-world SS which tracks CPI.
//
// Salaries end at retirementAge − 1: age ranges here are INCLUSIVE, while an
// account's stopAge is exclusive, so `endAge: 65` against `stopAge: 65` had the
// couple earning a full salary at 65 while contributing nothing — a phantom
// year of pay after the age they retire. (The Guided Setup wizard already used
// retAge − 1; only these defaults disagreed.)
//
// Social Security is in TODAY'S dollars, which is how SSA quotes it on the
// statement people read these figures off — hence todaysDollars: true, so the
// benefit is indexed up to the claim year instead of being taken as the nominal
// 2058 amount. Without the flag this couple's benefit arrived worth $15,728 in
// today's money instead of $40,500: a 61% understatement that the portfolio then
// had to cover, and the single reason the starter plan used to sit one rounding
// error away from failing.
//
// The amounts are the 2026 PIA formula applied to each salary as a steady career
// average — 90% of the first $1,286 of AIME, 32% to $7,749, 15% above (SSA 2026
// bend points) — and `pia` is the same figure monthly, so the two fields cannot
// disagree. They did: 36000/yr sat next to a pia of 2400 ($28,800/yr), and the
// engine reads BOTH (pia drives the spousal benefit).
const DEFAULT_INCOME_STREAMS = [
  { id: 1, name: 'My Salary', type: 'earned_income', amount: 105000, startAge: 35, endAge: 64, cola: 0.03, owner: 'me' },
  { id: 2, name: 'Spouse Salary', type: 'earned_income', amount: 75000, startAge: 33, endAge: 64, cola: 0.03, owner: 'spouse' },
  { id: 3, name: 'My Social Security', type: 'social_security', amount: 40500, startAge: 67, endAge: 95, cola: 0.03, owner: 'me', pia: 3375, todaysDollars: true },
  { id: 4, name: 'Spouse Social Security', type: 'social_security', amount: 32940, startAge: 67, endAge: 95, cola: 0.03, owner: 'spouse', pia: 2745, todaysDollars: true }
];

// Home value tracks the national median existing-home price (NAR, Q1 2026:
// $404,300). It had drifted to $315,000 — roughly the 2019 median — which
// understated both the balance sheet and the property tax below.
const DEFAULT_ASSETS = [
  { id: 1, name: 'Primary Residence', type: 'real_estate', value: 405000, appreciationRate: 0.03, mortgage: 300000, mortgagePayoffAge: 60 },
  { id: 2, name: 'Vehicles', type: 'vehicle', value: 35000, appreciationRate: -0.10, mortgage: 0, mortgagePayoffAge: null }
];

// Recurring expenses: modeled separately from desiredRetirementIncome for granularity.
// Each expense has its own start/end age, inflation rate, and category.
// When recurringExpenses has entries, they ADD to the flat desiredRetirementIncome.
// The single placeholder below exists so the cash-flow tab isn't empty for first-time
// users — they can edit/delete it once they understand the feature.
const DEFAULT_RECURRING_EXPENSES = [
  { id: 1, name: 'Property Tax', category: 'housing', amount: 4400, startAge: 35, endAge: 95, inflationRate: 0.03, owner: 'me' }
];

// ── CURRENT-YEAR TAX DETAIL ──────────────────────────────────────────────────
// Everything the Form 1040 engine needs that the long-range plan does not carry:
// what has actually been earned, deferred and withheld so far, and the K-1s.
//
// PRIVACY: this lives in localStorage alongside the rest of the plan and travels
// in plan exports, which now carry wage and withholding detail. No field asks for
// an SSN or an EIN — `employerLabel` and `label` are free text for the user's own
// benefit and are never required.
const DEFAULT_CURRENT_YEAR = {
  taxYear: (typeof BASE_TAX_YEAR === 'number' ? BASE_TAX_YEAR : 2026),
  // One row per person per employer. `ytd` is copied straight off a paystub —
  // the stub's own YTD columns are the input, so nothing has to be derived.
  payroll: [],
  // One row per K-1, laid out by box number so it can be filled in from the form.
  k1s: [],
  estimatedPayments: { federal: [0, 0, 0, 0], state: [0, 0, 0, 0] },
  // Key lines off last year's return. Drives the §6654 safe harbor (which needs
  // prior AGI and prior total tax) and seeds items that are hard to project.
  priorYearReturn: { taxYear: null, agi: null, totalTax: null, totalWithheld: null,
                     deductionTaken: null, qbiDeduction: null },
  otherIncome: {},
  adjustments: {},
  deductions: { mode: 'auto' },
};

// A blank paystub row. asOfDate defaults to today so the period count is right
// the moment a row is added.
const newPayrollRow = (owner = 'me') => ({
  id: Date.now() + Math.random(),
  owner, employerLabel: '',
  asOfDate: new Date().toISOString().slice(0, 10),
  payFrequency: 'biweekly',
  ytd: { grossPay: 0, fedTaxableWages: 0, ssWages: 0, medicareWages: 0,
         preTax401kTraditional: 0, roth401k: 0, employerMatch: 0,
         hsa: 0, section125Health: 0, otherPreTax: 0,
         fedWithheld: 0, stateWithheld: 0, ssWithheld: 0, medicareWithheld: 0 },
  remainder: {},
});

// A blank K-1. Passive by default: that is both the common case for an interest
// held as an investment and the conservative one, since passive income carries
// 3.8% NIIT that a materially-participating owner would not owe.
const newK1Row = () => ({
  id: Date.now() + Math.random(),
  label: '', entityType: 'partnership',
  isPassive: true, materiallyParticipates: false,
  basisStart: 0, suspendedLossCarryforward: 0,
  boxes: { b1_ordinaryBusiness: 0, b2_rental: 0, b5_interest: 0,
           b6a_ordinaryDiv: 0, b6b_qualifiedDiv: 0,
           b8_shortTermGain: 0, b9a_longTermGain: 0, b13_deductions: 0,
           b14a_seEarnings: 0, b19_distributions: 0,
           b20z_qbi: 0, b20z_w2Wages: 0, b20z_ubia: 0, isSSTB: false },
});

// A savings rate is a magnitude with a judgement attached to it, so the bar
// carries the judgement and the number stays in text ink. They used to disagree:
// the figure was hardcoded amber (or emerald) while the bar ran a separate
// threshold ramp, so a 24.2% gross rate showed an amber number above a blue bar
// and a 31.2% net rate showed an emerald number above an amber one. Neither
// tile's colour said anything about the other.
// Recharts paints legend labels in the series colour. A label is text, and text
// wears text ink — a saturated hue at 11px on a dark ground is both a contrast
// problem and a second, redundant encoding of what the swatch beside it already
// says. This keeps the swatch coloured and the words readable.
const legendInk = (value) => <span style={{ color: THEME.inkSecondary }}>{value}</span>;

// ── WHAT SIMPLE MODE IS STILL APPLYING ───────────────────────────────────────
// Shown in simple mode on the Dashboard and on About you, and only when one of
// the settings whose control the mode hides is switched on. The list comes from
// the engine (activeAdvancedSettings) so it cannot drift from what the engine
// actually applies; this is only the frame around it.
const HiddenSettingsNotice = ({ pi, onShowEverything }) => {
  const items = activeAdvancedSettings(pi, formatCurrency);
  if (!items.length) return null;
  return (
    <div className="rounded-xl border border-sky-700/40 bg-sky-900/15 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-sky-200">
            Also shaping your plan — set in the full view
          </div>
          <ul className="mt-1.5 space-y-0.5 text-xs text-slate-300">
            {items.map((it, i) => (
              <li key={it.key + i}>
                <span className="text-slate-100 font-medium">{it.label}:</span> {it.detail}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-slate-500">
            The simple view hides these controls, not their effect — every figure here includes them.
          </p>
        </div>
        {onShowEverything && (
          <button onClick={onShowEverything}
                  className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-sky-600/50 text-sky-200 hover:bg-sky-800/30 transition-colors">
            Show everything
          </button>
        )}
      </div>
    </div>
  );
};

// ── ONE SCENARIO, ONE LINE STYLE ─────────────────────────────────────────────
// Shared by the Sandbox comparison chart and the printed Scenarios report, so a
// scenario that is the green dashed one on screen is the green dashed one on
// paper. Two implementations of "which colour is scenario six" is how the two
// surfaces start disagreeing, which is the whole reason this lives here.
//
// Hues are taken IN ORDER from slot 0 and never skipped: the palette's
// colour-vision separation is a property of consecutive slots, so an assignment
// that jumps around forfeits the guarantee. Past the eighth the stroke pattern
// becomes a second channel rather than a hue repeating — eight hues x three
// patterns = 24 lines that are still told apart by something besides colour.
//
// `palette` is passed in because the report prints on white whatever theme the
// app is wearing, so it needs the light column while the screen may be on dark.
const SCENARIO_DASHES = [undefined, '7 4', '2 3'];
const scenarioLineStyle = (orderIndex, palette) => {
  const slots = palette || THEME.categorical;
  const i = Math.max(0, orderIndex);
  return {
    stroke: slots[i % slots.length],
    strokeDasharray: SCENARIO_DASHES[Math.floor(i / slots.length) % SCENARIO_DASHES.length],
  };
};
const SCENARIO_STYLE_COUNT = 8 * SCENARIO_DASHES.length;


const savingsRateStatus = (rate) => rate >= 25 ? 'good' : rate >= 15 ? 'warning' : 'serious';

const formatCurrency = (value) => {
  if (value === undefined || value === null || isNaN(value)) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
};

// Is a Roth conversion planned at all, and in which mode? Three modes now —
// fixed amount, fill to a tax bracket, fill to an IRMAA tier — and six places
// used to test for the first two inline. A plan set to fill an IRMAA tier has
// neither a conversion amount nor a bracket label, so every one of those
// predicates would have read it as "no conversion planned" and hidden the
// column, skipped the validation, or described the strategy wrongly.
const conversionIsActive = (pi) => rothConversionIsPlanned(pi);
const conversionModeLabel = (pi) => rothConversionModeLabel(pi, formatCurrency);


const formatPercent = (value) => `${(value * 100).toFixed(1)}%`;

// Load data from localStorage. Returns null when there is nothing usable —
// missing key, parse error, OR a saved schemaVersion from a future build (B8).
// Missing schemaVersion is treated as v0 (pre-versioning) and accepted; future
// migrations can branch on saved.schemaVersion here.
function loadFromStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (parsed && typeof parsed.schemaVersion === 'number' && parsed.schemaVersion > SCHEMA_VERSION) {
      console.warn(`Saved data is from a newer schema (v${parsed.schemaVersion}); this build only understands v${SCHEMA_VERSION}. Ignoring to avoid corruption.`);
      return null;
    }
    // Run forward migrations. Until v3 this gated on version but never actually
    // migrated, which was fine while every change was an optional field merged
    // from defaults. A new top-level key is not that, so the runner is real now.
    // Stops at the first missing step rather than skipping it, so a gap cannot
    // silently apply a later migration to data that never got an earlier one.
    let data = parsed;
    let version = (data && typeof data.schemaVersion === 'number') ? data.schemaVersion : 0;
    while (version < SCHEMA_VERSION) {
      const next = version + 1;
      const migrate = migrations[next];
      if (migrate) data = migrate(data);
      version = next;
    }
    return data;
  } catch (e) {
    console.error('Error loading from localStorage:', e);
  }
  return null;
};

// Save data to localStorage. Returns { ok: true } or { ok: false, reason } so
// the caller can surface quota / private-mode failures instead of silently
// losing the user's edits (B7).
function saveToStorage(data) {
  try {
    const payload = { ...data, schemaVersion: SCHEMA_VERSION };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return { ok: true };
  } catch (e) {
    console.error('Error saving to localStorage:', e);
    // QuotaExceededError is the common failure (large scenarios + big monte-carlo
    // history can push us past the ~5 MB origin cap). DOMException.name covers
    // both standard and Firefox's NS_ERROR_DOM_QUOTA_REACHED variant.
    const quota = e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22);
    return { ok: false, reason: quota ? 'quota' : 'unknown', error: e };
  }
};

// ── LOCAL SNAPSHOT HISTORY ───────────────────────────────────────────────────
// The whole plan lived in one localStorage key with nothing behind it. A bad
// import, a mis-clicked Reset, or a scenario loaded over unsaved work took forty
// years of assumptions with it and there was no way back. This is a small ring
// of recent copies under a SEPARATE key, so a corrupt or overwritten primary is
// recoverable from inside the app.
//
// What it does NOT protect against, stated plainly because the distinction
// matters: clearing site data, a browser reset, or a new machine takes both keys.
// Only an export survives that, which is what the reminder below is for.
//
// A measured plan is ~4 KB, so ten copies is a rounding error against the ~5 MB
// origin budget. The byte cap is belt and braces for a plan with many scenarios.
const SNAPSHOT_KEY = 'retirement_planner_snapshots';
// When this browser last wrote an export. Its own key, deliberately: it is a
// fact about this device, not about the plan, so it must not ride along in the
// exported file — importing one would otherwise reset the clock to whenever that
// file happened to be written.
const LAST_EXPORT_KEY = 'retirement_planner_last_export';
const EXPORT_NUDGE_DAYS = 30;
const MAX_SNAPSHOTS = 10;
const SNAPSHOT_MIN_GAP_MS = 30 * 60 * 1000;   // routine copies, at most one per half hour
const SNAPSHOT_BUDGET_BYTES = 1_500_000;

function readSnapshots() {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) { return []; }
}

// `reason` is 'auto' for the routine copy and a short phrase for the ones taken
// deliberately before something destructive. Those are the valuable ones, so
// trimming always evicts routine copies first — a "before reset" snapshot must
// not be pushed out by half an hour of ordinary editing.
function writeSnapshot(data, reason = 'auto') {
  try {
    const list = readSnapshots();
    const now = Date.now();
    const body = JSON.stringify({ ...data, schemaVersion: SCHEMA_VERSION });
    if (reason === 'auto') {
      const newest = list[0];
      if (newest && now - newest.at < SNAPSHOT_MIN_GAP_MS) return false;
      // Nothing changed since the last copy: another identical row would push a
      // genuinely different one out of the ring for no gain.
      if (newest && newest.body === body) return false;
    }
    list.unshift({ at: now, reason, body });
    const trim = () => {
      // routine copies first, oldest of them
      for (let i = list.length - 1; i > 0; i--) {
        if (list[i].reason === 'auto') return list.splice(i, 1);
      }
      return list.splice(list.length - 1, 1);
    };
    while (list.length > MAX_SNAPSHOTS) trim();
    while (list.length > 1 && list.reduce((n, x) => n + x.body.length, 0) > SNAPSHOT_BUDGET_BYTES) trim();
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(list));
    return true;
  } catch (e) {
    // A snapshot must NEVER break the real save. Quota, private mode, anything:
    // drop the history rather than the plan.
    try { localStorage.removeItem(SNAPSHOT_KEY); } catch (e2) { /* nothing left to try */ }
    return false;
  }
}

