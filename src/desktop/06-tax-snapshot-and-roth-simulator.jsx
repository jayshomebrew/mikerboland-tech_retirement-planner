// ============================================
// TaxYearSnapshot — Lifted to module scope
// ============================================
function TaxYearSnapshot({ projections, personalInfo, qcdSavings }) {
  const [selectedAge, setSelectedAge] = useState(personalInfo.myAge);
  const p = projections.find(pr => pr.myAge === selectedAge);
  if (!p) return null;
  
  // Indexes tax tables only (the deduction fallback and the bracket walk below),
  // so it runs on the tax clock: years since BASE_TAX_YEAR, not years since the
  // user's current age. See engine BASE_TAX_YEAR.
  const inflationFactor = indexTo(1, p.year - BASE_TAX_YEAR, personalInfo.inflationRate);

  // ── ALL VALUES READ FROM UNIFIED ENGINE ──────────────────────────────────────
  const rothConversion = p.rothConversion || 0;
  const filingStatus = p.filingStatus || personalInfo.filingStatus;
  const preTaxDeduction = p.preTaxDeduction || 0;
  const taxableIncome = p.taxableIncome || 0;       // Federal AGI (after pre-tax deduction, before std deduction)
  const magi = p.magi || 0;
  const stateTaxableIncome = p.stateTaxableIncome || 0;
  const irmaaSurcharge = p.irmaaSurcharge || 0;
  const taxableSS = p.taxableSS || 0;
  const ssPct = p.socialSecurity > 0 ? Math.round(taxableSS / p.socialSecurity * 100) : 0;
  
  // Derived values for display (not recalculating taxes — just for the breakdown layout)
  const nonSSIncome = p.nonSSIncome || (p.earnedIncome + p.pension + p.otherIncome + p.portfolioWithdrawal + rothConversion - (p.qcd || 0));
  const grossTaxableIncome = nonSSIncome + taxableSS;
  const agiAfterContribs = grossTaxableIncome - preTaxDeduction;
  
  // Federal deduction for display. Read the engine's own figure so the bracket
  // walk-through reconciles with the tax it reports — it includes the age-65
  // additional standard deduction and the OBBBA senior deduction, which a plain
  // STANDARD_DEDUCTION_2026 lookup here would miss.
  const adjDeduction = Math.round(
    p.federalDeduction ?? ((STANDARD_DEDUCTION_2026[filingStatus] || STANDARD_DEDUCTION_2026.single) * inflationFactor)
  );
  
  // Federal taxable income after standard deduction (for bracket walk-through)
  const federalTaxableIncome = Math.max(0, taxableIncome - adjDeduction);
  
  // SS combined income calculation for display
  const combinedIncome = nonSSIncome + p.socialSecurity * 0.5;
  const ssThreshold1 = filingStatus === 'married_joint' ? 32000 : 25000;
  const ssThreshold2 = filingStatus === 'married_joint' ? 44000 : 34000;
  
  // ── BRACKET WALK-THROUGH (display logic only — not recalculating tax) ────────
  const baseBrackets = FEDERAL_TAX_BRACKETS_2026[filingStatus] || FEDERAL_TAX_BRACKETS_2026.single;
  const bracketDetails = [];
  let remainingIncome = federalTaxableIncome;
  let cumulativeTax = 0;
  for (let i = 0; i < baseBrackets.length; i++) {
    const b = baseBrackets[i];
    const adjMin = Math.round(b.min * inflationFactor);
    const adjMax = b.max === Infinity ? Infinity : Math.round(b.max * inflationFactor);
    const bracketWidth = adjMax === Infinity ? Infinity : adjMax - adjMin;
    const incomeInBracket = adjMax === Infinity 
      ? Math.max(0, remainingIncome) 
      : Math.min(Math.max(0, remainingIncome), bracketWidth);
    const taxInBracket = incomeInBracket * b.rate;
    cumulativeTax += taxInBracket;
    
    bracketDetails.push({
      rate: `${(b.rate * 100).toFixed(0)}%`,
      rateNum: b.rate,
      rangeStart: adjMin,
      rangeEnd: adjMax,
      width: bracketWidth,
      incomeInBracket: Math.round(incomeInBracket),
      taxInBracket: Math.round(taxInBracket),
      cumulativeTax: Math.round(cumulativeTax),
      filled: incomeInBracket > 0,
      full: adjMax !== Infinity && incomeInBracket >= bracketWidth - 1,
      remaining: adjMax !== Infinity ? Math.round(Math.max(0, bracketWidth - incomeInBracket)) : null
    });
    
    remainingIncome -= incomeInBracket;
    if (remainingIncome <= 0 && adjMax !== Infinity) break;
  }
  
  // Use engine values for taxes (not recalculated)
  const totalFedTax = p.federalTax;
  const stateTax = p.stateTax;
  const ficaTax = p.ficaTax || 0;
  
  // State tax display info
  const stateRate = STATE_TAX_RATES[personalInfo.state] || 0;
  const stateExemptSS = !STATES_THAT_TAX_SS.has(personalInfo.state);
  const stateExemptRetirement = STATES_EXEMPT_RETIREMENT_INCOME.has(personalInfo.state);
  const retirementIncomeForExemption = p.pension;
  
  // IRMAA display (read from unified engine data)
  const isMedicareAge = selectedAge >= 65;
  const irmaa = p.irmaaInfo; // Engine-computed IRMAA tier detail
  // Cheap enough to run inline: it rebuilds this one year's tax twice rather
  // than running a second 40-year projection, so a slider drag stays instant.
  const marginal = React.useMemo(
    () => marginalCostOfNextDollar({ row: p, pi: personalInfo, probe: 1000 }),
    [p, personalInfo]);
  
  const totalTax = p.totalTax;
  const effectiveRate = grossTaxableIncome > 0 ? (totalTax / grossTaxableIncome * 100) : 0;
  
  // Net income from engine
  const grossIncome = p.earnedIncome + p.socialSecurity + p.pension + p.otherIncome + p.portfolioWithdrawal + rothConversion + (p.conversionTaxWithdrawal || 0);
  const netAfterTax = grossIncome - totalTax;
  
  // Bar width helper for bracket visualization
  const maxBracketIncome = Math.max(...bracketDetails.filter(b => b.filled).map(b => b.incomeInBracket), 1);
  
  return (
    <div className={cardStyle}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h4 className="text-lg font-semibold text-slate-100">Tax Year Snapshot</h4>
          <p className="text-slate-400 text-xs">
            How each dollar of income is taxed in the year you pick, from your plan's projection. This year
            from your actual paychecks and K-1s is on the Current Year tab.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-sm">Age:</span>
          <input
            type="range"
            min={personalInfo.myAge}
            max={personalInfo.legacyAge || 95}
            value={selectedAge}
            onChange={e => setSelectedAge(Number(e.target.value))}
            className="w-32 accent-amber-500"
          />
          <input
            type="number"
            min={personalInfo.myAge}
            max={personalInfo.legacyAge || 95}
            value={selectedAge}
            onChange={e => setSelectedAge(Math.max(personalInfo.myAge, Math.min(personalInfo.legacyAge || 95, Number(e.target.value))))}
            className="w-16 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-100 text-center text-sm"
          />
          <span className="text-slate-500 text-xs">(Year {personalInfo.myBirthYear + selectedAge})</span>
        </div>
      </div>
      
      {/* Income Sources */}
      <div className="mb-5">
        <h5 className="text-sm font-semibold text-slate-300 mb-2 border-b border-slate-700 pb-1">Income Sources</h5>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
          {p.earnedIncome > 0 && (
            <div className="bg-slate-800/50 rounded px-3 py-2">
              <div className="text-slate-500">Earned Income</div>
              <div className="font-semibold" style={{ color: SERIES.earnedIncome }}>{formatCurrency(p.earnedIncome)}</div>
            </div>
          )}
          <div className="bg-slate-800/50 rounded px-3 py-2">
            <div className="text-slate-500">Social Security</div>
            <div className="font-semibold" style={{ color: SERIES.socialSecurity }}>{formatCurrency(p.socialSecurity)}</div>
          </div>
          {p.pension > 0 && (
            <div className="bg-slate-800/50 rounded px-3 py-2">
              <div className="text-slate-500">Pension</div>
              <div className="font-semibold" style={{ color: SERIES.pension }}>{formatCurrency(p.pension)}</div>
            </div>
          )}
          <div className="bg-slate-800/50 rounded px-3 py-2">
            <div className="text-slate-500">Portfolio Withdrawal</div>
            <div className="font-semibold" style={{ color: SERIES.withdrawalVoluntary }}>{formatCurrency(p.portfolioWithdrawal)}</div>
          </div>
          {(p.qcd || 0) > 0 && (
            <div className="bg-slate-800/50 rounded px-3 py-2">
              <div className="text-slate-500">QCD (tax-free)</div>
              <div className="text-emerald-400 font-semibold">−{formatCurrency(p.qcd)}</div>
            </div>
          )}
          {rothConversion > 0 && (
            <div className="bg-purple-900/30 rounded px-3 py-2 border border-purple-700/40">
              <div className="text-slate-500">Roth Conversion</div>
              <div className="font-semibold" style={{ color: SERIES.rothConversion }}>{formatCurrency(rothConversion)}</div>
            </div>
          )}
          <div className="bg-slate-800/50 rounded px-3 py-2 border border-slate-600">
            <div className="text-slate-500">Gross Income</div>
            <div className="text-slate-100 font-bold">{formatCurrency(grossIncome)}</div>
          </div>
        </div>
      </div>
      
      {/* Social Security Taxation */}
      <div className="mb-5">
        <h5 className="text-sm font-semibold text-slate-300 mb-2 border-b border-slate-700 pb-1">Social Security Taxation</h5>
        <div className="bg-slate-800/40 rounded-lg p-3 text-xs space-y-2">
          <div className="flex justify-between">
            <span className="text-slate-400">Non-SS taxable income</span>
            <span className="text-slate-300">{formatCurrency(Math.round(nonSSIncome))}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">+ 50% of Social Security</span>
            <span className="text-slate-300">{formatCurrency(Math.round(p.socialSecurity * 0.5))}</span>
          </div>
          <div className="flex justify-between border-t border-slate-700 pt-1">
            <span className="text-slate-300 font-medium">= Combined income</span>
            <span className="text-slate-100 font-semibold">{formatCurrency(Math.round(combinedIncome))}</span>
          </div>
          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${combinedIncome <= ssThreshold1 ? 'bg-emerald-500' : 'bg-slate-600'}`}></div>
              <span className={combinedIncome <= ssThreshold1 ? 'text-emerald-400' : 'text-slate-500'}>Below {formatCurrency(ssThreshold1)}: 0% taxable</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${combinedIncome > ssThreshold1 && combinedIncome <= ssThreshold2 ? 'bg-amber-500' : 'bg-slate-600'}`}></div>
              <span className={combinedIncome > ssThreshold1 && combinedIncome <= ssThreshold2 ? 'text-amber-400' : 'text-slate-500'}>{formatCurrency(ssThreshold1)}–{formatCurrency(ssThreshold2)}: up to 50% taxable</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${combinedIncome > ssThreshold2 ? 'bg-red-500' : 'bg-slate-600'}`}></div>
              <span className={combinedIncome > ssThreshold2 ? 'text-red-400' : 'text-slate-500'}>Above {formatCurrency(ssThreshold2)}: up to 85% taxable</span>
            </div>
          </div>
          <div className="flex justify-between border-t border-slate-700 pt-2 mt-2">
            <span className="text-slate-300 font-medium">Taxable SS</span>
            <span className="text-amber-400 font-bold">{formatCurrency(Math.round(taxableSS))} <span className="text-slate-500 font-normal">({ssPct}% of {formatCurrency(p.socialSecurity)})</span></span>
          </div>
        </div>
      </div>
      
      {/* Standard Deduction & Taxable Income */}
      <div className="mb-5">
        <h5 className="text-sm font-semibold text-slate-300 mb-2 border-b border-slate-700 pb-1">Taxable Income Calculation</h5>
        <div className="bg-slate-800/40 rounded-lg p-3 text-xs space-y-2">
          <div className="flex justify-between">
            <span className="text-slate-400">Taxable non-SS income (earned + pension + withdrawal{rothConversion > 0 ? ' + Roth conv.' : ''} − QCD)</span>
            <span className="text-slate-300">{formatCurrency(Math.round(nonSSIncome))}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">+ Taxable Social Security ({ssPct}%)</span>
            <span className="text-slate-300">{formatCurrency(Math.round(taxableSS))}</span>
          </div>
          <div className="flex justify-between border-t border-slate-700 pt-1">
            <span className="text-slate-300">= Gross taxable income</span>
            <span className="text-slate-100 font-semibold">{formatCurrency(Math.round(grossTaxableIncome))}</span>
          </div>
          {preTaxDeduction > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-400">− Pre-tax retirement contributions (401k/403b/IRA)</span>
              <span className="text-emerald-400">−{formatCurrency(Math.round(preTaxDeduction))}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-slate-400">− Standard deduction</span>
            <span className="text-red-400">−{formatCurrency(adjDeduction)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-700 pt-1">
            <span className="text-slate-100 font-semibold">= Federal taxable income</span>
            <span className="text-amber-400 font-bold text-sm">{formatCurrency(taxableIncome)}</span>
          </div>
          {preTaxDeduction > 0 && (
            <div className="flex justify-between mt-2 pt-2 border-t border-slate-700/50">
              <span className="text-slate-400">MAGI (adds back pre-tax contributions)</span>
              <span className="text-amber-400">{formatCurrency(Math.round(magi))}</span>
            </div>
          )}
        </div>
      </div>
      
      {/* Federal Bracket Breakdown */}
      <div className="mb-5">
        <h5 className="text-sm font-semibold text-slate-300 mb-2 border-b border-slate-700 pb-1">Federal Tax by Bracket</h5>
        <div className="space-y-1.5">
          {bracketDetails.map((b, i) => (
            <div key={i} className={`rounded-lg p-2.5 text-xs ${b.filled ? 'bg-slate-800/60' : 'bg-slate-800/20'}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded font-bold text-xs ${
                    b.rateNum <= 0.12 ? 'bg-emerald-500/20 text-emerald-400' :
                    b.rateNum <= 0.22 ? 'bg-yellow-500/20 text-yellow-400' :
                    b.rateNum <= 0.24 ? 'bg-orange-500/20 text-orange-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>{b.rate}</span>
                  <span className="text-slate-500">
                    {formatCurrency(b.rangeStart)} – {b.rangeEnd === Infinity ? '∞' : formatCurrency(b.rangeEnd)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {b.filled && (
                    <>
                      <span className="text-slate-300">{formatCurrency(b.incomeInBracket)}</span>
                      <span className="text-slate-500">×</span>
                      <span className="text-slate-400">{b.rate}</span>
                      <span className="text-slate-500">=</span>
                      <span className={`font-semibold ${b.rateNum <= 0.12 ? 'text-emerald-400' : b.rateNum <= 0.22 ? 'text-yellow-400' : b.rateNum <= 0.24 ? 'text-orange-400' : 'text-red-400'}`}>
                        {formatCurrency(b.taxInBracket)}
                      </span>
                    </>
                  )}
                  {!b.filled && <span className="text-slate-500 italic">—</span>}
                </div>
              </div>
              {b.filled && (
                <div className="mt-1">
                  <div className="w-full bg-slate-700/50 rounded-full h-1.5">
                    <div 
                      className={`h-1.5 rounded-full ${
                        b.rateNum <= 0.12 ? 'bg-emerald-500' :
                        b.rateNum <= 0.22 ? 'bg-yellow-500' :
                        b.rateNum <= 0.24 ? 'bg-orange-500' :
                        'bg-red-500'
                      }`}
                      style={{ width: `${b.full ? 100 : Math.max(3, (b.incomeInBracket / (b.width || 1)) * 100)}%` }}
                    ></div>
                  </div>
                  {b.remaining !== null && b.remaining > 0 && (
                    <div className="text-slate-500 text-xs mt-0.5">{formatCurrency(b.remaining)} room remaining in bracket</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      
      {/* State Tax */}
      <div className="mb-5">
        <h5 className="text-sm font-semibold text-slate-300 mb-2 border-b border-slate-700 pb-1">State Tax — {personalInfo.state}</h5>
        <div className="bg-slate-800/40 rounded-lg p-3 text-xs space-y-2">
          {stateRate === 0 ? (
            <div className="text-emerald-400">No state income tax</div>
          ) : (
            <>
              <div className="flex justify-between">
                <span className="text-slate-400">State taxable income {stateExemptSS ? '(SS exempt)' : '(includes SS)'}</span>
                <span className="text-slate-300">{formatCurrency(stateTaxableIncome)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">× State rate</span>
                <span className="text-slate-300">{(stateRate * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between border-t border-slate-700 pt-1">
                <span className="text-slate-300 font-medium">State tax</span>
                <span className="text-orange-400 font-bold">{formatCurrency(stateTax)}</span>
              </div>
              {stateExemptSS && taxableSS > 0 && (
                <div className="text-emerald-400/80 text-xs mt-1">
                  ✓ {personalInfo.state} does not tax Social Security — {formatCurrency(Math.round(taxableSS))} excluded from state taxable income
                </div>
              )}
              {stateExemptRetirement && retirementIncomeForExemption > 0 && (
                <div className="text-emerald-400/80 text-xs mt-1">
                  ✓ {personalInfo.state} exempts pension income — {formatCurrency(Math.round(retirementIncomeForExemption))} excluded from state taxable income
                </div>
              )}
            </>
          )}
        </div>
      </div>
      
      {/* FICA / Payroll Tax */}
      {ficaTax > 0 && (
        <div className="mb-5">
          <h5 className="text-sm font-semibold text-slate-300 mb-2 border-b border-slate-700 pb-1">FICA / Payroll Tax</h5>
          <div className="bg-slate-800/40 rounded-lg p-3 text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-400">Earned income subject to FICA</span>
              <span className="text-slate-300">{formatCurrency(p.earnedIncome)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Social Security (6.2%, capped at wage base)</span>
              <span className="text-slate-300">included</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Medicare (1.45% + 0.9% Additional)</span>
              <span className="text-slate-300">included</span>
            </div>
            <div className="flex justify-between border-t border-slate-700 pt-1">
              <span className="text-slate-300 font-medium">Total FICA (employee share)</span>
              <span className="text-orange-400 font-bold">{formatCurrency(ficaTax)}</span>
            </div>
          </div>
        </div>
      )}
      
      {/* IRMAA */}
      {isMedicareAge && irmaa && (
        <div className="mb-5">
          <h5 className="text-sm font-semibold text-slate-300 mb-2 border-b border-slate-700 pb-1">Medicare IRMAA</h5>
          <div className="bg-slate-800/40 rounded-lg p-3 text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-400">MAGI (all income incl. full SS)</span>
              <span className="text-slate-300">{formatCurrency(Math.round(magi))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">IRMAA tier</span>
              <span className="text-slate-300">Tier {irmaa.tier}{irmaa.tier === 0 ? ' (base — no surcharge)' : ''}</span>
            </div>
            {irmaa.tier > 0 && (
              <>
                <div className="flex justify-between">
                  <span className="text-slate-400">Part B monthly premium</span>
                  <span className="text-pink-400">${irmaa.partBMonthly.toFixed(2)}/mo</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Part D surcharge</span>
                  <span className="text-pink-400">${irmaa.partDMonthly.toFixed(2)}/mo</span>
                </div>
                <div className="flex justify-between border-t border-slate-700 pt-1">
                  <span className="text-slate-300 font-medium">Annual IRMAA surcharge</span>
                  <span className="text-pink-400 font-bold">{formatCurrency(irmaa.totalAnnual)}</span>
                </div>
              </>
            )}
            {irmaa.tier === 0 && (
              <div className="text-emerald-400/80">✓ Below IRMAA threshold — standard Medicare premiums apply</div>
            )}
          </div>
        </div>
      )}
      
      {/* Earnings Test Notice */}
      {(p.ssEarningsTestReduction || 0) > 0 && (
        <div className="mb-5 bg-amber-900/20 border border-amber-700/30 rounded-lg p-3">
          <p className="text-xs text-amber-300">
            <strong>⚠️ SS Earnings Test:</strong> {formatCurrency(p.ssEarningsTestReduction)} of Social Security benefits withheld this year due to earned income above the annual limit. 
            SSA will recalculate your benefit upward at FRA to credit the withheld months, but cash flow is reduced now.
          </p>
        </div>
      )}
      
      {/* ── Every tax this year, in one list ─────────────────────────────── */}
      {/* The bracket walk above covers ordinary income only. federalTax also
          contains preferential gains, NIIT and two penalties, so a reader who
          added up the bracket rows and compared them to "federal tax" would find
          a gap with nothing on screen to explain it. */}
      <div className="mb-5">
        <h5 className="text-sm font-semibold text-slate-300 mb-2 border-b border-slate-700 pb-1">Every Tax This Year</h5>
        <div className="space-y-1 text-xs">
          {[
            ['Federal — ordinary income', p.federalOrdinaryTax, 'The bracket walk above.'],
            ['Federal — long-term gains & qualified dividends', p.capitalGainsTax, 'Taxed on their own 0/15/20% schedule, stacked above ordinary income.'],
            ['Net investment income tax', p.niitTax, '3.8% on investment income once MAGI passes the §1411 threshold. Never indexed.'],
            ['§72(t) early withdrawal penalty', p.earlyWithdrawalPenalty, '10% additional tax on pre-59½ distributions without an exception.'],
            ['HSA non-qualified penalty', p.hsaPenalty, '20% additional tax under §223(f) before age 65.'],
            [`State — ${personalInfo.state}`, p.stateTax, null],
            ['FICA / payroll', p.ficaTax, 'Social Security and Medicare on earned income.'],
            ['Medicare IRMAA surcharge', p.irmaaSurcharge, 'Set by MAGI from two years ago, not this year.'],
          ].filter(([, v]) => (v || 0) !== 0).map(([label, v, note]) => (
            <div key={label} className="flex justify-between items-start gap-3 py-0.5">
              <span className="text-slate-400">
                {label}
                {note && <span className="block text-[10px] text-slate-500">{note}</span>}
              </span>
              <span className="text-slate-200 tabular-nums whitespace-nowrap">{formatCurrency(v)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-slate-700 pt-1 mt-1">
            <span className="text-slate-300 font-medium">Everything above</span>
            <span className="text-slate-100 font-semibold tabular-nums">
              {formatCurrency((p.federalTax || 0) + (p.stateTax || 0) + (p.ficaTax || 0) + (p.irmaaSurcharge || 0))}
            </span>
          </div>
          {(p.acaSubsidy || 0) > 0 && (
            <div className="flex justify-between text-emerald-400/90 pt-1">
              <span>ACA premium credit (not a tax — a subsidy this income still qualifies for)</span>
              <span className="tabular-nums">−{formatCurrency(p.acaSubsidy)}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── What one more dollar costs ───────────────────────────────────── */}
      {marginal && (
        <div className="mb-5">
          <h5 className="text-sm font-semibold text-slate-300 mb-2 border-b border-slate-700 pb-1">
            The Next Dollar — Income or Roth Conversion
          </h5>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
            <span className="text-3xl font-semibold text-amber-400">{(marginal.rate * 100).toFixed(1)}%</span>
            <span className="text-xs text-slate-400">
              all-in on the next {formatCurrency(marginal.probe)} of ordinary income
            </span>
            {Math.abs(marginal.rate - (p.currentBracket || 0)) > 0.001 && (
              <span className="text-[11px] text-slate-500">
                — your ordinary bracket alone is {(marginal.ratePoints.bracket * 100).toFixed(0)}%
              </span>
            )}
          </div>
          <div className="space-y-0.5 text-xs">
            {[
              ['Ordinary brackets', marginal.components.bracket, marginal.ratePoints.bracket, null],
              ['Social Security dragged into tax', marginal.components.ssTorpedo, marginal.ratePoints.ssTorpedo,
                marginal.detail.ssTaxableShareBefore !== null
                  ? `taxable share ${(marginal.detail.ssTaxableShareBefore * 100).toFixed(1)}% → ${(marginal.detail.ssTaxableShareAfter * 100).toFixed(1)}%`
                  : null],
              ['Senior deduction phasing out', marginal.components.deductionPhaseout, marginal.ratePoints.deductionPhaseout,
                marginal.detail.deductionLost > 0 ? `${formatCurrency(marginal.detail.deductionLost)} of deduction lost` : null],
              ['Capital gains re-rated / NIIT', marginal.components.preferential, marginal.ratePoints.preferential, null],
              [`State — ${personalInfo.state}`, marginal.components.state, marginal.ratePoints.state, null],
              ['Medicare IRMAA, two years out', marginal.components.irmaa, marginal.ratePoints.irmaa,
                marginal.detail.crossedIrmaaEdge ? 'this dollar crosses a tier edge' : null],
            ].filter(([, v]) => Math.abs(v || 0) >= 0.5).map(([label, v, rate, note]) => (
              <div key={label} className="flex justify-between items-start gap-3">
                <span className="text-slate-400">
                  {label}
                  {note && <span className="block text-[10px] text-amber-400/70">{note}</span>}
                </span>
                <span className="text-slate-300 tabular-nums whitespace-nowrap">
                  {formatCurrency(v)} <span className="text-slate-500">({(rate * 100).toFixed(1)} pts)</span>
                </span>
              </div>
            ))}
          </div>

          {marginal.nextThresholds.length > 0 && (
            <div className="mt-3 pt-2 border-t border-slate-700/60">
              <p className="text-[11px] text-slate-500 mb-1">
                How far this year can go before the rate changes:
              </p>
              {marginal.nextThresholds.map(t => (
                <div key={t.label} className="flex justify-between items-start gap-3 text-xs py-0.5">
                  <span className="text-slate-400">
                    {t.label}
                    <span className="text-[10px] text-slate-500"> · on {t.basis}</span>
                  </span>
                  <span className="whitespace-nowrap">
                    <span className={t.distance < 25000 ? 'text-amber-300' : 'text-emerald-400'}>
                      {formatCurrency(t.distance)} of room
                    </span>
                    {t.crossingCost > 0 && (
                      <span className="text-red-400/80"> · then {formatCurrency(t.crossingCost)} at once</span>
                    )}
                    {!t.crossingCost && t.crossingCostRate
                      ? <span className="text-slate-500"> · then +{(t.crossingCostRate * 100).toFixed(1)}%/$</span> : null}
                  </span>
                </div>
              ))}
            </div>
          )}
          {Math.abs(marginal.reconstructionError || 0) > 25 && (
            <p className="text-[10px] text-slate-500 mt-2">
              Rebuilt tax for this year differs from the projection&rsquo;s own figure by
              {' '}{formatCurrency(Math.abs(marginal.reconstructionError))}; treat the split above as indicative.
            </p>
          )}
        </div>
      )}

      {/* Summary */}
      <div>
        <h5 className="text-sm font-semibold text-slate-300 mb-2 border-b border-slate-700 pb-1">Tax Summary — Age {selectedAge}</h5>
        <div className="flex flex-wrap gap-3">
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-center">
            <div className="text-slate-400 text-xs">Federal Tax</div>
            <div className="text-red-400 font-bold text-lg">{formatCurrency(totalFedTax)}</div>
          </div>
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-2 text-center">
            <div className="text-slate-400 text-xs">State Tax{stateExemptRetirement ? ' (pension exempt)' : ''}</div>
            <div className="text-orange-400 font-bold text-lg">{formatCurrency(stateTax)}</div>
          </div>
          {ficaTax > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2 text-center">
              <div className="text-slate-400 text-xs">FICA (Payroll)</div>
              <div className="text-yellow-400 font-bold text-lg">{formatCurrency(ficaTax)}</div>
            </div>
          )}
          {irmaaSurcharge > 0 && (
            <div className="bg-pink-500/10 border border-pink-500/30 rounded-lg px-3 py-2 text-center">
              <div className="text-slate-400 text-xs">IRMAA Surcharge</div>
              <div className="text-pink-400 font-bold text-lg">{formatCurrency(irmaaSurcharge)}</div>
            </div>
          )}
          {(p.healthcareExpense || 0) > 0 && (
            <div className="bg-pink-500/10 border border-pink-500/30 rounded-lg px-3 py-2 text-center">
              <div className="text-slate-400 text-xs">Healthcare Costs</div>
              <div className="text-pink-400 font-bold text-lg">{formatCurrency(p.healthcareExpense)}</div>
              <div className="text-slate-500 text-xs">
                {p.healthcarePre65 > 0 ? 'Pre-Medicare' : 'Medicare+OOP'}
                {p.healthcareLTC > 0 && ' +LTC'}
              </div>
            </div>
          )}
          {(p.recurringExpenses || 0) > 0 && (
            <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg px-3 py-2 text-center">
              <div className="text-slate-400 text-xs">Recurring Expenses</div>
              <div className="text-cyan-400 font-bold text-lg">{formatCurrency(p.recurringExpenses)}</div>
            </div>
          )}
          <div className="bg-slate-500/10 border border-slate-500/30 rounded-lg px-3 py-2 text-center">
            <div className="text-slate-400 text-xs">Total Tax</div>
            <div className="text-slate-100 font-bold text-lg">{formatCurrency(totalTax)}</div>
            {/* "Average", not "effective": the Roth simulator uses a marginal
                rate on converted dollars, and one tab must not use the same
                word for both. */}
            <div className="text-slate-500 text-xs">{effectiveRate.toFixed(1)}% average rate on taxable income</div>
          </div>
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2 text-center">
            <div className="text-slate-400 text-xs">Net After Tax</div>
            <div className="text-emerald-400 font-bold text-lg">{formatCurrency(Math.round(netAfterTax))}</div>
            <div className="text-slate-500 text-xs">of {formatCurrency(Math.round(grossIncome))} gross</div>
          
          {(p.healthcareExpense || 0) > 0 && (
            <div className="bg-pink-500/10 border border-pink-500/30 rounded-lg px-3 py-2 text-center">
              <div className="text-slate-400 text-xs">Healthcare</div>
              <div className="text-pink-400 font-bold text-lg">{formatCurrency(p.healthcareExpense)}</div>
              <div className="text-slate-500 text-xs">
                {p.healthcarePre65 > 0 && 'Pre-65 '}
                {p.healthcareMedicare > 0 && 'Medicare '}
                {p.healthcareLTC > 0 && 'LTC'}
              </div>
            </div>
          )}
          {(p.recurringExpenses || 0) > 0 && (
            <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg px-3 py-2 text-center">
              <div className="text-slate-400 text-xs">Recurring Expenses</div>
              <div className="text-cyan-400 font-bold text-lg">{formatCurrency(p.recurringExpenses)}</div>
            </div>
          )}
</div>
        </div>
        {/* This used to read qcd x marginal bracket, federal only — which is the
            smallest part of what the exclusion does and understated it by half
            on a typical plan. The figure below is measured: the same year priced
            with and without the exclusion, so it carries state tax, the Social
            Security the money would have dragged into tax, any Medicare
            surcharge, and the senior deduction the higher AGI would have phased
            out. */}
        {(p.qcd || 0) > 0 && (() => {
          const y = qcdSavings && qcdSavings.years.find(x => x.year === p.year);
          if (!y) return (
            <p className="text-xs text-emerald-400/70 mt-2">
              💡 QCD of {formatCurrency(p.qcd)} excluded from taxable income entirely — and still leaves
              the standard deduction intact.
            </p>
          );
          return (
            <p className="text-xs text-emerald-400/70 mt-2 leading-relaxed">
              💡 QCD of {formatCurrency(y.qcd)} excluded from income saves{' '}
              <strong>{formatCurrency(y.saved)}</strong> this year —{' '}
              {(y.ratePerDollar * 100).toFixed(0)}¢ per dollar given
              {' '}({formatCurrency(y.federal)} federal
              {y.state > 0 ? ` + ${formatCurrency(y.state)} state` : ''}
              {y.irmaa > 0 ? ` + ${formatCurrency(y.irmaa)} Medicare surcharge` : ''})
              {y.ssPulledIntoTax > 0 && <>, and keeps {formatCurrency(y.ssPulledIntoTax)} of Social
                Security out of tax that an ordinary withdrawal would have dragged in</>}.
              Giving the same amount by cheque from a taxable account would save none of it, because the
              standard deduction means the gift never reaches Schedule A.
            </p>
          );
        })()}
      </div>
    </div>
  );
}

// Direct label at the END of a line series. Recharts' `label` prop renders on
// every point, which on a 35-year series is a wall of text, so this renders only
// at a caller-supplied index. Direct labels let the chart be read without
// pairing each color back to the legend, and they double as the non-color
// encoding of series identity.
//
// The index is passed in rather than sniffed from Recharts internals (which vary
// by version), and is the last point with a NON-NULL value — a series that stops
// early must be labelled where it actually ends, not off in the empty tail.
const lastPointLabel = (text, fill, atIndex) => (props) => {
  const { x, y, index } = props;
  if (index !== atIndex || x == null || y == null) return null;
  return (
    <text x={x + 8} y={y} dy={4} fill={fill} fontSize={11} textAnchor="start">{text}</text>
  );
};

// Tooltip for the lifetime rate curve. The default tooltip showed three bare
// percentages, which meant a year could read 122% with nothing on screen to say
// why — the decomposition was computed, shipped to the client, and thrown away.
//
// The two-year IRMAA offset is the single most confusing thing about this
// metric, so the surcharge line always names the age it actually lands at.
function RateCurveTooltip({ active, payload, label, probeAmount }) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0] && payload[0].payload;
  if (!row) return null;
  const c = row.components;
  const pct = (v) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`);
  const money = (v) => formatCurrency(Math.round(v || 0));

  // Name the dominant contributor. "34.8%" invites the reader to blame their tax
  // bracket; "driver: Medicare surcharge" tells them where to actually look.
  let driver = null;
  if (c && c.totalCost > 0) {
    const parts = [
      { label: 'income tax', v: c.taxDeltaExIrmaa },
      { label: 'Medicare surcharge (IRMAA)', v: c.irmaaDelta },
      { label: 'lost ACA subsidy', v: c.acaSubsidyLost },
    ].sort((a, b) => b.v - a.v);
    if (parts[0].v > 0) driver = parts[0].label;
  }

  return (
    <div style={{ backgroundColor: THEME.surfaceRaised, border: `1px solid ${THEME.grid}`, borderRadius: 8, padding: '10px 12px', fontSize: 12, color: THEME.inkPrimary, maxWidth: 320 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Age {label}</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ color: SERIES.pension }}>Cost of converting {formatCurrency(probeAmount)}</span>
        <strong>{pct(row.marginalRate)}</strong>
      </div>
      {driver && <div style={{ color: THEME.inkMuted, fontSize: 11, marginBottom: 6 }}>driver: {driver}</div>}

      {c && (
        <div style={{ margin: '6px 0', paddingLeft: 8, borderLeft: '2px solid #334155', color: THEME.inkSecondary }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span>income tax</span><span>{money(c.taxDeltaExIrmaa)} · {(c.ratePoints.incomeTax * 100).toFixed(1)} pts</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span>IRMAA{c.irmaaDelta > 0 ? ` (lands at ${row.age + 2})` : ''}</span>
            <span>{money(c.irmaaDelta)} · {(c.ratePoints.irmaa * 100).toFixed(1)} pts</span>
          </div>
          {c.acaSubsidyLost !== 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span>ACA subsidy lost</span><span>{money(c.acaSubsidyLost)} · {(c.ratePoints.aca * 100).toFixed(1)} pts</span>
            </div>
          )}
          {row.converted > 0 && row.converted < probeAmount * 0.99 && (
            <div style={{ color: '#fbbf24', marginTop: 4 }}>
              only {money(row.converted)} could be converted — rate is on that amount
            </div>
          )}
          {/* A tripped cliff is a fixed toll, not a rate. Measured against a
              small probe it reads as a catastrophic percentage, which invites
              exactly the wrong conclusion — "never convert in this year" rather
              than "this is close to the worst amount to convert in this year".
              The surcharge does not grow with the conversion, so a larger one
              spreads the same dollars over a larger base. */}
          {c.irmaaDelta > 0 && (
            <div style={{ color: THEME.inkMuted, marginTop: 4 }}>
              This {money(c.irmaaDelta)} surcharge is fixed regardless of conversion size —
              converting more spreads it over a larger base, converting less may avoid it entirely.
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: SERIES.socialSecurity }}>
        <span>Average rate you pay</span><span>{pct(row.effectiveRate)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: SERIES.otherIncome }}>
        <span>Tax bracket</span><span>{pct(row.bracket)}</span>
      </div>

      {row.cliffHeadroom !== null && row.cliffHeadroom !== undefined && (
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${THEME.grid}`, color: row.cliffHeadroom < 15000 ? '#fbbf24' : '#94a3b8', fontSize: 11 }}>
          {money(row.cliffHeadroom)} of room before the next Medicare tier
          {row.cliffHeadroom < 15000 ? ' — any extra income here trips it, not just a conversion' : ''}
        </div>
      )}
    </div>
  );
}

const lastDefinedIndex = (rows, key) => {
  for (let i = rows.length - 1; i >= 0; i--) {
    const v = rows[i][key];
    if (v !== null && v !== undefined) return i;
  }
  return -1;
};

// ============================================
// RothConversionSimulator — Lifted to module scope
// ============================================
// Heuristic suggested pre-tax floor (today's $): the pool of pre-tax dollars
// worth preserving rather than converting, sized to cover two tax-efficient uses
// across the rest of the plan — (1) lifetime QCD giving (needs an IRA balance at
// 70+) and (2) the unused room under the 12% bracket each year (pre-tax dollars
// you could withdraw at ≤12%). Computed from the NO-conversion baseline so it
// reflects the user's own giving/income, then deflated to today's dollars. This
// is a rough sizing aid, not an optimizer.
function suggestPreTaxFloor(baselineProj, pi) {
  if (!baselineProj || !baselineProj.length) return 0;
  const inflation = pi.inflationRate || 0.03;
  const myAge = pi.myAge;
  let total = 0;
  for (const row of baselineProj) {
    const age = row.myAge;
    if (age == null) continue;
    const yearsFromNow = age - myAge;
    if (yearsFromNow < 0) continue;
    // Two different clocks, previously conflated into one factor. The QCD limit,
    // standard deduction and bracket tops are TAX figures and index from
    // BASE_TAX_YEAR; the final deflation converts a nominal future dollar back to
    // today's purchasing power and so measures from TODAY. They coincide only
    // while the app runs in the base year. See engine BASE_TAX_YEAR.
    const taxFactor = indexTo(1, row.year - BASE_TAX_YEAR, inflation);
    const todayFactor = Math.pow(1 + inflation, yearsFromNow);
    const fs = row.filingStatus || pi.filingStatus || 'married_joint';
    // (1) QCD giving this year, capped at the household QCD limit
    let qcdYear = 0;
    if (age >= QCD_START_AGE) {
      const householdQCD = (fs === 'married_joint' ? 2 : 1) * QCD_ANNUAL_LIMIT * taxFactor;
      qcdYear = Math.min(row.charitableGiving || 0, householdQCD);
    }
    // (2) room remaining under the top of the 12% bracket (post-std-deduction)
    const fsBrackets = FEDERAL_TAX_BRACKETS_2026[fs] || FEDERAL_TAX_BRACKETS_2026.married_joint;
    const twelve = fsBrackets.find(b => b.rate === 0.12);
    const adjDed = (STANDARD_DEDUCTION_2026[fs] || STANDARD_DEDUCTION_2026.married_joint) * taxFactor;
    let lowRoom = 0;
    if (twelve) {
      const netTaxable = Math.max(0, (row.taxableIncome || 0) - adjDed);
      lowRoom = Math.max(0, twelve.max * taxFactor - netTaxable);
    }
    total += (qcdYear + lowRoom) / todayFactor; // deflate to today's $
  }
  return Math.round(total);
}

// ── THE CONVERSION STRATEGY ─────────────────────────────────────────────────
// Every input that shapes a planned Roth conversion. The strategy editor works
// on a draft of exactly these, so Save writes these and nothing else — and a
// draft is "unsaved" exactly when one of them differs from the plan.
const ROTH_STRATEGY_FIELDS = [
  'rothConversionAmount', 'rothConversionBracket', 'rothConversionIrmaaTier', 'rothConversionStages',
  'rothConversionStartAge', 'rothConversionEndAge', 'rothConversionInflationAdjust',
  'rothConversionTaxSource', 'rothConversionPreTaxFloor', 'rothConversionGuardrailEnabled',
  'rothConversionGuardrailReturnFloor', 'rothConversionGuardrailFloor',
];
const pickRothStrategy = (pi) => {
  const out = {};
  ROTH_STRATEGY_FIELDS.forEach(k => { out[k] = pi[k] === undefined ? null : pi[k]; });
  return out;
};
const sameRothStrategy = (a, b) => JSON.stringify(pickRothStrategy(a)) === JSON.stringify(pickRothStrategy(b));

// The fields themselves, written once. They lived on Personal Info until
// v2.48.0, while the simulator on Tax Planning had a second, smaller set of its
// own for the same settings (no guardrail, no inflation switch, no per-stage
// editing) — so which strategies you could express depended on which screen you
// were on. `set(field, value)` is the caller's: the editor feeds a draft.
function RothStrategyFields({ info, set, suggestedFloor = 0 }) {
  const compactInputStyle = "w-full bg-slate-900/80 border border-slate-600/50 rounded px-3 py-1.5 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500/50 transition-all text-sm";
  const compactLabelStyle = "text-xs font-medium text-slate-400";
  return (
    <div>
      {/* Mode row. Mutually exclusive — switching one clears the others, or
          the engine would see two ceilings at once. "No conversions" is a mode
          of its own: it used to be spelled "Fixed Amount, $0", which is how a
          plan reads as having a strategy when it has none. */}
      {(() => {
        // The ENGINE resolves an explicit schedule before any scalar mode
        // (conversionStagesOf), so this row has to as well.
        const stagedMode = Array.isArray(info.rothConversionStages)
          && info.rothConversionStages.length > 0;
        const irmaaMode = !stagedMode && Number.isInteger(info.rothConversionIrmaaTier);
        const bracketMode = !stagedMode && !!info.rothConversionBracket && !irmaaMode;
        const fixedMode = !stagedMode && !irmaaMode && !bracketMode && (info.rothConversionAmount || 0) > 0;
        const btn = (active) => `px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
          active ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                 : 'text-slate-400 border-slate-600/50 hover:text-slate-200 hover:bg-slate-700/50'}`;
        const clear = () => { set('rothConversionStages', null); set('rothConversionBracket', ''); set('rothConversionIrmaaTier', null); set('rothConversionAmount', 0); };
        return (
          <div className="flex flex-wrap gap-2 mb-4">
            <button onClick={clear} className={btn(!stagedMode && !irmaaMode && !bracketMode && !fixedMode)}>No conversions</button>
            <button
              onClick={() => { const amt = info.rothConversionAmount || 50000; clear(); set('rothConversionAmount', amt); }}
              className={btn(fixedMode)}
            >Fixed Amount</button>
            <button
              onClick={() => { clear(); set('rothConversionBracket', '22%'); }}
              className={btn(bracketMode)}
            >Fill to Bracket</button>
            <button
              onClick={() => { clear(); set('rothConversionIrmaaTier', 0); }}
              className={btn(irmaaMode)}
            >Fill to IRMAA Tier</button>
            <button
              onClick={() => { clear(); set('rothConversionStages', irmaaAwareConversionStages(info)); }}
              className={btn(stagedMode)}
            >Staged schedule</button>
          </div>
        );
      })()}

      {rothConversionIsPlanned(info) || (Array.isArray(info.rothConversionStages) && info.rothConversionStages.length > 0) ? (<>

          {Array.isArray(info.rothConversionStages) && info.rothConversionStages.length > 0 && (
            <p className="text-[11px] text-purple-300/80 mb-3 leading-snug">
              A staged schedule is in force, and the engine runs it ahead of any single target.
              {' '}Edit the stages below; the single-target fields are hidden while it applies.
              {' '}Choosing another mode above replaces the schedule.
            </p>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Fixed amount input OR bracket selector. Hidden entirely while a
                staged schedule governs — showing a ceiling the plan is not using
                is what made this section contradict itself. */}
            {Array.isArray(info.rothConversionStages) && info.rothConversionStages.length > 0 ? null
             : Number.isInteger(info.rothConversionIrmaaTier) ? (
              <div className="col-span-2">
                <label className={compactLabelStyle}>Stay Within IRMAA Tier</label>
                <select
                  value={info.rothConversionIrmaaTier}
                  onChange={e => set('rothConversionIrmaaTier', Number(e.target.value))}
                  className={compactInputStyle}
                >
                  {irmaaTierOptions(info.filingStatus,
                      info.filingStatus === 'married_joint' ? 2 : 1)
                    .filter(o => !o.isTop)
                    .map(o => (
                      <option key={o.index} value={o.index}>
                        MAGI up to {formatCurrency(o.ceiling)} — surcharge {formatCurrency(o.annualSurchargePerHousehold)}/yr
                      </option>
                    ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                  Converts up to {formatCurrency(IRMAA_FILL_SAFETY_MARGIN)} below that MAGI edge, measured against the
                  threshold for the year the surcharge is actually paid — IRMAA runs on a two-year lookback, so a
                  conversion now sets the premium two years from now. Crossing an edge by a single dollar costs the
                  whole tier step, which is why the tool stops short of it rather than on it.
                  {' '}Before age 63 there is no IRMAA consequence yet, so in those years this simply acts as a MAGI ceiling.
                </p>
              </div>
            ) : !info.rothConversionBracket ? (
              <div>
                <label className={compactLabelStyle}>Annual Conversion Amount</label>
                <CurrencyCell
                  value={info.rothConversionAmount || 0}
                  onValueChange={v => set('rothConversionAmount', v)}
                  className={compactInputStyle}
                />
                <label className="flex items-start gap-1.5 mt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={info.rothConversionInflationAdjust !== false}
                    onChange={e => set('rothConversionInflationAdjust', e.target.checked)}
                    className="w-3.5 h-3.5 mt-0.5 rounded border-slate-600 bg-slate-800 text-purple-500"
                  />
                  <span className="text-[10px] text-slate-500">
                    Adjust for inflation — amount is today's $, indexed each year so it keeps filling the
                    same real bracket space. Uncheck to convert this exact nominal amount every year.
                  </span>
                </label>
              </div>
            ) : (
              <div>
                <label className={compactLabelStyle}>Target Tax Bracket</label>
                <select 
                  value={info.rothConversionBracket || '22%'} 
                  onChange={e => set('rothConversionBracket', e.target.value)} 
                  className={compactInputStyle}
                >
                  <option value="12%">12% Bracket</option>
                  <option value="22%">22% Bracket</option>
                  <option value="24%">24% Bracket</option>
                  <option value="32%">32% Bracket</option>
                </select>
              </div>
            )}
            <div>
              <label className={compactLabelStyle}>Start Age</label>
              <AgeCell
                value={info.rothConversionStartAge}
                onChange={e => set('rothConversionStartAge', Number(e.target.value) || 0)}
                className={compactInputStyle}
              />
              <p className="text-[10px] text-slate-500 mt-0.5">
                {(info.rothConversionStartAge || 0) === 0
                  ? `Defaults to retirement age (${getDefaultRothConversionWindow(info).startAge})`
                  : `Smart default: ${getDefaultRothConversionWindow(info).startAge} (retirement age)`}
              </p>
            </div>
            <div>
              <label className={compactLabelStyle}>End Age</label>
              <AgeCell
                value={info.rothConversionEndAge}
                onChange={e => set('rothConversionEndAge', Number(e.target.value) || 0)}
                className={compactInputStyle}
              />
              <p className="text-[10px] text-slate-500 mt-0.5">
                {(info.rothConversionEndAge || 0) === 0
                  ? `Defaults to ${getDefaultRothConversionWindow(info).endAge} (year before RMDs at age ${getRmdStartAge(info.myBirthYear)})`
                  : `Smart default: ${getDefaultRothConversionWindow(info).endAge} (year before RMDs at age ${getRmdStartAge(info.myBirthYear)})`}
              </p>
            </div>
            <div>
              <label className={compactLabelStyle}>Tax Payment Source</label>
              <select
                value={info.rothConversionTaxSource || 'withdrawal'}
                onChange={e => set('rothConversionTaxSource', e.target.value)}
                className={compactInputStyle}
              >
                <option value="withdrawal">Normal Withdrawal Priority</option>
                <option value="brokerage">Pay from Brokerage</option>
              </select>
            </div>
            <div>
              <label className={compactLabelStyle}>Preserve Pre-Tax Floor</label>
              <CurrencyCell
                value={info.rothConversionPreTaxFloor || 0}
                onValueChange={v => set('rothConversionPreTaxFloor', v)}
                className={compactInputStyle}
              />
                <p className="text-[10px] text-slate-500 mt-0.5">
          Stop converting once pre-tax (today's $) hits this — keeps room for QCDs and low-bracket withdrawals. 0 = convert per the window.
          {suggestedFloor > 0 && (
            <span className="block mt-0.5">
              Suggested: <span className="text-amber-400">{formatCurrency(suggestedFloor)}</span>
              <button
                onClick={() => set('rothConversionPreTaxFloor', suggestedFloor)}
                className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30"
              >
                Use it
              </button>
            </span>
          )}
        </p>
            </div>
          </div>

          {/* Guardrail — the only setting here that changes conversions YEAR BY
              YEAR rather than setting a fixed rule for all of them. */}
          <div className="mt-3 p-3 bg-slate-800/60 border border-slate-700/50 rounded-lg">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!info.rothConversionGuardrailEnabled}
                onChange={e => set('rothConversionGuardrailEnabled', e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-slate-600 bg-slate-800 text-amber-500"
              />
              <span className="text-sm text-slate-300">
                Pause conversions when the portfolio is down
                <span className="block text-[11px] text-slate-500 leading-relaxed mt-0.5">
                  A conversion is a discretionary, irreversible tax bill funded by selling assets. Paying it
                  in a falling market sells shares cheap and removes the ones that would have carried the
                  recovery. This waits instead.
                </span>
              </span>
            </label>
            {info.rothConversionGuardrailEnabled && (
              <div className="grid grid-cols-2 gap-3 mt-3 pl-6">
                <div>
                  <label className={compactLabelStyle}>Pause after a year returning less than</label>
                  <PercentCell
                    value={info.rothConversionGuardrailReturnFloor ?? 0}
                    onValueChange={v => set('rothConversionGuardrailReturnFloor', Math.min(0.15, Math.max(-0.5, v)))}
                    className={compactInputStyle}
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    The prior year&rsquo;s investment return, not the balance. A plan that is spending and
                    paying conversion tax sees its balance fall in a perfectly good year — only the return
                    separates &ldquo;the market went against me&rdquo; from &ldquo;I am spending my money
                    as planned&rdquo;.
                  </p>
                </div>
                <div>
                  <label className={compactLabelStyle}>Convert this much while paused</label>
                  <PercentCell
                    value={info.rothConversionGuardrailFloor ?? 0}
                    onValueChange={v => set('rothConversionGuardrailFloor', Math.min(1, Math.max(0, v)))}
                    className={compactInputStyle}
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    0% stops entirely; 50% keeps converting at half speed. Conversions resume in full once
                    the portfolio recovers past the band.
                  </p>
                </div>
              </div>
            )}
          </div>


          {/* ── Staged schedule ────────────────────────────────────────────
              One target for the whole window is the wrong shape for the
              decision: the years before Medicare reads your income are cheaper
              than the years after, and a plan that converts hard while it is
              free and throttles once it isn't could not be expressed here at
              all until now. */}
          {Array.isArray(info.rothConversionStages) && info.rothConversionStages.length > 0 && (
          <div className="mt-3 p-3 bg-slate-800/60 border border-slate-700/50 rounded-lg">
            <div className="flex items-start gap-2">
              <span>
                <span className="text-xs font-medium text-slate-200">Staged schedule</span>
                <span className="block text-[10px] text-slate-500 mt-0.5">
                  Convert to one target while your income is invisible to Medicare, then to a lower one once
                  it isn't. IRMAA reads the MAGI you reported {IRMAA_TIER_LOOKBACK_YEARS} years earlier, so
                  age {65 - IRMAA_TIER_LOOKBACK_YEARS - 1} is the last free year and {65 - IRMAA_TIER_LOOKBACK_YEARS} is
                  the first that buys a surcharge. The mode button builds that schedule from your own window; every
                  field stays editable.
                </span>
              </span>
            </div>

            {Array.isArray(info.rothConversionStages) && info.rothConversionStages.length > 0 && (() => {
              const stages = info.rothConversionStages;
              const tiers = irmaaTierOptions(info.filingStatus || 'married_joint');
              const setStage = (i, patch) => set('rothConversionStages',
                stages.map((s, j) => j === i ? { ...s, ...patch } : s));
              const targetValue = (s) => Number.isInteger(s.irmaaTier) ? `irmaa:${s.irmaaTier}`
                : s.bracket ? `bracket:${s.bracket}` : 'amount';
              const setTarget = (i, v) => {
                if (v.startsWith('irmaa:')) setStage(i, { irmaaTier: Number(v.slice(6)), bracket: '', amount: 0 });
                else if (v.startsWith('bracket:')) setStage(i, { irmaaTier: null, bracket: v.slice(8), amount: 0 });
                else setStage(i, { irmaaTier: null, bracket: '', amount: stages[i].amount || 50000 });
              };
              return (
                <div className="mt-3 space-y-2">
                  {stages.map((s, i) => (
                    <div key={i} className="flex flex-wrap items-end gap-2 p-2 bg-slate-900/60 rounded-lg border border-slate-700/40">
                      <input
                        type="text" value={s.label || `Stage ${i + 1}`}
                        onChange={e => setStage(i, { label: e.target.value })}
                        className="w-32 bg-slate-900/80 border border-slate-600/50 rounded px-2 py-1 text-slate-100 text-xs"
                      />
                      <div>
                        <label className="block text-[10px] text-slate-500">From age</label>
                        <input type="number" value={s.startAge ?? ''} onChange={e => setStage(i, { startAge: Number(e.target.value) || 0 })}
                          className="w-16 bg-slate-900/80 border border-slate-600/50 rounded px-2 py-1 text-slate-100 text-xs" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500">Through</label>
                        <input type="number" value={s.endAge ?? ''} onChange={e => setStage(i, { endAge: Number(e.target.value) || 0 })}
                          className="w-16 bg-slate-900/80 border border-slate-600/50 rounded px-2 py-1 text-slate-100 text-xs" />
                      </div>
                      <div className="flex-1 min-w-[170px]">
                        <label className="block text-[10px] text-slate-500">Convert up to</label>
                        <select value={targetValue(s)} onChange={e => setTarget(i, e.target.value)}
                          className="w-full bg-slate-900/80 border border-slate-600/50 rounded px-2 py-1 text-slate-100 text-xs">
                          <option value="bracket:22%">Top of the 22% bracket</option>
                          <option value="bracket:24%">Top of the 24% bracket</option>
                          <option value="bracket:32%">Top of the 32% bracket</option>
                          {tiers.filter(t => !t.isTop).map(t => (
                            <option key={t.index} value={`irmaa:${t.index}`}>
                              IRMAA tier {t.index} edge ({formatCurrency(t.ceiling)} MAGI)
                            </option>
                          ))}
                          <option value="amount">A fixed amount</option>
                        </select>
                      </div>
                      {!Number.isInteger(s.irmaaTier) && !s.bracket && (
                        <div>
                          <label className="block text-[10px] text-slate-500">Amount</label>
                          <CurrencyCell value={s.amount || 0} onValueChange={v => setStage(i, { amount: v })}
                            className="w-28 bg-slate-900/80 border border-slate-600/50 rounded px-2 py-1 text-slate-100 text-xs" />
                        </div>
                      )}
                      <button
                        onClick={() => set('rothConversionStages', stages.filter((_, j) => j !== i))}
                        className="text-slate-500 hover:text-red-400 text-xs px-1 pb-1" title="Remove this stage"
                      >✕</button>
                    </div>
                  ))}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => set('rothConversionStages', stages.concat([{
                        label: `Stage ${stages.length + 1}`,
                        startAge: (stages[stages.length - 1]?.endAge || info.myRetirementAge || 65) + 1,
                        endAge: getDefaultRothConversionWindow(info).endAge,
                        bracket: '22%', amount: 0, irmaaTier: null,
                      }]))}
                      className="text-xs text-purple-400 hover:text-purple-300"
                    >+ Add stage</button>
                    <button
                      onClick={() => set('rothConversionStages', irmaaAwareConversionStages(info))}
                      className="text-xs text-slate-400 hover:text-slate-200"
                    >Rebuild the IRMAA-aware schedule</button>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    A year belongs to exactly one stage — the first it falls in. Years outside every stage convert
                    nothing, and the window fields above are ignored while a schedule is set.
                  </p>
                </div>
              );
            })()}
          </div>
          )}
          <div className="mt-3 p-3 bg-purple-900/20 border border-purple-700/30 rounded-lg">
            <p className="text-xs text-purple-300 font-medium mb-1">&#128161; Roth Conversion Strategy</p>
            <p className="text-xs text-slate-400">
              Each year during the specified age range, funds are moved from the largest pre-tax account to the largest Roth account. 
              The conversion is added to your taxable income for that year. 
              Roth conversions appear as <strong className="text-purple-400">purple-highlighted rows</strong> in the Detailed Table.
              {Number.isInteger(info.rothConversionIrmaaTier)
                ? ` IRMAA-tier mode converts up to just under that MAGI edge each year, measured against the threshold for the year the surcharge is actually paid.`
                : (info.rothConversionBracket ? ` Fill-to-bracket mode converts enough each year to fully utilize the ${info.rothConversionBracket} bracket (based on other income).` : '')}
              {info.rothConversionTaxSource === 'brokerage'
                ? ' Tax on conversions is paid by withdrawing from your brokerage account, preserving pre-tax and Roth balances.'
                : ' Tax on conversions is covered by the normal withdrawal solver (using your withdrawal priority order), which may pull additional pre-tax funds.'}
              {(info.rothConversionPreTaxFloor || 0) > 0
                ? ` Conversions stop once your pre-tax balance reaches ${formatCurrency(info.rothConversionPreTaxFloor)} (today's dollars), leaving funds for QCDs and low-bracket withdrawals.`
                : ''}
              {info.rothConversionGuardrailEnabled
                ? ` The guardrail pauses conversions in any year following a portfolio return below ${Math.round((info.rothConversionGuardrailReturnFloor ?? 0) * 100)}%${(info.rothConversionGuardrailFloor ?? 0) > 0 ? `, converting at ${Math.round((info.rothConversionGuardrailFloor) * 100)}% of target instead of stopping` : ''}. It never fires on a steady-return projection — you will see it in Monte Carlo, the stress test, and the optimizer's balanced goal, which are where a bad year exists.`
                : ''}
            </p>
          </div>
    
          {/* Smart-default reset / suboptimal window warning.
              Compares the user's explicit window against the smart defaults
              (retirement age → RMD age - 1). If the user's window is significantly
              narrower than the optimal bridge years, surface a hint with a
              one-click reset. */}
          {(() => {
            const smart = getDefaultRothConversionWindow(info);
            const userStart = info.rothConversionStartAge || 0;
            const userEnd = info.rothConversionEndAge || 0;
            const usingDefaults = userStart === 0 && userEnd === 0;
            const userMatchesSmart = userStart === smart.startAge && userEnd === smart.endAge;
            const startsTooLate = userStart > 0 && userStart > smart.startAge;
            const endsTooEarly = userEnd > 0 && userEnd < smart.endAge;
            const suboptimal = (startsTooLate || endsTooEarly) && !usingDefaults && !userMatchesSmart;
      
            const resetToSmartDefaults = () => {
              set('rothConversionStartAge', smart.startAge);
              set('rothConversionEndAge', smart.endAge);
            };
      
            if (usingDefaults || userMatchesSmart) {
              return (
                <div className="mt-3 p-3 bg-emerald-900/15 border border-emerald-700/30 rounded-lg">
                  <p className="text-xs text-emerald-300">
                    ✓ Using the standard bridge-year conversion window (retirement age {smart.startAge} → year before RMDs {smart.endAge}). This is the textbook approach for maximizing cheap conversions.
                  </p>
                </div>
              );
            }
      
            if (suboptimal) {
              const userYears = userEnd - userStart + 1;
              const smartYears = smart.endAge - smart.startAge + 1;
              const missing = smartYears - userYears;
              return (
                <div className="mt-3 p-3 bg-amber-900/20 border border-amber-700/40 rounded-lg">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-xs text-amber-300 font-medium mb-1">
                        ⚠ Your conversion window may be missing {missing} year{missing !== 1 ? 's' : ''} of cheap conversion opportunities
                      </p>
                      <p className="text-xs text-slate-400">
                        Your window: ages {userStart}–{userEnd} ({userYears} year{userYears !== 1 ? 's' : ''}). 
                        Standard bridge: ages {smart.startAge}–{smart.endAge} ({smartYears} years).
                        {startsTooLate && ` You're skipping ${smart.startAge}-${userStart - 1} (after retirement, before SS or RMDs — typically lowest-bracket years).`}
                        {endsTooEarly && ` You're stopping early at ${userEnd} instead of the year before RMDs ({smart.endAge}).`}
                      </p>
                    </div>
                    <button
                      onClick={resetToSmartDefaults}
                      className="text-xs px-3 py-1 bg-amber-700/30 hover:bg-amber-700/50 border border-amber-600/50 rounded text-amber-200 font-medium whitespace-nowrap transition-colors"
                    >
                      Use {smart.startAge}–{smart.endAge}
                    </button>
                  </div>
                </div>
              );
            }
      
            // User chose a wider window than smart defaults — assume intentional, no warning
            return (
              <div className="mt-3 p-3 bg-slate-800/40 border border-slate-700 rounded-lg flex items-center justify-between gap-3">
                <p className="text-xs text-slate-400">
                  Your custom window: ages {userStart || smart.startAge}–{userEnd || smart.endAge}. 
                  Standard would be ages {smart.startAge}–{smart.endAge}.
                </p>
                <button
                  onClick={resetToSmartDefaults}
                  className="text-xs px-3 py-1 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded text-slate-300 font-medium whitespace-nowrap transition-colors"
                >
                  Reset to defaults
                </button>
              </div>
            );
          })()}
      </>) : (
        <p className="text-xs text-slate-500">
          Nothing is converted. Pick a strategy above to see what it does against converting nothing.
        </p>
      )}
    </div>
  );
}

function RothConversionSimulator({ projections, personalInfo, accounts, incomeStreams, assets, oneTimeEvents, recurringExpenses, retirementAge, computeProjections, setPersonalInfo }) {
  // Which year's rate the reader has asked to see proved. One at a time: the
  // audit is long, and the question is always about a specific year.
  const [auditAge, setAuditAge] = useState(null);

  // ── THE DRAFT ─────────────────────────────────────────────────────────────
  // The editor works on a draft of the plan's twelve conversion fields, and
  // everything this panel measures is the draft against converting nothing.
  // Nothing reaches the plan until Save — the rest of the app keeps describing
  // the saved strategy, which the panel says in words while they differ.
  //
  // This replaces a settings object of the simulator's own ({mode, startAge,
  // targetBracket, ...}) that had to be translated to and from plan fields in
  // both directions, and could only express the strategies that translation
  // knew about. The draft IS plan fields, so there is nothing to translate.
  const [draft, setDraft] = useState(() => pickRothStrategy(personalInfo));
  const setDraftField = useCallback((k, v) => setDraft(d => ({ ...d, [k]: v })), []);
  const draftPI = useMemo(() => ({ ...personalInfo, ...draft }), [personalInfo, draft]);
  const dirty = !sameRothStrategy(draftPI, personalInfo);
  // The plan can change under the draft — the optimizer's Apply, the
  // Dashboard's "Make this the plan", an import. A draft nobody has touched
  // follows it; one being edited is left alone rather than wiped.
  const planKey = JSON.stringify(pickRothStrategy(personalInfo));
  const lastPlanKey = useRef(planKey);
  useEffect(() => {
    if (planKey === lastPlanKey.current) return;
    const wasClean = JSON.stringify(draft) === lastPlanKey.current;
    lastPlanKey.current = planKey;
    if (wasClean) setDraft(JSON.parse(planKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey]);
  // The ages the with-versus-without table reads: the schedule's span when
  // staged, else the window with the engine's defaults filled in.
  const convWindow = useMemo(() => {
    const st = (Array.isArray(draftPI.rothConversionStages) ? draftPI.rothConversionStages : [])
      .filter(x => Number.isFinite(x.startAge) && Number.isFinite(x.endAge) && x.endAge >= x.startAge);
    if (st.length) return { startAge: Math.min(...st.map(x => x.startAge)), endAge: Math.max(...st.map(x => x.endAge)) };
    const dw = getDefaultRothConversionWindow(draftPI);
    return { startAge: draftPI.rothConversionStartAge || dw.startAge, endAge: draftPI.rothConversionEndAge || dw.endAge };
  }, [draftPI]);
  const [savedFlash, setSavedFlash] = useState(false);

  // ── LIFETIME RATE CURVE ────────────────────────────────────────────────────
  // One probe projection per plan year, so this runs in the worker. See
  // runMarginalRateCurve for the method and why each year is probed in
  // isolation. Debounced because the deps are object refs that change identity
  // on every parent render.
  const RATE_PROBE = 10000;
  const [curve, setCurve] = useState(null);
  const [curveStatus, setCurveStatus] = useState('idle');   // idle | running | error
  const [curveError, setCurveError] = useState(null);
  const curveJobRef = useRef(null);

  useEffect(() => {
    if (!window.PlannerWorker) {
      setCurveError('Worker not available — reload the page.');
      setCurveStatus('error');
      return;
    }
    let handle = null;
    const timer = setTimeout(() => {
      if (curveJobRef.current) { window.PlannerWorker.cancel(); curveJobRef.current = null; }
      setCurveStatus('running');
      setCurveError(null);
      handle = window.PlannerWorker.run({
        type: 'marginalRateCurve',
        payload: {
          personalInfo, accounts, incomeStreams, assets, oneTimeEvents, recurringExpenses,
          probeAmount: RATE_PROBE,
        },
      });
      curveJobRef.current = handle;
      handle.promise
        .then((data) => {
          if (curveJobRef.current !== handle) return;
          curveJobRef.current = null;
          setCurve(data.curve);
          setCurveStatus('idle');
        })
        .catch((err) => {
          if (curveJobRef.current !== handle) return;
          curveJobRef.current = null;
          if (err.message === 'Cancelled') return;
          setCurveError(err.message);
          setCurveStatus('error');
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      if (curveJobRef.current === handle && handle && window.PlannerWorker) {
        window.PlannerWorker.cancel();
        curveJobRef.current = null;
      }
    };
    // Deliberately NOT dependent on the draft: the curve is measured
    // against a no-conversion baseline, so it describes the plan's tax terrain
    // rather than any one strategy. Re-running it on every slider nudge would
    // burn ~35 projections to redraw an identical chart.
  }, [personalInfo, accounts, incomeStreams, assets, oneTimeEvents, recurringExpenses]);

  
  // Run two full projections through the unified engine:
  // 1. "With conversions" — using the simulator's conversion settings
  // 2. "Without conversions" — no Roth conversions at all
  // The difference between them IS the impact of conversions.
  const { conversionProj, baselineProj, conversionAnalysis, totals } = useMemo(() => {
    // Projection WITH the simulator's conversion settings
    const withPI = draftPI;
    const withProj = computeProjections(withPI, accounts, incomeStreams, assets, oneTimeEvents, recurringExpenses);

    // Projection WITHOUT any conversions (baseline)
    // Every mode cleared, not just amount and bracket. Clearing a subset left an
    // IRMAA tier standing, so the "without conversions" baseline still converted
    // and the entire with-versus-without comparison compared a plan to itself.
    const withoutPI = { ...withoutRothConversions(personalInfo), rothConversionPreTaxFloor: 0 };
    const withoutProj = computeProjections(withoutPI, accounts, incomeStreams, assets, oneTimeEvents, recurringExpenses);
    
    // Build year-by-year comparison for the conversion window
    const analysis = [];
    let cumulativeConversion = 0;
    let cumulativeTaxDelta = 0;
    
    for (let age = convWindow.startAge; age <= convWindow.endAge; age++) {
      const withYear = withProj.find(p => p.myAge === age);
      const withoutYear = withoutProj.find(p => p.myAge === age);
      if (!withYear || !withoutYear) continue;
      
      const conversionAmount = withYear.rothConversion || 0;
      // Priced by the engine helper so this table and the rate chart above can
      // never disagree. It charges the conversion for what it actually costs:
      // income tax, the IRMAA it triggers TWO YEARS later (not the surcharge
      // sitting in its own year, which a conversion two years back caused), and
      // any ACA premium subsidy it burns — the last of which is real money and
      // is absent from totalTax entirely.
      const cost = conversionCostComponents(withProj, withoutProj, age, conversionAmount);
      const taxDelta = cost ? cost.totalCost : 0;
      cumulativeConversion += conversionAmount;
      cumulativeTaxDelta += taxDelta;

      const effectiveRate = cost ? cost.rate : 0;

      analysis.push({
        age,
        year: withYear.year,
        // Why the headline rate is what it is. A total cannot answer "I'm in the
        // 22% bracket, so why does this say 35%?" — the split can.
        costComponents: cost,
        // Without conversions (baseline)
        baseIncome: withoutYear.totalIncome,
        baseTaxableIncome: withoutYear.taxableIncome,
        baseTotalTax: withoutYear.totalTax,
        basePreTax: withoutYear.preTaxBalance,
        baseRoth: withoutYear.rothBalance,
        basePortfolio: withoutYear.totalPortfolio,
        // With conversions
        conversionAmount,
        withTaxableIncome: withYear.taxableIncome,
        withTotalTax: withYear.totalTax,
        withPreTax: withYear.preTaxBalance,
        withRoth: withYear.rothBalance,
        withPortfolio: withYear.totalPortfolio,
        withMagi: withYear.magi,
        withIrmaa: withYear.irmaaSurcharge,
        baseIrmaa: withoutYear.irmaaSurcharge,
        // Deltas
        taxDelta,
        effectiveRate,
        costComponents: cost,
        irmaaDelta: cost ? cost.irmaaDelta : 0,
        acaSubsidyLost: cost ? cost.acaSubsidyLost : 0,
        cumulativeConversion,
        cumulativeTaxDelta,
        remainingPreTax: withYear.preTaxBalance
      });
    }
    
    // Compute lifetime totals (all years, not just conversion window)
    const allWithTax = withProj.reduce((s, p) => s + p.totalTax, 0);
    const allWithoutTax = withoutProj.reduce((s, p) => s + p.totalTax, 0);
    const endWithPortfolio = withProj[withProj.length - 1]?.totalPortfolio || 0;
    const endWithoutPortfolio = withoutProj[withoutProj.length - 1]?.totalPortfolio || 0;
    
    return {
      conversionProj: withProj,
      baselineProj: withoutProj,
      conversionAnalysis: analysis,
      totals: {
        totalConverted: cumulativeConversion,
        conversionWindowTax: cumulativeTaxDelta,
        lifetimeTaxWith: allWithTax,
        lifetimeTaxWithout: allWithoutTax,
        lifetimeTaxSavings: allWithoutTax - allWithTax,
        endPortfolioWith: endWithPortfolio,
        endPortfolioWithout: endWithoutPortfolio,
        portfolioBenefit: endWithPortfolio - endWithoutPortfolio,
        avgEffRate: cumulativeConversion > 0 ? cumulativeTaxDelta / cumulativeConversion : 0
      }
    };
  }, [personalInfo, draftPI, convWindow, accounts, incomeStreams, assets, oneTimeEvents, recurringExpenses]);

  const suggestedFloor = useMemo(() => suggestPreTaxFloor(baselineProj, personalInfo), [baselineProj, personalInfo]);

  const saveToPlan = () => {
    setPersonalInfo(prev => {
      // Only the conversion fields, and no nulls written over fields the plan
      // never had — the draft spells "absent" as null so it can be compared.
      const patch = {};
      ROTH_STRATEGY_FIELDS.forEach(k => {
        if (!(draft[k] === null && prev[k] === undefined)) patch[k] = draft[k];
      });
      return { ...prev, ...patch };
    });
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2500);
  };
  const resetToPlan = () => setDraft(pickRothStrategy(personalInfo));

  return (
    <div className={cardStyle}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h4 className="text-lg font-semibold text-slate-100">Your Roth conversion strategy</h4>
        {dirty && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/40 whitespace-nowrap">
            not saved yet
          </span>
        )}
      </div>
      <p className="text-sm text-slate-400 mb-4">
        The one place your plan's conversions are set. Change anything below and every figure in this panel
        re-runs your whole plan with that strategy and without any conversions, through the same engine as
        everything else. Nothing changes elsewhere until you save.
      </p>

      <div className="mb-4 p-4 bg-slate-800/50 rounded-lg">
        <RothStrategyFields info={draftPI} set={setDraftField} suggestedFloor={suggestedFloor} />
      </div>

      {/* Save sits beside the fields, not below a page of analysis: the
          decision is made here, and a button eight hundred pixels down is one
          people leave without pressing. */}
      <div className="mb-6 flex items-center gap-3 flex-wrap">
        <button
          onClick={saveToPlan} disabled={!dirty}
          className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${dirty
            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
            : 'bg-slate-800/40 text-slate-600 border-slate-700 cursor-not-allowed'}`}
        >
          Save to my plan
        </button>
        {dirty && (
          <button
            onClick={resetToPlan}
            className="px-4 py-2 text-sm font-medium rounded-lg text-slate-300 border border-slate-600/60 hover:bg-slate-700/50"
          >
            Discard changes
          </button>
        )}
        {savedFlash && <span className="text-sm text-emerald-400">Saved ✓ — every tab now uses this strategy.</span>}
        {dirty && !savedFlash && (
          <span className="text-xs text-amber-300/90">
            Not saved — the rest of this tab and the app still use your saved strategy
            {rothConversionIsPlanned(personalInfo) ? ` (${conversionModeLabel(personalInfo)})` : ' (no conversions)'}.
          </span>
        )}
      </div>

      {/* Summary: With vs Without */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-4 py-3">
          <div className="text-slate-500 text-xs mb-0.5">Total Converted</div>
          <div className="text-xl font-bold text-emerald-400">{formatCurrency(totals.totalConverted)}</div>
          <div className="text-xs text-slate-500">
            {totals.totalConverted > 0
              ? `${conversionAnalysis.filter(r => r.conversionAmount > 0).length} years`
              : 'no conversions'}
          </div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-4 py-3">
          <div className="text-slate-500 text-xs mb-0.5">Cost During Conversions</div>
          <div className="text-xl font-bold text-red-400">+{formatCurrency(totals.conversionWindowTax)}</div>
          <div className="text-xs text-slate-500">Avg {(totals.avgEffRate * 100).toFixed(1)}% per $ converted</div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-4 py-3">
          <div className="text-slate-500 text-xs mb-0.5">Lifetime Tax Savings</div>
          <div className={`text-xl font-bold ${totals.lifetimeTaxSavings >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {totals.lifetimeTaxSavings >= 0 ? '' : '−'}{formatCurrency(Math.abs(totals.lifetimeTaxSavings))}
          </div>
          <div className="text-xs text-slate-500">Without: {formatCurrency(totals.lifetimeTaxWithout)} → With: {formatCurrency(totals.lifetimeTaxWith)}</div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-4 py-3">
          <div className="text-slate-500 text-xs mb-0.5">Portfolio at End</div>
          <div className={`text-xl font-bold ${totals.portfolioBenefit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {totals.portfolioBenefit >= 0 ? '+' : '−'}{formatCurrency(Math.abs(totals.portfolioBenefit))}
          </div>
          <div className="text-xs text-slate-500">{formatCurrency(totals.endPortfolioWith)} vs {formatCurrency(totals.endPortfolioWithout)}</div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-4 py-3">
          <div className="text-slate-500 text-xs mb-0.5">Pre-Tax Remaining</div>
          <div className="text-xl font-bold text-amber-400">{formatCurrency(conversionAnalysis[conversionAnalysis.length - 1]?.remainingPreTax || 0)}</div>
          <div className="text-xs text-slate-500">Age {convWindow.endAge}</div>
        </div>
      </div>
      
      {/* ═══════════════════════════════════════════════════════════════════
          LIFETIME TAX RATE CURVE
          Why the per-year cost below reads higher than the bracket: the gap
          between the "cost of converting" line and the "tax bracket" line IS
          the answer, drawn across the whole plan rather than argued in prose.
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 mb-1">
          <h5 className="text-md font-semibold text-slate-200">Your tax rate across the whole plan</h5>
          {curveStatus === 'running' && <span className="text-xs text-sky-400 whitespace-nowrap">computing…</span>}
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Working years included, so you can see the years you are trading between. Converting is worth it
          when the orange line sits <strong className="text-slate-300">lower</strong> than it does in the years
          you would otherwise pull that money out — typically your RMD years on the right.
        </p>

        {curveStatus === 'error' ? (
          <div className="p-3 bg-red-900/30 border border-red-700/50 rounded-lg text-sm text-red-300">
            Could not compute the rate curve: {curveError}
          </div>
        ) : !curve ? (
          <div className="h-80 flex items-center justify-center text-slate-500 text-sm">
            Running one probe conversion per plan year…
          </div>
        ) : (
          <>
            <div style={chartBox(320)}>
              <ResponsiveContainer width="100%" height="100%">
                {(() => { const iBracket = lastDefinedIndex(curve, 'bracket'),
                                iEff = lastDefinedIndex(curve, 'effectiveRate'),
                                iMarg = lastDefinedIndex(curve, 'marginalRate');
                  // An IRMAA cliff year can cost >100%, which is real but would
                  // stretch the axis until the other 35 years are a flat smear
                  // along the bottom. Clamp to the 90th percentile (floor 60%)
                  // and let the cliff render as a capped marker — it keeps its
                  // true value in the tooltip and its own label, so nothing is
                  // hidden, but one year stops costing every other year its
                  // vertical resolution.
                  const rates = curve.map(r => r.marginalRate).filter(v => v !== null && v !== undefined).sort((a, b) => a - b);
                  const p90 = rates.length ? rates[Math.floor(rates.length * 0.9)] : 0.6;
                  const yMax = Math.max(0.6, Math.ceil(p90 * 10) / 10);
                  const clipped = curve.map(r => ({
                    ...r,
                    marginalRatePlot: r.marginalRate === null ? null : Math.min(r.marginalRate, yMax),
                    overCap: r.marginalRate !== null && r.marginalRate > yMax,
                  }));
                  const capped = clipped.filter(r => r.overCap);
                  return (
                <LineChart data={clipped} margin={{ top: 20, right: 96, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={THEME.grid} />
                  <XAxis dataKey="age" stroke={THEME.axis} tick={{ fill: THEME.axis }} />
                  {/* One axis: every series is a percentage. */}
                  <YAxis
                    stroke={THEME.axis} tick={{ fill: THEME.axis }}
                    tickFormatter={v => `${(v * 100).toFixed(0)}%`}
                    domain={[0, yMax]}
                    allowDataOverflow
                  />
                  <Tooltip content={<RateCurveTooltip probeAmount={RATE_PROBE} />} />
                  <Legend formatter={legendInk} />
                  {/* The strategy's own window, so the plan can be read against
                      the terrain it is operating on. */}
                  <ReferenceArea
                    x1={convWindow.startAge} x2={convWindow.endAge}
                    fill="#38bdf8" fillOpacity={0.07} stroke="#38bdf8" strokeOpacity={0.25}
                    label={{ value: 'your conversion window', fill: THEME.inkSecondary, fontSize: 11, position: 'insideTop' }}
                  />
                  {/* Fixed-order categorical slots, validated against this
                      surface. Dashed bracket line doubles as the secondary
                      encoding that keeps it distinguishable without color. */}
                  <Line
                    type="monotone" dataKey="bracket" name="Tax bracket"
                    stroke={SERIES.otherIncome} strokeWidth={2} strokeDasharray="5 4" dot={false}
                    label={lastPointLabel('bracket', THEME.ink.otherIncome, iBracket)}
                  />
                  <Line
                    type="monotone" dataKey="effectiveRate" name="Average rate you pay"
                    stroke={SERIES.socialSecurity} strokeWidth={2} dot={false}
                    label={lastPointLabel('average', THEME.ink.socialSecurity, iEff)}
                  />
                  <Line
                    type="monotone" dataKey="marginalRatePlot" name={`Cost of converting $${(RATE_PROBE / 1000).toFixed(0)}k more`}
                    stroke={SERIES.pension} strokeWidth={2} dot={false} connectNulls={false}
                    label={lastPointLabel('conversion', THEME.ink.pension, iMarg)}
                  />
                  {/* Capped years: mark them and print the true value, so a
                      clamped axis never silently understates a cliff. */}
                  {capped.map(r => (
                    <ReferenceDot
                      key={`cap-${r.age}`} x={r.age} y={yMax} r={5}
                      fill={SERIES.pension} stroke={THEME.surfaceRaised} strokeWidth={2}
                      label={{ value: `${(r.marginalRate * 100).toFixed(0)}%`, position: 'top', fill: '#fb923c', fontSize: 11 }}
                    />
                  ))}
                </LineChart>
                ); })()}
              </ResponsiveContainer>
            </div>
            {(() => {
              // Name the gap in words as well as pixels — the chart shows THAT
              // conversions cost more than the bracket; this says by how much,
              // and confirms whether the bridge years are actually the cheap
              // ones this plan should be exploiting.
              const usable = curve.filter(r => r.marginalRate !== null);
              if (usable.length === 0) return null;
              const avgGap = usable.reduce((s, r) => s + (r.marginalRate - r.bracket), 0) / usable.length;
              const inWindow = usable.filter(r => r.age >= convWindow.startAge && r.age <= convWindow.endAge);
              const rmdAge = getRmdStartAge(personalInfo.myBirthYear);
              const afterRmd = usable.filter(r => r.age >= rmdAge);
              const avg = (a) => a.length ? a.reduce((s, r) => s + r.marginalRate, 0) / a.length : null;
              const win = avg(inWindow), late = avg(afterRmd);
              const cheapest = usable.reduce((b, r) => r.marginalRate < b.marginalRate ? r : b);
              return (
                <div className="mt-3 p-3 bg-slate-800/50 border border-slate-700 rounded-lg text-xs space-y-1.5">
                  <p className="text-slate-300">
                    Across your plan, converting costs on average{' '}
                    <strong className="text-orange-300">{(avgGap * 100).toFixed(1)} points more</strong> than your tax
                    bracket. That gap is not a mistake — a conversion dollar also drags Social Security into
                    taxability, stacks capital gains into a higher rate, and can trip IRMAA two years later.
                  </p>
                  {win !== null && late !== null && (
                    <p className={win < late ? 'text-emerald-300' : 'text-amber-300'}>
                      {win < late
                        ? `Your window (ages ${convWindow.startAge}–${convWindow.endAge}) averages ${(win * 100).toFixed(1)}% versus ${(late * 100).toFixed(1)}% from age ${rmdAge} on — you are converting in the cheaper years, which is the whole idea.`
                        : `Your window averages ${(win * 100).toFixed(1)}%, but from age ${rmdAge} on it is ${(late * 100).toFixed(1)}% — converting is not currently buying you a lower rate. Check the window against the dip in the orange line.`}
                    </p>
                  )}
                  <p className="text-slate-500">
                    Cheapest year to convert: <strong className="text-slate-300">age {cheapest.age}</strong> at{' '}
                    {(cheapest.marginalRate * 100).toFixed(1)}%. Gaps in the orange line are years with no pre-tax
                    balance left to convert.
                  </p>
                  {/* Medicare cliff proximity. This is the usual explanation for a
                      spike, and it is information about the YEAR rather than about
                      converting — any extra income trips it. Descriptive only. */}
                  {(() => {
                    const NEAR = 15000;
                    const tight = curve.filter(r => r.cliffHeadroom !== null && r.cliffHeadroom !== undefined && r.cliffHeadroom < NEAR);
                    if (!tight.length) return null;
                    return (
                      <p className="text-amber-300/90 pt-1.5 border-t border-slate-700">
                        <span className="font-medium">Close to a Medicare surcharge tier:</span>{' '}
                        {tight.map(r => `age ${r.age} (${formatCurrency(r.cliffHeadroom)} of room)`).join(', ')}.
                        IRMAA is a cliff, not a bracket — crossing it by a dollar costs the whole surcharge, per person,
                        for a full year, and it lands two years later. In {tight.length === 1 ? 'that year' : 'those years'}{' '}
                        <em>any</em> extra income trips it, not just a Roth conversion.
                      </p>
                    );
                  })()}
                </div>
              );
            })()}
          </>
        )}
      </div>

      {/* Chart */}
      <div className="mb-6">
        <h5 className="text-md font-semibold text-slate-200 mb-3">Income + Conversions vs. Baseline</h5>
        <div style={chartBox(320)}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={conversionAnalysis} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={THEME.grid} />
              <XAxis dataKey="age" stroke={THEME.axis} tick={{ fill: THEME.axis }} />
              <YAxis stroke={THEME.axis} tick={{ fill: THEME.axis }} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
              <Tooltip 
                contentStyle={{ backgroundColor: THEME.surfaceRaised, border: `1px solid ${THEME.grid}`, borderRadius: '8px' }} 
                formatter={(v, name) => [formatCurrency(v), name]}
                labelFormatter={l => `Age ${l}`}
              />
              <Legend formatter={legendInk} />
              {/* Base income is the backdrop and the conversion is the subject, so base takes
                  the recessive baseline token rather than a series hue that would claim it
                  is one particular kind of income — and the previous pairing, Social
                  Security blue against conversion violet, was ΔE 1.9 under deuteranopia.
                  The two tax lines are the SAME quantity under two scenarios: the
                  counterfactual muted and dashed, the actual solid, so the pair reads as
                  before/after rather than as two unrelated series. */}
              <Bar dataKey="baseIncome" stackId="income" fill={THEME.baseline} name="Base Income" />
              <Bar dataKey="conversionAmount" stackId="income" fill={SERIES.rothConversion} name="Roth Conversion" />
              <Line type="monotone" dataKey="baseTotalTax" stroke={THEME.inkMuted} strokeWidth={2} dot={false} name="Tax Without Conv." strokeDasharray="5 5" />
              <Line type="monotone" dataKey="withTotalTax" stroke={THEME.lines.taxBurden} strokeWidth={2} dot={false} name="Tax With Conv." />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      {/* Year-by-Year Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left py-2 px-2 text-slate-400 font-medium">Age</th>
              <th className="text-right py-2 px-2 text-slate-400 font-medium">Base Income</th>
              <th className="text-right py-2 px-2 text-slate-400 font-medium">Conversion</th>
              <th className="text-right py-2 px-2 text-slate-400 font-medium">Tax (no conv)</th>
              <th className="text-right py-2 px-2 text-slate-400 font-medium">Tax (w/ conv)</th>
              <th className="text-right py-2 px-2 text-slate-400 font-medium">Total Cost</th>
              <th className="text-right py-2 px-2 text-slate-400 font-medium" title="What each converted dollar costs, all in: income tax plus the IRMAA it triggers two years later plus any ACA subsidy it burns. This is a marginal rate on the converted dollars — it is expected to sit ABOVE your tax bracket, and hovering a row shows why.">
                Cost per $ Converted <span className="text-slate-500" title="All-in: income tax, the IRMAA it triggers two years later, and any ACA subsidy it burns. Hover a figure for the breakdown.">ⓘ</span>
              </th>
              <th className="text-right py-2 px-2 text-slate-400 font-medium">IRMAA Δ</th>
              <th className="text-right py-2 px-2 text-slate-400 font-medium">Cumulative</th>
              <th className="text-right py-2 px-2 text-slate-400 font-medium">Pre-Tax Left</th>
            </tr>
          </thead>
          <tbody>
            {conversionAnalysis.map((row, idx) => (
              <tr key={row.age} className={`border-b border-slate-700/50 ${idx % 2 === 0 ? 'bg-slate-800/30' : ''}`}>
                <td className="py-2 px-2 text-slate-300 font-medium">
                  {row.conversionAmount > 0 ? (
                    <button
                      onClick={() => setAuditAge(auditAge === row.age ? null : row.age)}
                      className={`underline decoration-dotted underline-offset-2 hover:text-amber-400 transition-colors ${auditAge === row.age ? 'text-amber-400' : ''}`}
                      title="Show every figure this year's rate is built from"
                    >{row.age}</button>
                  ) : row.age}
                </td>
                <td className="py-2 px-2 text-right text-slate-400">{formatCurrency(row.baseIncome)}</td>
                <td className="py-2 px-2 text-right text-emerald-400 font-semibold">
                  {row.conversionAmount > 0 ? formatCurrency(row.conversionAmount) : '—'}
                </td>
                <td className="py-2 px-2 text-right text-slate-400">{formatCurrency(row.baseTotalTax)}</td>
                <td className="py-2 px-2 text-right text-amber-400">{formatCurrency(row.withTotalTax)}</td>
                <td className="py-2 px-2 text-right text-red-400">
                  {row.taxDelta > 0 ? '+' : ''}{formatCurrency(row.taxDelta)}
                </td>
                {/* Hover decomposes the rate, so a number above the bracket
                    reads as an explanation rather than an accusation. */}
                <td
                  className="py-2 px-2 text-right text-amber-400"
                  title={row.costComponents ? (() => {
                    const c = row.costComponents;
                    const f = c.federalRatePoints, d = c.federalBreakdown;
                    const line = (label, dollars, pts) =>
                      `  ${label.padEnd(30)}${formatCurrency(dollars).padStart(10)}   ${(pts * 100).toFixed(1).padStart(5)} pts`;
                    const out = [
                      `Converted ${formatCurrency(c.converted)} — all-in cost ${(c.rate * 100).toFixed(1)}%`,
                      '',
                      line('Ordinary tax on it', d.ordinary, f.ordinary),
                    ];
                    // Usually the second-largest line and the one nobody expects:
                    // paying the tax from pre-tax money means withdrawing more,
                    // and that withdrawal is ordinary income too.
                    if (Math.abs(d.taxDraw) > 1) {
                      out.push(line('Tax on the tax-paying draw', d.taxDraw, f.taxDraw));
                      out.push(`      (+${formatCurrency(d.taxDrawOrdinary)} withdrawn to pay the bill)`);
                    }
                    // Each of these is a real reason the figure sits above the
                    // bracket, and each is invisible unless it is named.
                    // Always stated, even at zero. "Why is my SS being taxed
                    // again when my spending already maxes it out?" is only
                    // answerable if the before/after share is on screen — and
                    // when it reads 85.0% -> 85.0% the charge is visibly zero.
                    const sh = (v) => (v === null || v === undefined ? '—' : (v * 100).toFixed(1) + '%');
                    if (Math.abs(d.ssTorpedo) > 1) {
                      out.push(line('Social Security torpedo', d.ssTorpedo, f.ssTorpedo));
                      out.push(`      SS taxable ${sh(d.ssTaxableShareBefore)} -> ${sh(d.ssTaxableShareAfter)}`);
                      out.push(`      (+${formatCurrency(d.ssMadeTaxable)} newly taxable — only this is charged)`);
                    } else if (d.ssTaxableShareBefore !== null && d.ssTaxableShareBefore > 0) {
                      out.push(`  Social Security torpedo              $0`);
                      out.push(`      SS taxable ${sh(d.ssTaxableShareBefore)} -> ${sh(d.ssTaxableShareAfter)}, so nothing is charged`);
                    }
                    if (Math.abs(d.deductionPhaseout) > 1) {
                      out.push(line('Senior deduction lost', d.deductionPhaseout, f.deductionPhaseout));
                      out.push(`      (${formatCurrency(d.deductionLost)} of deduction phased out at 6%/$)`);
                    }
                    if (Math.abs(d.preferential) > 1) {
                      out.push(line('Capital gains / NIIT', d.preferential, f.preferential));
                    }
                    if (Math.abs(c.stateDelta) > 1) out.push(line('State tax', c.stateDelta, f.state));
                    if (Math.abs(c.irmaaDelta) > 1) {
                      out.push(line(`IRMAA at age ${row.age + 2}`, c.irmaaDelta, c.ratePoints.irmaa));
                    }
                    if (Math.abs(c.acaSubsidyLost) > 1) {
                      out.push(line('ACA subsidy lost', c.acaSubsidyLost, c.ratePoints.aca));
                    }
                    out.push('  ' + '-'.repeat(48));
                    out.push(line('Total', c.totalCost, c.rate));
                    out.push('');
                    out.push('The ordinary line is usually BELOW your headline bracket:');
                    out.push('filling TO the top of a bracket taxes the early dollars lower.');
                    out.push('Everything under it is why the total lands above it.');
                    return out.join('\n');
                  })() : undefined}
                >
                  {row.conversionAmount > 0 ? `${(row.effectiveRate * 100).toFixed(1)}%` : '—'}
                </td>
                <td className={`py-2 px-2 text-right ${row.irmaaDelta > 0 ? 'text-pink-400' : 'text-slate-500'}`}>
                  {row.irmaaDelta > 0 ? '+' + formatCurrency(row.irmaaDelta) : '—'}
                </td>
                <td className="py-2 px-2 text-right text-purple-400">{formatCurrency(row.cumulativeConversion)}</td>
                <td className="py-2 px-2 text-right" style={{ color: SERIES.preTax }}>{formatCurrency(row.remainingPreTax)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-600 bg-slate-800/50">
              <td className="py-3 px-2 text-slate-300 font-semibold">Total</td>
              <td></td>
              <td className="py-3 px-2 text-right text-emerald-400 font-bold">{formatCurrency(totals.totalConverted)}</td>
              <td></td>
              <td></td>
              <td className="py-3 px-2 text-right text-red-400 font-bold">+{formatCurrency(totals.conversionWindowTax)}</td>
              <td className="py-3 px-2 text-right text-amber-400 font-bold">{(totals.avgEffRate * 100).toFixed(1)}%</td>
              <td></td>
              <td></td>
              <td className="py-3 px-2 text-right font-bold" style={{ color: SERIES.preTax }}>{formatCurrency(conversionAnalysis[conversionAnalysis.length - 1]?.remainingPreTax || 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── SHOW THE MATH ──────────────────────────────────────────────────
          The rate is a difference between two full projections, which makes it
          correct and completely unverifiable by eye. This lays out every figure
          it is built from, in the order it is used, with the two scenarios side
          by side — so the number can be reproduced on paper rather than taken on
          trust. The reconciliation checks are shown, pass or fail. */}
      {auditAge !== null && (() => {
        const amt = (conversionAnalysis.find(r => r.age === auditAge) || {}).conversionAmount || 0;
        const a = conversionCostAudit(conversionProj, baselineProj, auditAge, amt);
        if (!a) return null;
        const pct = (n) => ((n / a.converted) * 100).toFixed(1) + '%';
        const rowsOf = [
          ['Adjusted gross income', 'agi'],
          ['  of which preferential (gains + qualified dividends)', 'preferential'],
          ['Standard deduction', 'deduction'],
          ['Ordinary taxable income (the bracket walk runs on this)', 'ordinaryTaxable'],
          ['Social Security received', 'socialSecurity'],
          ['  taxable portion', 'taxableSS'],
          ['MAGI (what IRMAA is measured on)', 'magi'],
          ['Federal tax', 'federalTax'],
          ['State tax', 'stateTax'],
          ['ACA premium subsidy', 'acaSubsidy'],
        ];
        return (
          <div className="mt-4 p-4 bg-slate-900/70 border border-amber-500/30 rounded-xl">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h5 className="text-base font-semibold text-amber-400">Showing the math — age {a.myAge} ({a.year})</h5>
                <p className="text-xs text-slate-400 mt-0.5">
                  Converted {formatCurrency(a.converted)} · quoted cost{' '}
                  <strong className="text-amber-400">{(a.rate * 100).toFixed(1)}%</strong> · statutory bracket {(a.bracket * 100).toFixed(0)}%
                </p>
              </div>
              <button onClick={() => setAuditAge(null)} className="text-xs text-slate-400 hover:text-slate-200">Close ✕</button>
            </div>

            <div className="overflow-x-auto mb-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-1.5 px-2 text-slate-400 font-medium">The same year, both ways</th>
                    <th className="text-right py-1.5 px-2 text-slate-400 font-medium">No conversion</th>
                    <th className="text-right py-1.5 px-2 text-slate-400 font-medium">With conversion</th>
                    <th className="text-right py-1.5 px-2 text-slate-400 font-medium">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsOf.map(([label, key]) => {
                    const o = a.withoutConversion[key], w = a.withConversion[key];
                    if (o === 0 && w === 0) return null;
                    return (
                      <tr key={key} className="border-b border-slate-800">
                        <td className={`py-1 px-2 ${label.startsWith('  ') ? 'text-slate-500 pl-6' : 'text-slate-300'}`}>{label.trim()}</td>
                        <td className="py-1 px-2 text-right text-slate-400">{formatCurrency(o)}</td>
                        <td className="py-1 px-2 text-right text-slate-300">{formatCurrency(w)}</td>
                        <td className={`py-1 px-2 text-right font-medium ${w - o > 0 ? 'text-amber-400' : w - o < 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {w - o === 0 ? '—' : (w - o > 0 ? '+' : '−') + formatCurrency(Math.abs(w - o))}
                        </td>
                      </tr>
                    );
                  })}
                  {a.lag && (
                    <tr className="border-b border-slate-800">
                      <td className="py-1 px-2 text-slate-300">
                        Medicare IRMAA surcharge in {a.lag.withConversion.year}
                        <span className="text-slate-500"> (two years on — this year&rsquo;s MAGI sets it)</span>
                      </td>
                      <td className="py-1 px-2 text-right text-slate-400">{formatCurrency(a.lag.withoutConversion.irmaa)}</td>
                      <td className="py-1 px-2 text-right text-slate-300">{formatCurrency(a.lag.withConversion.irmaa)}</td>
                      <td className="py-1 px-2 text-right font-medium text-amber-400">
                        {a.lag.withConversion.irmaa - a.lag.withoutConversion.irmaa === 0 ? '—'
                          : '+' + formatCurrency(a.lag.withConversion.irmaa - a.lag.withoutConversion.irmaa)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-1.5 px-2 text-slate-400 font-medium">How the cost is built</th>
                    <th className="text-right py-1.5 px-2 text-slate-400 font-medium">Amount</th>
                    <th className="text-right py-1.5 px-2 text-slate-400 font-medium">Of the amount converted</th>
                  </tr>
                </thead>
                <tbody>
                  {a.steps.map(st => (
                    <tr key={st.key} className={`border-b border-slate-800 ${st.kind === 'total' ? 'bg-amber-500/5' : st.kind === 'subtotal' ? 'bg-slate-800/40' : ''}`}>
                      <td className="py-1.5 px-2">
                        <div className={st.kind === 'total' ? 'text-amber-400 font-semibold' : st.kind === 'subtotal' ? 'text-slate-200 font-medium' : 'text-slate-300'}>{st.label}</div>
                        <div className="text-[11px] text-slate-500 leading-relaxed mt-0.5">{st.detail}</div>
                      </td>
                      <td className={`py-1.5 px-2 text-right whitespace-nowrap ${st.kind === 'total' ? 'text-amber-400 font-bold' : st.amount === 0 ? 'text-slate-500' : 'text-slate-200'}`}>{formatCurrency(st.amount)}</td>
                      <td className={`py-1.5 px-2 text-right whitespace-nowrap ${st.kind === 'total' ? 'text-amber-400 font-bold' : 'text-slate-500'}`}>{pct(st.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-800">
              {a.checks.map((chk, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] py-0.5">
                  <span className={chk.ok ? 'text-emerald-400' : 'text-red-400'}>{chk.ok ? '✓' : '✗'}</span>
                  <span className="text-slate-400">{chk.label}</span>
                </div>
              ))}
              <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                Every figure above comes from the two projections themselves — the same plan run twice,
                identical but for this conversion. Nothing here is an estimate layered on top. If a line
                disagrees with your own arithmetic, that line is where to look.
              </p>
            </div>
          </div>
        );
      })()}

      <div className="mt-4 p-3 bg-blue-900/20 border border-blue-800/30 rounded-lg">
        <p className="text-xs text-blue-300">
          <strong>How this works:</strong> This panel runs your complete financial plan twice through the projection engine — once with the conversion settings above, once without any conversions. 
          Every number reflects the full tax model: SS re-taxation, IRMAA surcharges, state taxes, withdrawal solver adjustments, and portfolio growth differences. 
          "Lifetime Tax Savings" is the total tax difference across ALL years (not just the conversion window) — conversions pay more tax now but reduce RMDs and taxes later.
          "Portfolio at End" shows the total portfolio difference at age {personalInfo.legacyAge || 95}, reflecting tax-free Roth growth vs. taxable pre-tax growth.
        </p>
      </div>
    </div>
  );
}

