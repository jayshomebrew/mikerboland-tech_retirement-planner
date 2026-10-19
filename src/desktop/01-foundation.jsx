// The desktop app, part 1 of src/desktop/*.jsx. The parts are one program:
// tools/build.cjs joins them in name order and compiles the result, and the page
// does the same in the browser for an unbuilt local edit (see tools/sources.cjs).
// React and Recharts globals are provided by index.html
// Do not add import statements - this file runs in browser via Babel transform

// ── shared calc engine (loaded via engine.js in index.html) ──
// The desktop app consumes the single shared engine.js exactly like the mobile
// build does. All financial constants, tax/SS/Medicare/RMD helpers, and
// computeProjections come from window.PlannerEngine — there is no embedded copy
// here anymore, so the desktop, mobile, worker, and tests can never drift apart.
const PlannerEngine = (typeof window !== 'undefined' && window.PlannerEngine) || {};
const {
  MAX_AGE, BROKERAGE_COST_BASIS_ESTIMATE, MAX_ITERATIONS_FOR_TAX_CALC,
  MONTE_CARLO_TAX_ESTIMATE, SAVE_DEBOUNCE_MS, BASE_TAX_YEAR, indexTo,
  PRE_TAX_TYPES, ROTH_TYPES,
  BROKERAGE_TYPES, HSA_TYPES, isPreTaxAccount, isRothAccount, isBrokerageAccount,
  isHSAAccount, FEDERAL_TAX_BRACKETS_2026, STANDARD_DEDUCTION_2026,
  calculateFederalTax, calculateSocialSecurityTaxableAmount,
  CAPITAL_GAINS_THRESHOLDS_2025, calculateCapitalGainsTax, calculateNIIT,
  STATE_TAX_RATES, STATES_EXEMPT_RETIREMENT_INCOME,
  STATES_EXEMPT_ALL_RETIREMENT_DISTRIBUTIONS, STATES_THAT_TAX_SS,
  calculateStateTax, ALABAMA_TAX_BRACKETS, ALABAMA_PERSONAL_EXEMPTION,
  ALABAMA_OVER_65_RETIREMENT_EXCLUSION, getAlabamaStandardDeduction,
  calculateAlabamaTax, FICA_SS_RATE, FICA_SS_WAGE_BASE_2025, FICA_MEDICARE_RATE,
  FICA_ADDITIONAL_MEDICARE_RATE, FICA_ADDITIONAL_MEDICARE_THRESHOLD,
  calculateFICA, RMD_FACTORS, calculateRMD, getRmdStartAge,
  getDefaultRothConversionWindow, QCD_ANNUAL_LIMIT, QCD_START_AGE, qcdTaxSavings, getPlanningHorizonYears, checkContributionLimits,
  rmdUsesJointTable, SECTION_121_EXCLUSION_SINGLE, SECTION_121_EXCLUSION_JOINT,
  estimateRetirementSavings, estimateAnnualSocialSecurity, savingsMultipleForAge,
  realReturn, inflateToAge, deflateToToday, coastFire,
  streamOwnerAge,
  inferPiaFromBenefit,
  TYPICAL_DEFERRAL_RATE, TYPICAL_MATCH_RATE,
  SS_FULL_RETIREMENT_AGE, SS_FRA_PRE_1943, getFullRetirementAge,
  SS_EARNINGS_TEST_LIMIT_2025, SS_EARNINGS_TEST_FRA_LIMIT_2025,
  calculateSSBenefit, calculateSSEarningsTestReduction, IRMAA_THRESHOLDS_2025,
  MEDICARE_PART_B_STANDARD_2025, calculateIRMAA, calculateIRMAASurcharge,
  MEDICARE_PART_B_PREMIUM_2025, MEDICARE_PART_D_PREMIUM_2025,
  MEDICARE_SUPPLEMENT_PREMIUM_2025, MEDICARE_OOP_ANNUAL_2025,
  PRE_65_HEALTHCARE_ANNUAL_2025, MEDICAL_INFLATION_RATE,
  LTC_MONTHLY_ASSISTED_LIVING_2025, LTC_DEFAULT_DURATION_MONTHS, ACA_FPL_2025,
  LTC_MONTHLY_NURSING_HOME_2025, LTC_STRESS_MONTHS, LTC_EPISODE_MODEL,
  calculateACASubsidy, calculateACAPremiumCredit, ACA_BENCHMARK_PREMIUM_2026,
  calculateHealthcareExpenses, calculateRecurringExpenses, healthcareCostsModeled,
  GOV_PENSION_SYSTEMS, estimateGovernmentPension, estimateFersSupplement,
  HISTORICAL_RETURNS, getHistoricalSequence, getValidStartYears,
  accountReturnModel, RETURN_MODEL_DEFAULTS,
  annuityPayoutRate, annuityExclusionRatio, annuityIsQLAC, QLAC_PREMIUM_LIMIT_2026, QLAC_MAX_START_AGE, ANNUITY_PRICING,
  computeProjections, compareClaimingScenarios,
  conversionCostComponents, conversionCostAudit, topMarginalBracket,
  computeTaxReturn, buildTaxSituation, compareTraditionalVsRoth,
  projectPayrollYearEnd, marginalRateOn, saltCapFor, projectedWithdrawalRate,
  detailedCurrentYearDecision, irmaaTierOptions, irmaaTierCeiling, IRMAA_TIER_LOOKBACK_YEARS, nextIRMAAThreshold,
  planAtRetirementAge, streamsAtClaimAges, sandboxScenario,
  irmaaLastFreeAge, irmaaChargedAtAge, MEDICARE_ELIGIBILITY_AGE,
  earnedIncomeByOwner, projectedWithdrawalCost, employeeDollarsOf,
  rothConversionIsPlanned, withoutRothConversions, withRothConversionTarget,
  rothConversionModeLabel, rothConversionModeOf,
  taxBreakpoints, marginalCostOfNextDollar,
  conversionStagesOf, irmaaAwareConversionStages, conversionFundingCost,
  deferralDecision, convertWhileWorking,
  survivorTaxComparison, survivorSSLoss, scoreRothStrategy, afterTaxLegacyValue, claimingComparison,
  deflateProjections,
  planShortfall, breakingPoint, accountsAtSavingsTarget,
  splitBothContributors, breakEvenTaxRate, conversionFundingComparison,
  DEFAULT_PLAN_INFO, PLAN_SCHEMA_VERSION, normalizeSavedPlan,
  activeAdvancedSettings,
  betrSensitivity, presentValueOfTaxes, convertEverythingAnalysis,
  getFederalDeduction, NIIT_THRESHOLDS,
  IRMAA_FILL_SAFETY_MARGIN,
  planPatchSchema, validatePlanPatch, applyPlanPatch, describePlanPatch,
} = PlannerEngine;

// ── PALETTE ────────────────────────────────────────────────────────────────
// One place a thing gets its colour. `theme.js` carries the entity→hue map and
// both surface steppings; tests/run-tests.cjs re-derives the colour-vision
// separation of every adjacent pair, so a palette edit that makes two stacked
// series indistinguishable fails the suite rather than shipping.
// Dark is the default; the pre-paint script in the page head has already
// stamped data-theme (light) or data-look (one of the four dark looks) on
// <html> for a returning user, so reading it back here keeps the JS palette and
// the CSS variables in agreement from the first frame. The value is a theme
// CHOICE — 'dark', 'light' or a look id from PlannerTheme.CHOICES.
const initialThemeMode = (() => {
  try {
    const d = document.documentElement;
    if (d.getAttribute('data-theme') === 'light') return 'light';
    return PlannerTheme.normalizeChoice(d.getAttribute('data-look'));
  } catch (e) { return 'dark'; }
})();
// How wide the content column is allowed to get. Deliberately NOT part of the
// plan and NOT in the export: it depends on the monitor in front of you, so a
// 34" desktop should not be setting the width on the laptop you open the same
// plan on. Same reasoning, and the same storage shape, as the theme.
//
// A continuous pixel figure rather than the three presets this started as. Three
// buckets cannot serve both a laptop and a 30" panel — the gap between "wide"
// and "the whole window" is most of the useful range on a large monitor, and
// there is no reason to make someone pick a bucket when the thing they want is
// a number. WIDTH_MAX doubles as "no cap": at the top of the range the max-width
// comes off entirely so the layout fills the window at any resolution.
// How tall a chart is drawn, as a MULTIPLIER on each chart's own base height
// rather than one absolute figure. The charts are not all meant to be the same
// height — a withdrawal-rate strip and a stacked income chart carry different
// amounts of information — and flattening them to a single number would throw
// that away. Scaling preserves the ratios and still lets a 30" monitor pull
// every one of them taller, which is the point: the y axis gets more pixels, so
// a $40k difference stops being two pixels of bar.
//
// Held in a mutable module object and READ AT RENDER TIME, the same shape as
// THEME. A module-scope const capturing the number would freeze at the first
// value and never move again — the exact trap P92 exists for.
const CHART = { scale: 1 };
const CHART_SCALE_KEY = 'retirement_planner_chart_scale';
const CHART_SCALE_MIN = 0.7;
const CHART_SCALE_MAX = 2.5;
try {
  const v = Number(localStorage.getItem(CHART_SCALE_KEY));
  if (Number.isFinite(v) && v >= CHART_SCALE_MIN && v <= CHART_SCALE_MAX) CHART.scale = v;
} catch (e) { /* storage unavailable — the default stands */ }
// Base heights match the Tailwind classes these replaced: h-64 256, h-72 288,
// h-80 320, h-96 384.
const chartBox = (basePx) => ({ height: Math.round(basePx * CHART.scale) });

const WIDTH_MIN = 1024;
const WIDTH_MAX = 3200;
const WIDTH_STORAGE_KEY = 'retirement_planner_width';
const initialContentWidth = (() => {
  try {
    const v = Number(localStorage.getItem(WIDTH_STORAGE_KEY));
    if (Number.isFinite(v) && v >= WIDTH_MIN && v <= WIDTH_MAX) return v;
  } catch (e) { /* storage unavailable */ }
  return 1280;
})();
const contentWidthCss = (px) => (px >= WIDTH_MAX ? 'none' : `${px}px`);
const contentWidthLabel = (px) => (px >= WIDTH_MAX ? 'Full width' : `${px}px`);

const THEME = PlannerTheme.resolve(initialThemeMode);
const SERIES = THEME.series;

// Charts are the one part of the UI that cannot ride the CSS variables: Recharts
// computes legend swatches, tooltip chrome and axis ticks in JS, where var() is
// an opaque string it will happily hand to canvas as garbage. So the JS palette
// switches separately — by REPAINTING THESE TWO OBJECTS IN PLACE rather than
// rebinding them. Every one of the ~130 call sites reads THEME.x / SERIES.y
// during render, so swapping the contents and re-rendering is enough; the
// alternative was threading a context through every chart component in the file.
// SERIES must stay identical to THEME.series or the two would drift apart on the
// first switch.
const applyThemeMode = (mode) => {
  mode = PlannerTheme.normalizeChoice(mode);
  const next = PlannerTheme.resolve(mode);
  Object.keys(THEME).forEach(k => { if (k !== 'series') delete THEME[k]; });
  Object.assign(THEME, next);
  Object.keys(SERIES).forEach(k => delete SERIES[k]);
  Object.assign(SERIES, next.series);
  THEME.series = SERIES;
  try {
    const d = document.documentElement;
    if (mode === 'light') d.setAttribute('data-theme', 'light');
    else d.removeAttribute('data-theme');
    if (PlannerTheme.LOOKS[mode]) d.setAttribute('data-look', mode);
    else d.removeAttribute('data-look');
    localStorage.setItem(PlannerTheme.STORAGE_KEY, mode);
  } catch (e) { /* storage unavailable — the in-memory switch still holds */ }
};

